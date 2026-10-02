import { Effect, Result, Schema } from "effect";
import type { SchemaError } from "effect";
import {
  generateCoordsOpts,
  generationCrossFieldIssues,
  type ResolvedGenerateCoordsOpts,
  strategySchema,
} from "./BoardGeneration.ts";
import { MAX_PIECE_LIMIT, PIECE_LIMIT_KEYS, PIECE_LIMITS, type PieceLimits } from "./Pieces.ts";

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

/** The default generation strategy. */
export const DEFAULT_STRATEGY = "frontier" as const;

// The board-generation fields (seed, target, noisePoolFraction, seedRingDist,
// growthCap) — minus playerCount (seats come from match creation) and
// strategy (re-added below with a default so zero-config matches work). The
// struct-level cross-field check is re-applied to `setupOptionsSchema` below,
// because spreading the fields loses the parent's checks.
const { playerCount: _playerCount, strategy: _strategy, ...generationFields } = generateCoordsOpts.fields;

/**
 * A single supply cap: an integer in `[1, MAX_PIECE_LIMIT]`. The lower bound
 * bans empty/negative supplies; the upper bound closes the `Array.from({
 * length: 1e9 })` allocation hazard from client-supplied `setupData` (D14).
 */
const pieceLimitSchema = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(1),
  Schema.isLessThanOrEqualTo(MAX_PIECE_LIMIT),
);

/**
 * Partial per-nation supply-cap overrides. Omitted keys keep `PIECE_LIMITS`;
 * the merge happens in `decodeSetupOptions`. Unknown keys are **rejected**, not
 * silently stripped (D14), so a typo in an admin-portal override is an error.
 */
export const pieceLimitsOverrideSchema = Schema.Struct({
  influence: Schema.optional(pieceLimitSchema),
  religion: Schema.optional(pieceLimitSchema),
  controlChits: Schema.optional(pieceLimitSchema),
  units: Schema.optional(pieceLimitSchema),
  production: Schema.optional(pieceLimitSchema),
  population: Schema.optional(pieceLimitSchema),
  tradePosts: Schema.optional(pieceLimitSchema),
});
export type PieceLimitsOverride = typeof pieceLimitsOverrideSchema.Type;

/**
 * Client-provided per-match configuration, sent as `setupData` when creating
 * a match. Every field is optional — omitted fields fall back to defaults
 * during decoding. Terrain is **not** here: it is game-level Effect Config
 * (D21).
 */
export const setupOptionsSchema = Schema.Struct({
  ...generationFields,
  strategy: strategySchema.pipe(Schema.withDecodingDefaultKey(Effect.succeed(DEFAULT_STRATEGY))),
  pieceLimits: Schema.optional(pieceLimitsOverrideSchema),
  nationNames: Schema.optional(Schema.Array(Schema.String)),
  catalogVersion: Schema.optional(Schema.String),
}).check(Schema.makeFilter(generationCrossFieldIssues));

/** What clients send — sparse, defaults applied on decode. */
export type SetupOptions = typeof setupOptionsSchema.Encoded;

/**
 * The fully-resolved options after decoding applies the defaults — what
 * `setup` uses to build the board, tiles, and nations.
 */
export type ResolvedSetupOptions =
  & Omit<ResolvedGenerateCoordsOpts, "playerCount">
  & {
    readonly pieceLimits: PieceLimits;
    readonly nationNames: ReadonlyArray<string>;
    readonly catalogVersion: string | undefined;
  };

/** Options failed to decode (unknown strategy, out-of-range field, ...). */
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

  // Second, strict pass over `pieceLimits` only: the main decode strips unknown
  // keys everywhere (we deliberately keep unknown top-level keys ignored), so
  // excess-property rejection is scoped to the nested override object.
  const raw = (typeof data === "object" && data !== null ? data : {}) as { pieceLimits?: unknown };
  if (raw.pieceLimits !== undefined) {
    const strict = Schema.decodeUnknownResult(
      pieceLimitsOverrideSchema,
      { onExcessProperty: "error" },
    )(raw.pieceLimits);
    if (Result.isFailure(strict)) {
      return Result.fail({ _tag: "InvalidSetupOptions", error: strict.failure });
    }
  }

  const o = decoded.success;
  const limits: PieceLimits = { ...PIECE_LIMITS };
  if (o.pieceLimits !== undefined) {
    for (const key of PIECE_LIMIT_KEYS) {
      const value = o.pieceLimits[key];
      if (value !== undefined) limits[key] = value;
    }
  }
  return Result.succeed({
    strategy: o.strategy,
    seed: o.seed,
    target: o.target,
    noisePoolFraction: o.noisePoolFraction,
    seedRingDist: o.seedRingDist,
    growthCap: o.growthCap,
    pieceLimits: limits,
    nationNames: o.nationNames ?? DEFAULT_NATION_NAMES,
    catalogVersion: o.catalogVersion,
  });
};

/** A human-readable message for match-creation errors. */
export const formatSetupError = (err: SetupOptionsError): string => err.error.message ?? String(err.error);
