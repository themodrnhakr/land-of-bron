import { Schema } from "effect";
import * as Coords from "./Coords.ts";
import { actionBindingSchema } from "./Moves.ts";
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
 * The player mat: 3 card slots (a list of card ids) plus one slot per domain,
 * each holding an optional chit. Slots are built from the catalog's domains
 * at setup.
 */
export const matSchema = Schema.Struct({
  cards: Schema.Array(Schema.String),
  slots: Schema.Array(Schema.Struct({
    domain: Schema.String,
    chit: Schema.optional(Schema.String),
  })),
});
export type Mat = typeof matSchema.Type;

// ============================================================================
// Chits
// ============================================================================

/**
 * A chit: sits in a mat slot, selects a mandate row, and carries powers.
 * Chits are explicitly nation-mat pieces, so they live with the nation.
 */
export const chitSchema = Schema.Struct({
  id: Schema.String,
  domain: Schema.String, // which mat slot it occupies (lint)
  subtype: Schema.String, // selects the mandate row (lint)
  description: Schema.String,
  powers: Schema.Array(actionBindingSchema),
});
export type Chit = typeof chitSchema.Type;

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

  // --- off-board zones (card ids) ---
  hand: Schema.Array(Schema.String),
  deck: Schema.Array(Schema.String),
  discard: Schema.Array(Schema.String),
  playArea: Schema.Array(Schema.String), // played cards; cleared at end of turn
  mandates: Schema.Array(Schema.String), // private mandate holdings
  mat: matSchema,
  score: Schema.Number, // bonus VP from non-mandate sources (mandate VP is derived)

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
  discard: [],
  playArea: [],
  mandates: [],
  mat: {
    cards: [],
    slots: [],
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
