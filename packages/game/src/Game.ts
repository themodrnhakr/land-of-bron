import { type LongFormMove, type MoveMap } from "boardgame.io";
import { INVALID_MOVE } from "boardgame.io/core";
import { Context, Effect, Layer, Option, Result, Schema } from "effect";
import * as BoardGeneration from "./BoardGeneration.ts";
import * as Cards from "./Cards.ts";
import * as Coords from "./Coords.ts";
import type { MoveContext, MoveDefinition, MoveMetadata } from "./Moves.ts";
import { MOVES } from "./Moves.ts";
import * as Nation from "./Nation.ts";
import { type Color, colorSchema } from "./Nation.ts";
import * as Random from "./Random.ts";
import * as Setup from "./Setup.ts";
import * as State from "./State.ts";
import { type GameEvent, type Phase, State as GameState } from "./State.ts";
import * as Terrain from "./Terrain.ts";
import * as Tile from "./Tile.ts";
import * as View from "./View.ts";

// The palette for up to 7 nations (matches the generator's structural cap).
const NATION_COLORS = ["red", "orange", "yellow", "green", "blue", "indigo", "violet"] as const;

// ============================================================================
// Move bridge (registries -> boardgame.io `moves`)
// ============================================================================

const toParamRecord = (params: unknown): Record<string, unknown> =>
  typeof params === "object" && params !== null ? params as Record<string, unknown> : {};

const eventAt = (params: unknown): Option.Option<Coords.Coords> => {
  const decoded = Schema.decodeUnknownResult(Coords.coordsSchema)(toParamRecord(params).at);
  return Result.isFailure(decoded) ? Option.none() : Option.some(decoded.success);
};

const eventTarget = (params: unknown): Option.Option<Color> => {
  const decoded = Schema.decodeUnknownResult(colorSchema)(toParamRecord(params).target);
  return Result.isFailure(decoded) ? Option.none() : Option.some(decoded.success);
};

/**
 * Append the move's `GameEvent` to the replayable log (Phase 3 step 2). Every
 * successful move goes through here, so `state.events` is complete by
 * construction — mandates and reactions both read it.
 */
const appendEvent = (
  state: State.State,
  name: string,
  def: MoveMetadata,
  actor: Color,
  turn: number,
  params: unknown,
): State.State => {
  const event: GameEvent = {
    seq: state.events.length,
    move: name,
    categories: [...def.categories],
    tags: [...(def.tags ?? [])],
    actor,
    at: eventAt(params),
    target: eventTarget(params),
    params: toParamRecord(params),
    turn,
  };
  return new GameState({ ...state, events: [...state.events, event] });
};

/**
 * Turn one `MoveDefinition` into a boardgame.io long-form move. There is no
 * `validateMove` field in boardgame.io 0.50, so `canApply` is consulted inside
 * the move body and `INVALID_MOVE` is returned when it (or param decoding)
 * fails. `G` is decoded on the way in and re-encoded on the way out (D40).
 */
const buildMove = (name: string, def: MoveDefinition<never>): LongFormMove<State.StateEncoded, {}> => ({
  move: ({ G, ctx, playerID }, ...args) => {
    const state = State.decodeUnknown(G);
    const actor = View.colorForPlayerId(state, playerID ?? null);
    if (actor === null) return INVALID_MOVE;
    const decoded = Schema.decodeUnknownResult(def.params)(args[0] ?? {});
    if (Result.isFailure(decoded)) return INVALID_MOVE;
    const params = decoded.success;
    const moveCtx: MoveContext = { state, actor, turn: ctx.turn, phase: ctx.phase as Phase };
    const legal = def.canApply(moveCtx, params);
    if (Result.isFailure(legal) || !legal.success) return INVALID_MOVE;
    const applied = def.apply(moveCtx, params);
    if (Result.isFailure(applied)) return INVALID_MOVE;
    return State.encode(appendEvent(applied.success.state, name, def, actor, ctx.turn, params));
  },
});

/** The boardgame.io move map built from the code-side `MOVES` registry. */
export const buildMoves = (moves: typeof MOVES): MoveMap<State.StateEncoded, {}> => {
  const out: Record<string, LongFormMove<State.StateEncoded, {}>> = {};
  for (const [name, def] of Object.entries(moves)) {
    out[name] = buildMove(name, def as unknown as MoveDefinition<never>);
  }
  return out;
};

// ============================================================================
// Turn / phase config
// ============================================================================

/** End-of-turn cleanup: every nation's `playArea` is cleared. */
const clearPlayAreas = (state: State.StateEncoded): State.StateEncoded => ({
  ...state,
  nations: state.nations.map((nation) => ({ ...nation, playArea: [] })),
});

// ============================================================================
// Service
// ============================================================================

export class Service extends Context.Service<Service, {
  readonly make: (
    config: State.Config,
  ) => import("boardgame.io").Game<State.StateEncoded, {}, Setup.SetupOptions>;
}>()("GameService") {}

