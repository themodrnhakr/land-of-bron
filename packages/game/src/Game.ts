import { type LongFormMove, type MoveMap } from "boardgame.io";
import { INVALID_MOVE } from "boardgame.io/core";
import { Context, Effect, Layer, Option, Result, Schema } from "effect";
import * as BoardGeneration from "./BoardGeneration.ts";
import * as Cards from "./Cards.ts";
import * as Coords from "./Coords.ts";
import * as Defense from "./Defense.ts";
import type { MoveContext, MoveDefinition, MoveMetadata } from "./Moves.ts";
import { MOVES } from "./Moves.ts";
import * as Nation from "./Nation.ts";
import { type Color, colorSchema } from "./Nation.ts";
import * as Random from "./Random.ts";
import * as Reactions from "./Reactions.ts";
import * as Resources from "./Resources.ts";
import * as Setup from "./Setup.ts";
import * as State from "./State.ts";
import { type GameEvent, type PendingReactions, type Phase, State as GameState } from "./State.ts";
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
 * Build the move's `GameEvent` **without** applying it, so an interrupt window
 * can resolve before the effect lands (D13).
 */
const makeEvent = (
  state: State.State,
  name: string,
  def: MoveMetadata,
  actor: Color,
  turn: number,
  params: unknown,
): GameEvent => ({
  seq: state.events.length,
  move: name,
  categories: [...def.categories],
  tags: [...(def.tags ?? [])],
  actor,
  at: eventAt(params),
  target: eventTarget(params),
  params: toParamRecord(params),
  turn,
});

// ----------------------------------------------------------------------------
// Reaction windows in the bridge (D13)
// ----------------------------------------------------------------------------

const withWindow = (state: State.State, window: PendingReactions): State.State =>
  new GameState({ ...state, pendingReactions: Option.some(window) });

const clearWindow = (state: State.State): State.State => new GameState({ ...state, pendingReactions: Option.none() });

/**
 * Resolve the open window when every eligible player has acted. Interrupt:
 * fold, then (unless vetoed) apply + log the event and open the trigger
 * window. Trigger: fire, then clear. Reactions are terminal (D13).
 */
const resolveIfComplete = (
  state: State.State,
  catalog: Cards.Catalog,
  moves: Reactions.MovesRegistry,
): State.State => {
  if (Option.isNone(state.pendingReactions)) return state;
  const window = state.pendingReactions.value;
  if (!Reactions.isComplete(window)) return state;
  if (window.phase === "interrupt") {
    const interrupt = Reactions.resolveInterrupt(state, window, moves);
    if (interrupt.vetoed) return clearWindow(state);
    const applied = Reactions.applyEvent(interrupt.state, interrupt.event, moves);
    const logged = Reactions.logEvent(applied, interrupt.event);
    const trigger = Reactions.openWindow(logged, catalog, interrupt.event, "trigger", moves);
    return Option.isSome(trigger) ? withWindow(logged, trigger.value) : clearWindow(logged);
  }
  return clearWindow(Reactions.resolveTrigger(state, window, moves));
};

/**
 * Run a move: propose its event, open the interrupt window if anyone can react
 * (suspending without applying), otherwise apply + log and open the trigger
 * window if anyone can react.
 */
const runMove = (
  state: State.State,
  name: string,
  def: MoveDefinition<any>,
  actor: Color,
  params: unknown,
  catalog: Cards.Catalog,
  moves: Reactions.MovesRegistry,
  turn: number,
  phase: Phase,
): State.State => {
  const event = makeEvent(state, name, def, actor, turn, params);
  const interrupt = Reactions.openWindow(state, catalog, event, "interrupt", moves);
  if (Option.isSome(interrupt)) return withWindow(state, interrupt.value);
  const applied = def.apply({ state, actor, turn, phase }, params as never);
  if (Result.isFailure(applied)) return state;
  const logged = Reactions.logEvent(applied.success.state, event);
  const trigger = Reactions.openWindow(logged, catalog, event, "trigger", moves);
  return Option.isSome(trigger) ? withWindow(logged, trigger.value) : clearWindow(logged);
};

/**
 * Turn one game `MoveDefinition` into a boardgame.io long-form move. There is
 * no `validateMove` field in boardgame.io 0.50, so `canApply` is consulted
 * inside the move body and `INVALID_MOVE` is returned when it (or param
 * decoding) fails. `G` is decoded on the way in and re-encoded on the way out
 * (D40).
 */
const buildMove = (
  name: string,
  def: MoveDefinition<any>,
  catalog: Cards.Catalog,
  moves: Reactions.MovesRegistry,
): LongFormMove<State.StateEncoded, {}> => ({
  move: ({ G, ctx, playerID }, ...args) => {
    const state = State.decodeUnknown(G);
    const actor = View.colorForPlayerId(state, playerID ?? null);
    if (actor === null) return INVALID_MOVE;
    const decoded = Schema.decodeUnknownResult(def.params)(args[0] ?? {});
    if (Result.isFailure(decoded)) return INVALID_MOVE;
    const params = decoded.success;
    const phase = ctx.phase as Phase;
    const legal = def.canApply({ state, actor, turn: ctx.turn, phase }, params);
    if (Result.isFailure(legal) || !legal.success) return INVALID_MOVE;
    return State.encode(runMove(state, name, def, actor, params, catalog, moves, ctx.turn, phase));
  },
});

