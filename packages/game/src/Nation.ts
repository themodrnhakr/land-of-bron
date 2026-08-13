import { Schema } from "effect";
import * as Coords from "./Coords.ts";
import { influenceFaces, makeSupply, PIECE_LIMITS, type PieceLimits, religionFaces, unitKinds } from "./Pieces.ts";

// ============================================================================
// Identity
// ============================================================================

/** The seven playable nation colors. */
export const colorSchema = Schema.Literals(["red", "orange", "yellow", "green", "blue", "indigo", "violet"]);
export type Color = typeof colorSchema.Type;

// ============================================================================
// Player mat
// ============================================================================

/**
 * The player mat: 3 card slots (a list of card ids, at most 3) plus one slot
 * per domain. Layout TBD — slots hold card ids until the rules define them.
 */
export const matSchema = Schema.Struct({
  cards: Schema.Array(Schema.String),
  religion: Schema.optional(Schema.String),
  politics: Schema.optional(Schema.String),
  economy: Schema.optional(Schema.String),
});
export type Mat = typeof matSchema.Type;

// ============================================================================
// Nation = player seat
// ============================================================================

/**
 * A nation (and its player seat): identity + off-board zones + every limited
 * physical piece as an inventory. The inventory arrays ARE the supply —
 * `setup` builds them at exactly `PIECE_LIMITS` length, and `at` unset means
 * the piece is still in the pool.
 */
export const nationSchema = Schema.Struct({
  color: colorSchema,
  name: Schema.String,

  // --- off-board zones ---
  hand: Schema.Array(Schema.String), // card ids
  deck: Schema.Array(Schema.String),
  mat: matSchema,
  score: Schema.Number,

  // --- limited physical pieces: the array IS the supply ---
  influence: Schema.Array(Schema.Struct({
    face: influenceFaces,
    at: Schema.optional(Coords.coordsSchema),
  })),
  religion: Schema.Array(Schema.Struct({
    face: religionFaces,
    at: Schema.optional(Coords.coordsSchema),
  })),
  controlChits: Schema.Array(Schema.Struct({
    at: Schema.optional(Coords.coordsSchema),
  })),
  units: Schema.Array(Schema.Struct({
    kind: unitKinds,
    at: Schema.optional(Coords.coordsSchema),
  })),
  production: Schema.Array(Schema.Struct({
    kind: Schema.String,
    at: Schema.optional(Coords.coordsSchema),
  })),
  population: Schema.Array(Schema.Struct({
    at: Schema.optional(Coords.coordsSchema),
  })),
  tradePosts: Schema.Array(Schema.Struct({
    at: Schema.optional(Coords.coordsSchema),
  })),

  // --- unique pieces (single field — cannot hold two by construction) ---
  embassy: Schema.optional(Coords.coordsSchema),
  capital: Schema.optional(Coords.coordsSchema),
});
export type Nation = typeof nationSchema.Type;

// ============================================================================
// Factory
// ============================================================================

/**
 * Build a fresh nation: full supplies in the pool, empty zones.
 * `limits` defaults to the standard caps; setup can pass per-match overrides.
 */
export const makeNation = (
  color: Color,
  name: string,
  limits: PieceLimits = PIECE_LIMITS,
): Nation => ({
  color,
  name,
  hand: [],
  deck: [],
  mat: {
    cards: [],
    religion: undefined,
    politics: undefined,
    economy: undefined,
  },
  score: 0,
  influence: makeSupply(limits.influence, { face: "influence" }),
  religion: makeSupply(limits.religion, { face: "prosletized" }),
  controlChits: makeSupply(limits.controlChits, {}),
  units: makeSupply(limits.units, { kind: "army" }),
  production: makeSupply(limits.production, { kind: "farm" }),
  population: makeSupply(limits.population, {}),
  tradePosts: makeSupply(limits.tradePosts, {}),
  embassy: undefined,
  capital: undefined,
});
