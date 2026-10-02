import { Option, Schema } from "effect";
import * as Coords from "./Coords.ts";

// ============================================================================
// Piece definitions
// ============================================================================

/** The two faces of an influence token. */
export const influenceFaces = Schema.Literals(["influence", "goodwill"]);
export type InfluenceFace = typeof influenceFaces.Type;

/** The two faces of a religion token. */
export const religionFaces = Schema.Literals(["proselytized", "converted"]);
export type ReligionFace = typeof religionFaces.Type;

/** The unit kinds a nation can field. */
export const unitKinds = Schema.Literals(["army", "missionary"]);
export type UnitKind = typeof unitKinds.Type;

/**
 * The kinds of production piece. The vocabulary starts minimal and grows as
 * catalog content is authored (there is no content yet).
 */
export const productionKinds = Schema.Literals(["farm"]);
export type ProductionKind = typeof productionKinds.Type;

// ============================================================================
// Supply caps
// ============================================================================

/**
 * Per-nation supply caps. Each limited piece lives in a nation inventory
 * whose length never exceeds its cap — the array IS the supply, so the limit
 * is structural and cannot drift.
 */
export const PIECE_LIMITS = {
  influence: 8,
  religion: 6,
  controlChits: 4,
  units: 8, // armies + missionaries share this pool
  production: 6,
  population: 6,
  tradePosts: 3,
} as const;

/** The set of supply-cap keys. */
export const PIECE_LIMIT_KEYS = [
  "influence",
  "religion",
  "controlChits",
  "units",
  "production",
  "population",
  "tradePosts",
] as const satisfies ReadonlyArray<keyof typeof PIECE_LIMITS>;

/**
 * A supply-cap table. Deliberately widened from the literal `PIECE_LIMITS`
 * values so per-match overrides are honestly typed (the old
 * `typeof PIECE_LIMITS` made every override a type lie and forced an
 * `as PieceLimits` cast at the decode boundary).
 */
export type PieceLimits = Record<keyof typeof PIECE_LIMITS, number>;

/**
 * The largest allowed supply cap. Real caps are single digits; the bound exists
 * to stop a client-supplied `setupData` from driving `Array.from({ length })`
 * straight into an out-of-memory crash (see PLAN.md finding D).
 */
export const MAX_PIECE_LIMIT = 100;

// ============================================================================
// Placed-piece helpers
// ============================================================================

/**
 * A placed piece: `at` = `Some(coords)` when on the board, `None` when still
 * in the pool. `A` carries the piece-type-specific fields (face, kind, ...).
 */
export type PlacedPiece<A = unknown> = A & {
  readonly at: Option.Option<Coords.Coords>;
};

/** Build a full supply array at setup — every piece starts in the pool. */
export const makeSupply = <A>(count: number, data: A): Array<PlacedPiece<A>> =>
  Array.from({ length: count }, (): PlacedPiece<A> => ({ ...data, at: Option.none() }));

/** Immutable placement: returns a new piece with `at` set. */
export const place = <P extends PlacedPiece>(piece: P, at: Coords.Coords): P => ({
  ...piece,
  at: Option.some(at),
});

/** Immutable return-to-pool: clears `at`. */
export const returnToPool = <P extends PlacedPiece>(piece: P): P => ({
  ...piece,
  at: Option.none(),
});

/** How many of a nation's pieces are still in the pool. */
export const poolCount = (pieces: ReadonlyArray<PlacedPiece>): number =>
  pieces.filter((p) => Option.isNone(p.at)).length;

/** How many of a nation's pieces are on the board. */
export const onBoardCount = (pieces: ReadonlyArray<PlacedPiece>): number => pieces.length - poolCount(pieces);
