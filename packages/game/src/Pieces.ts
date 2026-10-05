import { Option, Schema } from "effect";
import * as Coords from "./Coords.ts";
import { type Edge } from "./Edges.ts";
import { productionIdSchema } from "./Resources.ts";

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
 * The kind of a production piece. D52 replaced the old `Literals(["farm"])`
 * with a configurable production id; the id set is the production catalogue
 * (`Resources.ts`), linted at setup.
 */
export { productionIdSchema };
export type ProductionKind = typeof productionIdSchema.Type;

/**
 * The kind of a defense structure piece. The id set is the defense catalogue
 * (`Defense.ts`); each type carries its own per-nation cap (D54).
 */
export const defenseStructureKindSchema = Schema.NonEmptyString;
export type DefenseStructureKind = typeof defenseStructureKindSchema.Type;

/** The two ship types (D56). */
export const shipKinds = Schema.Literals(["merchant", "naval"]);
export type ShipKind = typeof shipKinds.Type;

// ============================================================================
// Supply caps
// ============================================================================

/**
 * Per-nation supply caps. Each limited piece lives in a nation inventory
 * whose length never exceeds its cap — the array IS the supply, so the limit
 * is structural and cannot drift.
 *
 * `ships` is the total ship cap; `merchantShips` / `navalShips` are the
 * per-type caps (D56). Defense structures are capped **per type** by the
 * defense catalogue (`Defense.ts`), not here.
 */
export const PIECE_LIMITS = {
  influence: 8,
  religion: 6,
  controlChits: 4,
  units: 8, // armies + missionaries share this pool
  production: 6,
  population: 6,
  tradePosts: 3,
  supplyLines: 4,
  railroads: 6,
  ports: 3,
  ships: 6,
  merchantShips: 3,
  navalShips: 3,
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
  "supplyLines",
  "railroads",
  "ports",
  "ships",
  "merchantShips",
  "navalShips",
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

/**
 * Cross-field validation for the ship caps (D56): each per-type cap must fit
 * inside the total, and the two per-type caps together must be able to fill the
 * total ship supply. Returns human-readable issues (empty = valid).
 */
export const shipCapIssues = (
  limits: Pick<PieceLimits, "ships" | "merchantShips" | "navalShips">,
): ReadonlyArray<string> => {
  const issues: Array<string> = [];
  if (limits.merchantShips > limits.ships) {
    issues.push(`merchantShips (${limits.merchantShips}) must not exceed ships (${limits.ships})`);
  }
  if (limits.navalShips > limits.ships) {
    issues.push(`navalShips (${limits.navalShips}) must not exceed ships (${limits.ships})`);
  }
  if (limits.merchantShips + limits.navalShips < limits.ships) {
    issues.push(
      `merchantShips + navalShips (${limits.merchantShips + limits.navalShips}) must cover ships (${limits.ships})`,
    );
  }
  return issues;
};

// ============================================================================
// Placed-piece helpers
// ============================================================================

/**
 * A placed piece: `at` = `Some(location)` when on the board, `None` when still
 * in the pool. `A` carries the piece-type-specific fields (face, kind, ...);
 * `L` is the location (a tile `Coords`, or an `Edge` for railroads/ports).
 */
export type Placed<A, L> = A & {
  readonly at: Option.Option<L>;
};

/** A placed piece located on a tile. */
export type PlacedPiece<A = unknown> = Placed<A, Coords.Coords>;

/** Build a full tile-located supply array at setup — every piece starts pooled. */
export const makeSupply = <A>(count: number, data: A): Array<PlacedPiece<A>> =>
  Array.from({ length: count }, (): PlacedPiece<A> => ({ ...data, at: Option.none() }));

/** Build a full edge-located supply array at setup — every piece starts pooled. */
export const makeEdgeSupply = <A>(count: number, data: A): Array<Placed<A, Edge>> =>
  Array.from({ length: count }, (): Placed<A, Edge> => ({ ...data, at: Option.none() }));

/** Immutable placement: returns a new piece with `at` set. */
export const place = <A, L>(piece: Placed<A, L>, at: L): Placed<A, L> => ({
  ...piece,
  at: Option.some(at),
});

/** Immutable return-to-pool: clears `at`. */
export const returnToPool = <A, L>(piece: Placed<A, L>): Placed<A, L> => ({
  ...piece,
  at: Option.none(),
});

/** How many of a nation's pieces are still in the pool. */
export const poolCount = <A, L>(pieces: ReadonlyArray<Placed<A, L>>): number =>
  pieces.filter((p) => Option.isNone(p.at)).length;

/** How many of a nation's pieces are on the board. */
export const onBoardCount = <A, L>(pieces: ReadonlyArray<Placed<A, L>>): number => pieces.length - poolCount(pieces);
