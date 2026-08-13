import { Schema } from "effect";
import * as Coords from "./Coords.ts";

// ============================================================================
// Piece definitions
// ============================================================================

/** The two faces of an influence token. */
export const influenceFaces = Schema.Literals(["influence", "goodwill"]);
export type InfluenceFace = typeof influenceFaces.Type;

/** The two faces of a religion token. */
export const religionFaces = Schema.Literals(["prosletized", "converted"]);
export type ReligionFace = typeof religionFaces.Type;

/** The unit kinds a nation can field. */
export const unitKinds = Schema.Literals(["army", "missionary"]);
export type UnitKind = typeof unitKinds.Type;

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

/** The shape of a supply-cap table. */
export type PieceLimits = typeof PIECE_LIMITS;

// ============================================================================
// Placed-piece helpers
// ============================================================================

/**
 * A placed piece: `at` = board coords when on the board, absent = still in
 * the pool. `A` carries the piece-type-specific fields (face, kind, ...).
 */
export type PlacedPiece<A = Record<string, never>> = A & {
  readonly at?: Coords.Coords;
};

/** Build a full supply array at setup — every piece starts in the pool. */
export const makeSupply = <A>(count: number, data: A): Array<PlacedPiece<A>> =>
  Array.from({ length: count }, (): PlacedPiece<A> => ({ ...data } as PlacedPiece<A>));

/** Immutable placement: returns a new piece with `at` set. */
export const place = <P extends PlacedPiece>(piece: P, at: Coords.Coords): P => ({ ...piece, at });

/** Immutable return-to-pool: clears `at`. */
export const returnToPool = <P extends PlacedPiece>(piece: P): P => {
  const { at: _at, ...rest } = piece;
  return rest as P;
};

/** How many of a nation's pieces are still in the pool. */
export const poolCount = (pieces: ReadonlyArray<PlacedPiece>): number =>
  pieces.filter((p) => p.at === undefined).length;

/** How many of a nation's pieces are on the board. */
export const onBoardCount = (pieces: ReadonlyArray<PlacedPiece>): number => pieces.length - poolCount(pieces);
