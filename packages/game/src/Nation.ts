import { Option, Schema } from "effect";
import * as Coords from "./Coords.ts";
import { edgeSchema } from "./Edges.ts";
import { actionBindingSchema } from "./Moves.ts";
import {
  defenseStructureKindSchema,
  influenceFaces,
  makeEdgeSupply,
  makeSupply,
  PIECE_LIMITS,
  type PieceLimits,
  productionIdSchema,
  religionFaces,
  shipKinds,
  unitKinds,
} from "./Pieces.ts";
import { DEFAULT_PRODUCTION_KIND, type ResourceAmount, resourceAmountSchema } from "./Resources.ts";

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
    kind: productionIdSchema,
    at: Schema.OptionFromOptional(Coords.coordsSchema),
  })),
  // --- built facilities (D54) ---
  // Defense structures, one type per catalogue entry, capped per type (D54).
  defenseStructures: Schema.Array(Schema.Struct({
    kind: defenseStructureKindSchema,
    at: Schema.OptionFromOptional(Coords.coordsSchema),
  })),
  // Supply lines carry their (deferred) upkeep cost (D57).
  supplyLines: Schema.Array(Schema.Struct({
    at: Schema.OptionFromOptional(Coords.coordsSchema),
    maintenanceCost: Schema.Array(resourceAmountSchema),
  })),
  // --- edge pieces (D55) ---
  railroads: Schema.Array(Schema.Struct({
    at: Schema.OptionFromOptional(edgeSchema),
  })),
  ports: Schema.Array(Schema.Struct({
    at: Schema.OptionFromOptional(edgeSchema),
  })),
  // --- ships (D56): a separate, nation-coloured sea supply ---
  ships: Schema.Array(Schema.Struct({
    kind: shipKinds,
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
 * Options that let `setup` build a nation's configurable supplies from the
 * catalogues (production kind, defense types + per-type caps, supply-line
 * upkeep). All optional so direct `makeNation` calls stay ergonomic.
 */
export interface NationSupplySpec {
  /** Default kind for the production pool (a configured production id). */
  readonly productionKind?: string;
  /** Defense types and their per-nation caps (D54). */
  readonly defenseTypes?: ReadonlyArray<{ readonly id: string; readonly cap: number }>;
  /** Encoded (deferred) upkeep cost applied to every supply line (D57). */
  readonly supplyLineMaintenance?: ReadonlyArray<ResourceAmount>;
}

/**
 * Build the nation's ship pool (D56): `ships` pieces, `merchantShips`
 * merchants and `navalShips` navies, with any infeasible remainder filled as
 * merchants. `Setup` rejects infeasible caps before this runs.
 */
const makeShipSupply = (limits: PieceLimits) => {
  const merchants = Math.min(limits.merchantShips, limits.ships);
  const navies = Math.min(limits.navalShips, limits.ships - merchants);
  const filler = limits.ships - merchants - navies;
  return [
    ...makeSupply(merchants, { kind: "merchant" as const }),
    ...makeSupply(navies, { kind: "naval" as const }),
    ...makeSupply(filler, { kind: "merchant" as const }),
  ];
};

/**
 * Build a fresh nation: full supplies in the pool, empty zones, and one empty
 * embassy slot per *other* nation (D22).
 *
 * `limits` defaults to the standard caps; setup can pass per-match overrides.
 * `otherColors` are the other seats in the match; each yields an embassy entry
 * naming that nation as host. `spec` fills the configurable supplies from the
 * production/defense catalogues.
 */
export const makeNation = (
  color: Color,
  name: string,
  limits: PieceLimits = PIECE_LIMITS,
  otherColors: ReadonlyArray<Color> = [],
  spec: NationSupplySpec = {},
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
  production: makeSupply(limits.production, { kind: spec.productionKind ?? DEFAULT_PRODUCTION_KIND }),
  defenseStructures: (spec.defenseTypes ?? []).flatMap((t) => makeSupply(t.cap, { kind: t.id })),
  supplyLines: makeSupply(limits.supplyLines, { maintenanceCost: spec.supplyLineMaintenance ?? [] }),
  railroads: makeEdgeSupply(limits.railroads, {}),
  ports: makeEdgeSupply(limits.ports, {}),
  ships: makeShipSupply(limits),
  population: makeSupply(limits.population, {}),
  tradePosts: makeSupply(limits.tradePosts, {}),
  embassy: otherColors.filter((c) => c !== color).map((host) => ({ host })),
  capital: Option.none(),
});
