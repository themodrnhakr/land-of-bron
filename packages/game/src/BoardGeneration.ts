import { Array, Effect, HashSet, pipe, Result, Schema } from "effect";
import { Frontier, Lattice } from "./BoardGenerationStrategies.ts";
import * as Coords from "./Coords.ts";

// ============================================================================
// Generation options
// ============================================================================

/**
 * The supported board-generation strategies:
 *
 * - `"lattice"` — identical 7-tile hex blobs stamped on a zero-gap lattice.
 * - `"frontier"` — noisy, competitive growth with ragged borders.
 */
export const strategySchema = Schema.Literals(["lattice", "frontier"]);

/** A supported generation strategy, as a literal union. */
export type Strategy = typeof strategySchema.Type;

/**
 * Options for {@link generateCoords}, as a validating schema.
 *
 * The fields with decoding defaults (`seed`, `target`, `noisePoolFraction`,
 * `seedRingDist`, `growthCap`) may be omitted by the caller; they are filled
 * in during decoding. Per-field ranges are enforced here and the cross-field
 * `growthCap >= seedRingDist + 2` rule is a struct-level check (D14), so bad
 * options surface as a typed `InvalidOptions` error rather than as a confusing
 * downstream `InsufficientRoom`.
 *
 * See {@link GenerateCoordsOpts} for the caller-facing shape.
 */
export const generationCrossFieldIssues = (
  opts: { readonly growthCap: number; readonly seedRingDist: number },
): Array<Schema.FilterIssue> => {
  const issues: Array<Schema.FilterIssue> = [];
  if (opts.growthCap < opts.seedRingDist + 2) {
    issues.push({
      path: ["growthCap"],
      issue: `growthCap (${opts.growthCap}) must be at least seedRingDist + 2 (${opts.seedRingDist + 2})`,
    });
  }
  return issues;
};

/**
 * Options for {@link generateCoords}, as a validating schema.
 *
 * The fields with decoding defaults (`seed`, `target`, `noisePoolFraction`,
 * `seedRingDist`, `growthCap`) may be omitted by the caller; they are filled
 * in during decoding. Per-field ranges are enforced here and the cross-field
 * `growthCap >= seedRingDist + 2` rule is a struct-level check (D14), so bad
 * options surface as a typed `InvalidOptions` error rather than as a confusing
 * downstream `InsufficientRoom`.
 *
 * See {@link GenerateCoordsOpts} for the caller-facing shape.
 */
export const generateCoordsOpts = Schema.Struct({
  playerCount: Schema.Number,
  strategy: strategySchema,
  seed: Schema.Number.pipe(Schema.withDecodingDefaultKey(
    Effect.succeed(0),
  )),
  // Exact tiles per nation (frontier strategy). A target below 1 is never a
  // legitimate board (D15).
  target: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).pipe(Schema.withDecodingDefaultKey(
    Effect.succeed(7),
  )),
  // Random pick pool: closest N% of frontier cells per claim. Lower = smoother
  // borders, higher = more ragged.
  noisePoolFraction: Schema.Number.check(
    Schema.isGreaterThanOrEqualTo(0),
    Schema.isLessThanOrEqualTo(1),
  ).pipe(Schema.withDecodingDefaultKey(
    Effect.succeed(0.35),
  )),
  // Distance of the seed ring from the center (frontier strategy).
  seedRingDist: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).pipe(Schema.withDecodingDefaultKey(
    Effect.succeed(2),
  )),
  // Outward growth limit from the center; keeps the landmass compact. Must be
  // at least seedRingDist + 2 or nations near the rim can run out of room
  // (enforced by the struct-level check below).
  growthCap: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).pipe(Schema.withDecodingDefaultKey(
    Effect.succeed(4),
  )),
}).check(Schema.makeFilter(generationCrossFieldIssues));

/**
 * Caller-facing options for {@link generateCoords}.
 *
 * The defaulted fields (`seed`, `target`, `noisePoolFraction`, `seedRingDist`,
 * `growthCap`) are optional — {@link generateCoords} fills them in during
 * decoding.
 */
export type GenerateCoordsOpts = typeof generateCoordsOpts.Encoded;

/**
 * The fully-resolved options after decoding applies the schema defaults.
 *
 * Every field is present. This is what the strategies consume; callers
 * normally only need {@link GenerateCoordsOpts}.
 */
export type ResolvedGenerateCoordsOpts = typeof generateCoordsOpts.Type;

// ============================================================================
// Errors
// ============================================================================

