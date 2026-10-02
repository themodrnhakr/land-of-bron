import { Schema } from "effect";
import * as Coords from "./Coords.ts";
import { moveCategorySchema, tagSchema } from "./Moves.ts";
import { colorSchema, type Nation, nationSchema } from "./Nation.ts";
import { type Tile, tileSchema } from "./Tile.ts";

// ============================================================================
// Game configuration
// ============================================================================

/**
 * Game-level identity: the name and the seat range. This is the argument to
 * `Game.Service.make`, not match state — it is deliberately not part of `G`.
 */
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
 *
 * `categories` records how the move was invoked (structural); `tags` records
 * what happened (the semantic event kinds `respondsTo` matches against).
 */
export const gameEventSchema = Schema.Struct({
  seq: Schema.Number,
  move: Schema.String, // registry key
  categories: Schema.Array(moveCategorySchema),
  tags: Schema.Array(tagSchema),
  actor: colorSchema,
  at: Schema.OptionFromOptional(Coords.coordsSchema),
  target: Schema.OptionFromOptional(colorSchema),
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

/** The pinned terrain-config identity for a match (D21/D29). */
export const terrainPinSchema = Schema.Struct({
  version: Schema.String,
  hash: Schema.String,
});
export type TerrainPin = typeof terrainPinSchema.Type;

/**
 * The whole game: the board (tiles, land + sea) and one nation per player
 * (indexed by playerID), the event log, and the pinned catalog + terrain.
 *
 * Turn and phase live in boardgame.io's `ctx`, never here (D12).
 */
export class State extends Schema.TaggedClass<State>()("State", {
  tiles: Schema.Array(tileSchema),
  nations: Schema.Array(nationSchema),
  events: Schema.Array(gameEventSchema),
  catalog: catalogPinSchema,
  terrain: terrainPinSchema,
}) {}

// ============================================================================
// Factory
// ============================================================================

/** Build the initial state: an empty event log, pinned to the catalog + terrain. */
export const make = (
  tiles: Tile[],
  nations: Nation[],
  catalog: CatalogPin,
  terrain: TerrainPin,
): State => new State({ tiles, nations, events: [], catalog, terrain });

// ============================================================================
// Framework boundary (D40)
// ============================================================================
//
// boardgame.io requires `G` to be plain JSON (it runs a serializability check on
// every hook result), while the engine works with the decoded `Type` form
// (`Option` fields, etc.). `setup`, moves and `playerView` therefore encode on
// the way out and decode on the way in.

/** The wire/JSON form stored in `G` (absent keys instead of `None`). */
export type StateEncoded = Schema.Codec.Encoded<typeof State>;

/** Decoded `G` -> plain JSON `G`. */
export const encode = (state: State): StateEncoded => Schema.encodeSync(State)(state);

/** Plain JSON `G` (or any unknown) -> decoded `G`. */
export const decodeUnknown = (input: unknown): State => Schema.decodeUnknownSync(State)(input);
