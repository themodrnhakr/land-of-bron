import { type Game } from "boardgame.io";
import { Context, Effect, Layer, Result } from "effect";
import { BoardGeneration, Nation, Setup, State, Tile } from ".";

// The palette for up to 7 nations (matches the generator's structural cap).
const NATION_COLORS = ["red", "orange", "yellow", "green", "blue", "indigo", "violet"] as const;

export class Service extends Context.Service<Service, {
  readonly make: (config: State.Config) => Game<State.State, {}, Setup.SetupOptions>;
}>()("GameService") {}

export const ServiceDev = Layer.effect(
  Service,
  Effect.gen(function*() {
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
        // 3. One nation per player, with the configured supplies and names.
        const nations = Array.from({ length: ctx.numPlayers }, (_, id) =>
          Nation.makeNation(
            NATION_COLORS[id]!,
            opts.nationNames[id] ?? "Nation " + (id + 1),
            opts.pieceLimits,
          ));
        // 4. Wire up state.
        return State.make(tiles, nations);
      },
    });

    return {
      make,
    };
  }),
);