/** A system move (declare/pass a reaction): no event, no window of its own. */
const buildSystemMove = (def: MoveDefinition<any>): LongFormMove<State.StateEncoded, {}> => ({
  move: ({ G, ctx, playerID }, ...args) => {
    const state = State.decodeUnknown(G);
    const actor = View.colorForPlayerId(state, playerID ?? null);
    if (actor === null) return INVALID_MOVE;
    const decoded = Schema.decodeUnknownResult(def.params)(args[0] ?? {});
    if (Result.isFailure(decoded)) return INVALID_MOVE;
    const phase = ctx.phase as Phase;
    const legal = def.canApply({ state, actor, turn: ctx.turn, phase }, decoded.success);
    if (Result.isFailure(legal) || !legal.success) return INVALID_MOVE;
    const applied = def.apply({ state, actor, turn: ctx.turn, phase }, decoded.success);
    if (Result.isFailure(applied)) return INVALID_MOVE;
    return State.encode(applied.success.state);
  },
});

/** The two system moves that operate on an open window. */
export const buildSystemMoves = (
  catalog: Cards.Catalog,
  moves: Reactions.MovesRegistry,
): Record<string, MoveDefinition<any>> => ({
  declareReaction: {
    categories: ["react"],
    params: Schema.Struct({
      move: Schema.String,
      params: Schema.Record(Schema.String, Schema.Unknown),
    }),
    canApply: (ctx, p) =>
      Result.succeed(
        Option.isSome(ctx.state.pendingReactions)
          && ctx.state.pendingReactions.value.eligible.includes(ctx.actor)
          && !ctx.state.pendingReactions.value.declarations.some((d) => d.actor === ctx.actor)
          && Object.hasOwn(moves, p.move),
      ),
    apply: (ctx, p) => {
      if (Option.isNone(ctx.state.pendingReactions)) return Result.succeed({ state: ctx.state });
      const declared = Reactions.declare(
        ctx.state.pendingReactions.value,
        ctx.actor,
        p.move,
        p.params,
        ctx.state.events.length + ctx.state.pendingReactions.value.declarations.length,
        moves,
      );
      if (Result.isFailure(declared)) return Result.succeed({ state: ctx.state });
      return Result.succeed({ state: resolveIfComplete(withWindow(ctx.state, declared.success), catalog, moves) });
    },
  },
  passReaction: {
    categories: ["react"],
    params: Schema.Struct({}),
    canApply: (ctx) =>
      Result.succeed(
        Option.isSome(ctx.state.pendingReactions)
          && ctx.state.pendingReactions.value.eligible.includes(ctx.actor)
          && !ctx.state.pendingReactions.value.declarations.some((d) => d.actor === ctx.actor)
          && !ctx.state.pendingReactions.value.passed.includes(ctx.actor),
      ),
    apply: (ctx) => {
      if (Option.isNone(ctx.state.pendingReactions)) return Result.succeed({ state: ctx.state });
      const passed = Reactions.pass(ctx.state.pendingReactions.value, ctx.actor);
      if (Result.isFailure(passed)) return Result.succeed({ state: ctx.state });
      return Result.succeed({ state: resolveIfComplete(withWindow(ctx.state, passed.success), catalog, moves) });
    },
  },
});

/**
 * The boardgame.io move map: the game's registry plus the reaction system
 * moves. Reaction-card moves are reachable only through `declareReaction`.
 */
export const buildMoves = (
  moves: Record<string, MoveDefinition<any>>,
  catalog: Cards.Catalog,
): MoveMap<State.StateEncoded, {}> => {
  const out: Record<string, LongFormMove<State.StateEncoded, {}>> = {};
  for (const [name, def] of Object.entries(moves)) {
    out[name] = buildMove(name, def, catalog, moves);
  }
  for (const [name, def] of Object.entries(buildSystemMoves(catalog, moves))) {
    out[name] = buildSystemMove(def);
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

/** The game service, requiring the card, terrain, production and defense catalogues. */
export const ServiceLive = Layer.effect(
  Service,
  Effect.gen(function*() {
    const cards = yield* Cards.CardCatalog;
    const terrain = yield* Terrain.TerrainCatalog;
    const production = yield* Resources.ProductionCatalog;
    const defense = yield* Defense.DefenseCatalog;
    // Cross-catalogue lint: every `buildableProduction` id named by a terrain
    // must exist in the production catalogue (D52/D53).
    yield* Effect.fromResult(Resources.lintTerrainProduction(terrain, production));
    const supplySpec: Nation.NationSupplySpec = {
      productionKind: production.production[0]?.id,
      defenseTypes: Defense.defenseSupplySpec(defense),
    };

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
            supplySpec,
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
            production.pin,
          ),
        );
      },
      // 5. Moves: the whole code-side registry plus the reaction system moves,
      //    bridged to boardgame.io.
      moves: buildMoves(MOVES as unknown as Record<string, MoveDefinition<any>>, cards.catalog),
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

/** Dev layer: the game service with an empty catalog and the default catalogues. */
export const ServiceDev = Layer.provide(
  ServiceLive,
  Layer.mergeAll(
    Cards.CardCatalogFixture(Cards.emptyCatalog),
    Terrain.TerrainCatalogFixture(Terrain.DEFAULT_TERRAIN_TABLE),
    Resources.ProductionCatalogFixture(Resources.DEFAULT_PRODUCTION_TABLE),
    Defense.DefenseCatalogFixture(Defense.DEFAULT_DEFENSE_TABLE),
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
