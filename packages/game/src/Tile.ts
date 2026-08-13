import { Schema } from "effect";
import { Coords, Nation } from ".";

// Tile definitions & contents: what a tile IS (color, terrain, control,
// coords). Board generation lives in ./BoardGeneration.ts.

/** A terrain name (currently any string). */
export const terrainNameSchema = Schema.String;
export type TerrainName = typeof terrainNameSchema;

/** A terrain definition: name, resistance, population, and count. */
export const terrainSchema = Schema.Struct({
  name: terrainNameSchema,
  resistance: Schema.String,
  population: Schema.String,
  count: Schema.Number,
});
export type Terrain = typeof terrainSchema.Type;

/** A tile on the board: nation color, terrain, optional control, and coords. */
export const tileSchema = Schema.Struct({
  color: Nation.colorSchema,
  terrain: terrainNameSchema,
  control: Schema.optional(Nation.colorSchema),
  coords: Coords.coordsSchema,
});
export type Tile = typeof tileSchema.Type;