/** Options failed to decode (unknown strategy, non-numeric field, ...). */
export type InvalidOptionsError = {
  readonly _tag: "InvalidOptions";
  readonly error: Schema.SchemaError;
};

/** `playerCount` is not an integer within the supported range [2, 7]. */
export type InvalidPlayerCountError = {
  readonly _tag: "InvalidPlayerCount";
  readonly playerCount: number;
};

/**
 * The frontier strategy ran out of room before every nation reached its
 * target. Raise `growthCap` (at least `seedRingDist + 2`) or lower `target`.
 */
export type InsufficientRoomError = {
  readonly _tag: "InsufficientRoom";
  readonly nationId: number;
  readonly actual: number;
  readonly target: number;
  readonly playerCount: number;
  readonly growthCap: number;
  readonly seedRingDist: number;
};

/** Any error that {@link generateCoords} can return. */
export type GenerateCoordsError =
  | InvalidOptionsError
  | InvalidPlayerCountError
  | InsufficientRoomError;

// ============================================================================
// Strategy registry
// ============================================================================

// Every strategy implements `generate(opts) -> Result<territories, error>`.
// Adding a strategy means adding it here — no switch statements to extend.
const STRATEGIES = {
  lattice: Lattice,
  frontier: Frontier,
} as const;

// ============================================================================
// Public API
// ============================================================================

/**
 * Generate a board layout: one contiguous territory of hex coordinates per
 * nation.
 *
 * Deterministic — the same options always produce the same layout for a given
 * `seed`. Never throws; failures are returned as a tagged
 * {@link GenerateCoordsError}:
 *
 * - `InvalidOptions` — options failed to decode.
 * - `InvalidPlayerCount` — `playerCount` is not an integer in `[2, 7]` (both
 *   strategies are structurally capped at 7 nations).
 * - `InsufficientRoom` — the frontier strategy ran out of room before every
 *   nation reached its target (raise `growthCap` or lower `target`).
 *
 * @param opts - Generation options; the defaulted fields are optional.
 * @returns The per-nation territories on success.
 */
export const generateCoords = (
  opts: GenerateCoordsOpts,
): Result.Result<Array<Array<Coords.Coords>>, GenerateCoordsError> => {
  // Decoding applies the schema defaults (seed, target, noisePoolFraction,
  // seedRingDist, growthCap) when the caller omits them, and reports malformed
  // input as a typed error instead of throwing.
  const decoded = Schema.decodeResult(generateCoordsOpts)(opts);
  if (Result.isFailure(decoded)) {
    return Result.fail({ _tag: "InvalidOptions", error: decoded.failure });
  }
  const o = decoded.success;
  // Both strategies are structurally capped at 7 nations (lattice positions,
  // seed ring). Checked here rather than in the schema so the caller gets a
  // typed error instead of a parse failure.
  if (!Number.isInteger(o.playerCount) || o.playerCount < 2 || o.playerCount > 7) {
    return Result.fail({ _tag: "InvalidPlayerCount", playerCount: o.playerCount });
  }
  return STRATEGIES[o.strategy]!.generate(o);
};

/**
 * Compute the neutral sea for a layout: every cell within one hex of a nation
 * tile (the border ring) plus any enclosed gaps between nations. Sea never
 * extends more than one tile beyond a nation border.
 *
 * @param nations - The territories produced by {@link generateCoords}.
 * @returns The neutral (sea) coordinates.
 */
export const neutralCoords = (
  nations: Array<Array<Coords.Coords>>,
): Array<Coords.Coords> => {
  // All land tiles, as a HashSet (structural equality → no string keys).
  const land = pipe(
    nations,
    Array.flatMap((territory) => territory),
    Array.reduce(HashSet.empty<Coords.Coords>(), (acc, cell) => HashSet.add(acc, cell)),
  );
  // Sea = the neighbors of land tiles that are not themselves land. Enclosed
  // gaps are included automatically because they touch land.
  const sea = pipe(
    land,
    HashSet.reduce(HashSet.empty<Coords.Coords>(), (acc, cell) =>
      pipe(
        Coords.DIRECTIONS,
        Array.reduce(acc, (out, dir) => {
          const neighbor = Coords.add(cell, dir);
          return !HashSet.has(land, neighbor) && !HashSet.has(out, neighbor)
            ? HashSet.add(out, neighbor)
            : out;
        }),
      )),
  );
  // Flatten the HashSet into an array for the caller.
  return pipe(
    sea,
    HashSet.reduce([] as Array<Coords.Coords>, (acc, cell) => Array.append(acc, cell)),
  );
};
