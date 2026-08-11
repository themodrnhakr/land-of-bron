import { Schema } from "effect";
import { Coords, Nation } from ".";

// Tile definitions & contents: what a tile IS (color, terrain, control,
// coords). Board generation lives in ./BoardGeneration.ts.

export const terrainNameSchema = Schema.String;
export type TerrainName = typeof terrainNameSchema;

export const terrainSchema = Schema.Struct({
  name: terrainNameSchema,
  resistance: Schema.String,
  population: Schema.String,
  count: Schema.Number,
});
export type Terrain = typeof terrainSchema;

export const tileSchema = Schema.Struct({
  color: Nation.colorSchema,
  terrain: terrainNameSchema,
  control: Schema.optional(Nation.colorSchema),
  coords: Coords.coordsSchema,
});
export type Tile = typeof tileSchema;
