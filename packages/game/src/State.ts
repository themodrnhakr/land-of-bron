import { Schema } from "effect";
import { type Nation, nationSchema } from "./Nation.ts";
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
 * The whole game: the board (tiles, land + sea) and one nation per player
 * (indexed by playerID), plus whose turn it is.
 */
export class State extends Schema.TaggedClass<State>()("State", {
  tiles: Schema.Array(tileSchema),
  nations: Schema.Array(nationSchema),
  turn: Schema.Number, // current playerID
  phase: phaseSchema,
}) {}

// ============================================================================
// Factory
// ============================================================================

/** Build the initial state: turn 0 in the "action" phase. */
export const make = (tiles: Tile[], nations: Nation[]): State =>
  new State({ tiles, nations, turn: 0, phase: "action" });
