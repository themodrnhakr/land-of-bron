import { Schema } from "effect";
import * as Coords from "./Coords.ts";
import { colorSchema, type Nation, nationSchema } from "./Nation.ts";
import { type Tile, tileSchema } from "./Tile.ts";

// ============================================================================
// Game configuration
// ============================================================================

export class Config extends Schema.TaggedClass<Config>()("State/Config", {
  name: Schema.String,
  minPlayers: Schema.Number,
  maxPlayers: Schema.Number,
}) {}

// ============================================================================
// Game state
// ============================================================================

/** The turn-flow phases. Just "action" until the rules define more. */
export const phaseSchema = Schema.Literals(["action"]);
export type Phase = typeof phaseSchema.Type;

/**
 * A structured record of one move execution — the shared substrate for
 * reactions and event-driven mandate checks.
 */
export const gameEventSchema = Schema.Struct({
  seq: Schema.Number,
  move: Schema.String, // registry key
  categories: Schema.Array(Schema.String), // from the move definition (code)
  actor: colorSchema,
  at: Schema.optional(Coords.coordsSchema),
  params: Schema.Record(Schema.String, Schema.Unknown),
  turn: Schema.Number,
});
export type GameEvent = typeof gameEventSchema.Type;

/** The pinned catalog identity for a match. */
export const catalogPinSchema = Schema.Struct({
  version: Schema.String,
  hash: Schema.String,
});
export type CatalogPin = typeof catalogPinSchema.Type;

/**
 * The whole game: the board (tiles, land + sea) and one nation per player
 * (indexed by playerID), the event log, and the pinned catalog.
 */
export class State extends Schema.TaggedClass<State>()("State", {
  tiles: Schema.Array(tileSchema),
  nations: Schema.Array(nationSchema),
  turn: Schema.Number, // current playerID
  phase: phaseSchema,
  events: Schema.Array(gameEventSchema),
  catalog: catalogPinSchema,
}) {}

// ============================================================================
// Factory
// ============================================================================

/** Build the initial state: turn 0 in the "action" phase, empty event log. */
export const make = (tiles: Tile[], nations: Nation[], catalog: CatalogPin): State =>
  new State({ tiles, nations, turn: 0, phase: "action", events: [], catalog });
