import { type Game } from "boardgame.io";
import { Context, Effect, Layer, Result } from "effect";
import * as BoardGeneration from "./BoardGeneration.ts";
import * as Cards from "./Cards.ts";
import * as Nation from "./Nation.ts";
import * as Setup from "./Setup.ts";
import * as State from "./State.ts";
import * as Tile from "./Tile.ts";

// The palette for up to 7 nations (matches the generator's structural cap).
const NATION_COLORS = ["red", "orange", "yellow", "green", "blue", "indigo", "violet"] as const;

export class Service extends Context.Service<Service, {
  readonly make: (config: State.Config) => Game<State.State, {}, Setup.SetupOptions>;
}>()("GameService") {}

/** The game service, requiring a `CardCatalog` (provide it, or use `ServiceDev`). */
export const ServiceLive = Layer.effect(
  Service,
  Effect.gen(function*() {
    const cards = yield* Cards.CardCatalog;

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
        // 2. Land tiles (with the configured terrain) + sea tiles.
        const tiles: Tile.Tile[] = [
          ...result.success.flatMap((territory, id) =>
            territory.map((c) => Tile.fromCoords(c, NATION_COLORS[id]!, opts.terrain))
          ),
          ...BoardGeneration.neutralCoords(result.success).map((c) => Tile.fromCoords(c, undefined, "sea")),
        ];
        // 3. One nation per player, with the configured supplies and names, and
        //    a mat slot per catalog domain.
        const slots = cards.catalog.domains.map((d) => ({ domain: d.id }));
        const nations = Array.from({ length: ctx.numPlayers }, (_, id) => {
          const nation = Nation.makeNation(
            NATION_COLORS[id]!,
            opts.nationNames[id] ?? "Nation " + (id + 1),
            opts.pieceLimits,
          );
          return { ...nation, mat: { ...nation.mat, slots } };
        });
        // 4. Wire up state, pinned to the loaded catalog.
        return State.make(tiles, nations, {
          version: cards.catalog.version,
          hash: cards.hash,
        });
      },
    });

    return { make };
  }),
);

/** Dev layer: the game service with an empty catalog. */
export const ServiceDev = Layer.provide(
  ServiceLive,
  Cards.CardCatalogFixture(Cards.emptyCatalog),
);
