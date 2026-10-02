import { Option, Schema } from "effect";
import * as Coords from "./Coords.ts";
import { actionBindingSchema } from "./Moves.ts";
import {
  influenceFaces,
  makeSupply,
  PIECE_LIMITS,
  type PieceLimits,
  productionKinds,
  religionFaces,
  unitKinds,
} from "./Pieces.ts";

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
 * How many card slots a player mat has. The comment used to claim "3 card
 * slots" while the schema accepted an unbounded array; the cap is now
 * enforced so a mat can never hold more than three cards.
 */
export const MAX_MAT_CARDS = 3;

/**
 * The player mat: `MAX_MAT_CARDS` card slots (a list of card ids) plus one slot
 * per domain, each holding an optional chit. Slots are built from the catalog's
 * domains at setup.
 */
export const matSchema = Schema.Struct({
  cards: Schema.Array(Schema.String).check(Schema.isMaxLength(MAX_MAT_CARDS)),
  slots: Schema.Array(Schema.Struct({
    domain: Schema.String,
    chit: Schema.OptionFromOptional(Schema.String),
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
    at: Schema.OptionFromOptional(Coords.coordsSchema),
  })),
  religion: Schema.Array(Schema.Struct({
    face: religionFaces,
    at: Schema.OptionFromOptional(Coords.coordsSchema),
  })),
  controlChits: Schema.Array(Schema.Struct({
    at: Schema.OptionFromOptional(Coords.coordsSchema),
  })),
  units: Schema.Array(Schema.Struct({
    kind: unitKinds,
    at: Schema.OptionFromOptional(Coords.coordsSchema),
  })),
  production: Schema.Array(Schema.Struct({
    kind: productionKinds,
    at: Schema.OptionFromOptional(Coords.coordsSchema),
  })),
  population: Schema.Array(Schema.Struct({
    at: Schema.OptionFromOptional(Coords.coordsSchema),
  })),
  tradePosts: Schema.Array(Schema.Struct({
    at: Schema.OptionFromOptional(Coords.coordsSchema),
  })),

  // --- unique pieces ---
  // One embassy per other nation; the host is named and the location is
  // derived from that host's capital (D22).
  embassy: Schema.Array(Schema.Struct({ host: colorSchema })),
  // The capital is the nation's single unique location piece.
  capital: Schema.OptionFromOptional(Coords.coordsSchema),
});
export type Nation = typeof nationSchema.Type;

export type Embassy = typeof nationSchema.fields.embassy.Type[number];

// ============================================================================
// Factory
// ============================================================================

/**
 * Build a fresh nation: full supplies in the pool, empty zones, and one empty
 * embassy slot per *other* nation (D22).
 *
 * `limits` defaults to the standard caps; setup can pass per-match overrides.
 * `otherColors` are the other seats in the match; each yields an embassy entry
 * naming that nation as host.
 */
export const makeNation = (
  color: Color,
  name: string,
  limits: PieceLimits = PIECE_LIMITS,
  otherColors: ReadonlyArray<Color> = [],
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
  religion: makeSupply(limits.religion, { face: "proselytized" }),
  controlChits: makeSupply(limits.controlChits, {}),
  units: makeSupply(limits.units, { kind: "army" }),
  production: makeSupply(limits.production, { kind: "farm" }),
  population: makeSupply(limits.population, {}),
  tradePosts: makeSupply(limits.tradePosts, {}),
  embassy: otherColors.filter((c) => c !== color).map((host) => ({ host })),
  capital: Option.none(),
});
