import { Effect, Result, Schema } from "effect";
import type { SchemaError } from "effect";
import { generateCoordsOpts, type ResolvedGenerateCoordsOpts, strategySchema } from "./BoardGeneration.ts";
import { PIECE_LIMITS, type PieceLimits } from "./Pieces.ts";
import { type LandTerrain, landTerrainSchema } from "./Tile.ts";

// ============================================================================
// Per-match setup configuration (boardgame.io `setupData`)
// ============================================================================

// Defaults applied when the client omits a field. Sent by the client at match
// creation (e.g. lobbyClient.createMatch(gameName, { numPlayers, setupData }))
// and validated/decoded server-side by `decodeSetupOptions`.

/** The default nation-name palette (used when the client sends none). */
export const DEFAULT_NATION_NAMES = [
  "Red Empire",
  "Blue Kingdom",
  "Green Republic",
  "Amber Guild",
  "Purple Dominion",
  "Cyan Alliance",
  "Pink Dynasty",
] as const;

/** The default terrain assigned to generated land tiles. */
export const DEFAULT_LAND_TERRAIN: LandTerrain = "plains";

/** The default generation strategy. */
export const DEFAULT_STRATEGY = "frontier" as const;

// The board-generation fields (seed, target, noisePoolFraction, seedRingDist,
// growthCap) — minus playerCount (seats come from match creation) and
// strategy (re-added below with a default so zero-config matches work).
const { playerCount: _playerCount, strategy: _strategy, ...generationFields } = generateCoordsOpts.fields;

/**
 * Partial per-nation supply-cap overrides. Omitted keys keep `PIECE_LIMITS`;
 * the merge happens in `decodeSetupOptions`.
 */
export const pieceLimitsOverrideSchema = Schema.Struct({
  influence: Schema.optional(Schema.Number),
  religion: Schema.optional(Schema.Number),
  controlChits: Schema.optional(Schema.Number),
  units: Schema.optional(Schema.Number),
  production: Schema.optional(Schema.Number),
  population: Schema.optional(Schema.Number),
  tradePosts: Schema.optional(Schema.Number),
});
export type PieceLimitsOverride = typeof pieceLimitsOverrideSchema.Type;

/**
 * Client-provided per-match configuration, sent as `setupData` when creating
 * a match. Every field is optional — omitted fields fall back to defaults
 * during decoding.
 */
export const setupOptionsSchema = Schema.Struct({
  ...generationFields,
  strategy: strategySchema.pipe(Schema.withDecodingDefaultKey(Effect.succeed(DEFAULT_STRATEGY))),
  terrain: Schema.optional(landTerrainSchema),
  pieceLimits: Schema.optional(pieceLimitsOverrideSchema),
  nationNames: Schema.optional(Schema.Array(Schema.String)),
  catalogVersion: Schema.optional(Schema.String),
});

/** What clients send — sparse, defaults applied on decode. */
export type SetupOptions = typeof setupOptionsSchema.Encoded;

/**
 * The fully-resolved options after decoding applies the defaults — what
 * `setup` uses to build the board, tiles, and nations.
 */
export type ResolvedSetupOptions =
  & Omit<ResolvedGenerateCoordsOpts, "playerCount">
  & {
    readonly terrain: LandTerrain;
    readonly pieceLimits: PieceLimits;
    readonly nationNames: ReadonlyArray<string>;
    readonly catalogVersion: string | undefined;
  };

/** Options failed to decode (unknown strategy, bad terrain, ...). */
export type SetupOptionsError = {
  readonly _tag: "InvalidSetupOptions";
  readonly error: SchemaError.SchemaError;
};

/**
 * Decode client setup data (unknown JSON) into resolved options. Total and
 * pure — never throws. Used by both `validateSetupData` and `setup` so the
 * two hooks can't drift apart.
 */
export const decodeSetupOptions = (
  data: unknown,
): Result.Result<ResolvedSetupOptions, SetupOptionsError> => {
  const decoded = Schema.decodeUnknownResult(setupOptionsSchema)(data ?? {});
  if (Result.isFailure(decoded)) {
    return Result.fail({ _tag: "InvalidSetupOptions", error: decoded.failure });
  }
  const o = decoded.success;
  return Result.succeed({
    strategy: o.strategy,
    seed: o.seed,
    target: o.target,
    noisePoolFraction: o.noisePoolFraction,
    seedRingDist: o.seedRingDist,
    growthCap: o.growthCap,
    terrain: o.terrain ?? DEFAULT_LAND_TERRAIN,
    pieceLimits: { ...PIECE_LIMITS, ...o.pieceLimits } as PieceLimits,
    nationNames: o.nationNames ?? DEFAULT_NATION_NAMES,
    catalogVersion: o.catalogVersion,
  });
};

/** A human-readable message for match-creation errors. */
export const formatSetupError = (err: SetupOptionsError): string => err.error.message ?? String(err.error);
