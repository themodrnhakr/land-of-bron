import { type Game } from "boardgame.io";
import { Context, Effect, Layer, Option, Result } from "effect";
import * as BoardGeneration from "./BoardGeneration.ts";
import * as Cards from "./Cards.ts";
import * as Nation from "./Nation.ts";
import * as Random from "./Random.ts";
import * as Setup from "./Setup.ts";
import * as State from "./State.ts";
import * as Terrain from "./Terrain.ts";
import * as Tile from "./Tile.ts";

// The palette for up to 7 nations (matches the generator's structural cap).
const NATION_COLORS = ["red", "orange", "yellow", "green", "blue", "indigo", "violet"] as const;

export class Service extends Context.Service<Service, {
  readonly make: (config: State.Config) => Game<State.State, {}, Setup.SetupOptions>;
}>()("GameService") {}

/** The game service, requiring a `CardCatalog` and a `TerrainCatalog`. */
export const ServiceLive = Layer.effect(
  Service,
  Effect.gen(function*() {
    const cards = yield* Cards.CardCatalog;
    const terrain = yield* Terrain.TerrainCatalog;

    const make = (config: State.Config): Game<State.State, {}, Setup.SetupOptions> => ({
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
        //    match creation (ctx.numPlayers), never from setup data.
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
          throw new Error(
            `terrain pool (${poolSize}) is smaller than target (${opts.target})`,
          );
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
        // 4. Wire up state, pinned to the loaded catalog and terrain config.
        return State.make(
          tiles,
          nations,
          { version: cards.catalog.version, hash: cards.hash },
          terrain.pin,
        );
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