/** The game service, requiring a `CardCatalog` and a `TerrainCatalog`. */
export const ServiceLive = Layer.effect(
  Service,
  Effect.gen(function*() {
    const cards = yield* Cards.CardCatalog;
    const terrain = yield* Terrain.TerrainCatalog;

    const make = (
      config: State.Config,
    ): import("boardgame.io").Game<State.StateEncoded, {}, Setup.SetupOptions> => ({
      name: config.name,
      minPlayers: config.minPlayers,
      maxPlayers: config.maxPlayers,
      // Reject bad setup data before the match is even created.
      validateSetupData: (data): string | undefined => {
        const decoded = Setup.decodeSetupOptions(data);
        return Result.isFailure(decoded) ? Setup.formatSetupError(decoded.failure) : undefined;
      },
      setup: ({ ctx }, data) => {
        // Decode again (never trust the validation pass alone).
        const decoded = Setup.decodeSetupOptions(data);
        if (Result.isFailure(decoded)) {
          throw new Error("Invalid setup options: " + Setup.formatSetupError(decoded.failure));
        }
        const opts = decoded.success;
        // 1. Generate the board from the resolved options. Seats come from
        //    match creation (ctx.numPlayers), never from setup data. The layout
        //    stays seeded from `setupData.seed`, not the `random` plugin, so a
        //    match is reproducible from one number (D29/D40).
        const result = BoardGeneration.generateCoords({
          playerCount: ctx.numPlayers,
          strategy: opts.strategy,
          seed: opts.seed,
          target: opts.target,
          noisePoolFraction: opts.noisePoolFraction,
          seedRingDist: opts.seedRingDist,
          growthCap: opts.growthCap,
        });
        if (result._tag === "Failure") {
          throw new Error("Board generation failed: " + result.failure._tag);
        }
        // 2. Terrain selection (D23): each nation draws `target` terrain ids
        //    from its own weighted pool (without replacement) and places them
        //    randomly on its coords. The pool must cover the target.
        const poolSize = Terrain.terrainPoolSize(terrain);
        if (poolSize < opts.target) {
          throw new Error(`terrain pool (${poolSize}) is smaller than target (${opts.target})`);
        }
        const colors = NATION_COLORS.slice(0, ctx.numPlayers);
        const tiles: Tile.Tile[] = [];
        result.success.forEach((territory, id) => {
          const color = colors[id]!;
          const draw = Random.weightedDraw(
            terrain.nation,
            (t) => t.tileCount,
            opts.target,
            Random.nationSeed(opts.seed, id),
          );
          const [drawn] = Random.shuffle(draw.picked, draw.nextSeed);
          territory.forEach((coords, i) => {
            const def = drawn[i] ?? terrain.nation[0]!;
            tiles.push(Tile.fromCoords(coords, color, def.id));
          });
        });
        for (const c of BoardGeneration.neutralCoords(result.success)) {
          tiles.push(Tile.fromCoords(c, undefined, Terrain.BORDER_TERRAIN_IDS[0]));
        }
        // 3. One nation per player, with the configured supplies and names, one
        //    embassy per other nation (D22), and a mat slot per catalog domain.
        const slots = cards.catalog.domains.map((d) => ({ domain: d.id, chit: Option.none<string>() }));
        const nations = colors.map((color, id) => {
          const nation = Nation.makeNation(
            color,
            opts.nationNames[id] ?? "Nation " + (id + 1),
            opts.pieceLimits,
            colors,
          );
          return { ...nation, mat: { ...nation.mat, slots } };
        });
        // 4. Wire up state, pinned to the loaded catalog and terrain config,
        //    and encode it to the framework's plain-JSON form (D40).
        return State.encode(
          State.make(
            tiles,
            nations,
            { version: cards.catalog.version, hash: cards.hash },
            terrain.pin,
          ),
        );
      },
      // 5. Moves: the whole code-side registry, bridged to boardgame.io.
      moves: buildMoves(MOVES),
      // 6. Turn/phase: a single "action" phase, one move per turn, and the
      //    end-of-turn playArea cleanup in `onEnd`. The concrete move counts
      //    are a Phase 4 rules question.
      phases: {
        action: { start: true },
      },
      turn: {
        minMoves: 0,
        maxMoves: 1,
        onEnd: ({ G }) => clearPlayAreas(G),
      },
      // 7. Win condition: mandates do NOT end the game (D6/D11). The real
      //    end-of-game trigger is undecided (open question 8), so this hook is
      //    the seam and currently never ends the game.
      endIf: () => undefined,
      // 8. Hidden information (D11): redact per viewer, then re-encode (D40).
      playerView: ({ G, playerID }) => {
        const state = State.decodeUnknown(G);
        return State.encode(View.redactForViewer(state, View.colorForPlayerId(state, playerID)));
      },
    });

    return { make };
  }),
);

/** Dev layer: the game service with an empty catalog and the default terrain. */
export const ServiceDev = Layer.provide(
  ServiceLive,
  Layer.merge(
    Cards.CardCatalogFixture(Cards.emptyCatalog),
    Terrain.TerrainCatalogFixture(Terrain.DEFAULT_TERRAIN_TABLE),
  ),
);

/** Build a game directly from the dev layer (tests, tooling). */
export const makeDevGame = (config: State.Config) => {
  const program = Effect.gen(function*() {
    const service = yield* Service;
    return service.make(config);
  });
  return Effect.runSync(Effect.provide(program, ServiceDev));
};
