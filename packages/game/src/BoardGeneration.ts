import { Array, Effect, HashSet, pipe, Result, Schema } from "effect";
import type { SchemaError } from "effect";
import { Frontier, Lattice } from "./BoardGenerationStrategies.ts";
import * as Coords from "./Coords.ts";

// ============================================================================
// Generation options
// ============================================================================

export const strategySchema = Schema.Literals(["lattice", "frontier"]);
export type Strategy = typeof strategySchema.Type;

export const generateCoordsOpts = Schema.Struct({
  playerCount: Schema.Number,
  strategy: strategySchema,
  seed: Schema.Number.pipe(Schema.withDecodingDefaultKey(
    Effect.succeed(0),
  )),
  // Exact tiles per nation (frontier strategy).
  target: Schema.Number.pipe(Schema.withDecodingDefaultKey(
    Effect.succeed(7),
  )),
  // Random pick pool: closest N% of frontier cells per claim. Lower = smoother
  // borders, higher = more ragged.
  noisePoolFraction: Schema.Number.pipe(Schema.withDecodingDefaultKey(
    Effect.succeed(0.35),
  )),
  // Distance of ring capitals from the center (frontier strategy).
  seedRingDist: Schema.Number.pipe(Schema.withDecodingDefaultKey(
    Effect.succeed(2),
  )),
  // Outward growth limit from the center; keeps the landmass compact. Should
  // be at least seedRingDist + 2 or nations near the rim can run out of room.
  growthCap: Schema.Number.pipe(Schema.withDecodingDefaultKey(
    Effect.succeed(4),
  )),
});

// Caller-facing input: the defaulted fields (seed, target, noisePoolFraction,
// seedRingDist, growthCap) are optional and filled in during decoding.
export type GenerateCoordsOpts = typeof generateCoordsOpts.Encoded;

// The fully-resolved options after decoding applies the defaults. Strategies
// receive this — every field is present.
export type ResolvedGenerateCoordsOpts = typeof generateCoordsOpts.Type;

// ============================================================================
// Errors
// ============================================================================

// Options failed to decode (unknown strategy, non-numeric field, ...).
export type InvalidOptionsError = {
  readonly _tag: "InvalidOptions";
  readonly error: SchemaError.SchemaError;
};

// playerCount is not an integer within the supported range [2, 7].
export type InvalidPlayerCountError = {
  readonly _tag: "InvalidPlayerCount";
  readonly playerCount: number;
};

// The frontier strategy ran out of room before every nation reached its
// target. Raise growthCap (>= seedRingDist + 2) or lower target.
export type InsufficientRoomError = {
  readonly _tag: "InsufficientRoom";
  readonly nationId: number;
  readonly actual: number;
  readonly target: number;
  readonly playerCount: number;
  readonly growthCap: number;
  readonly seedRingDist: number;
};

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

// Neutral sea: every cell within 1 hex of a nation tile (the border ring),
// plus any enclosed gaps between nations. Sea never extends more than one
// tile beyond a nation border.
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
