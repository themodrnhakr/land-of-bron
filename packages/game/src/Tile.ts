import { Schema } from "effect";
import * as Coords from "./Coords.ts";
import { type Color, colorSchema } from "./Nation.ts";

// ============================================================================
// Tile definitions & contents
// ============================================================================

/** The terrain types that can appear on land tiles. */
export const landTerrainSchema = Schema.Literals(["plains", "forest", "mountain", "desert"]);
export type LandTerrain = typeof landTerrainSchema.Type;

/** The terrain types that exist on the board (land + sea). */
export const terrainNameSchema = Schema.Union([landTerrainSchema, Schema.Literal("sea")]);
export type TerrainName = typeof terrainNameSchema.Type;

/**
 * A tile on the board: geography (coords, terrain, home nation) plus current
 * control. All pieces that sit on a tile live in the owning nation's
 * inventories — the tile itself never duplicates them.
 */
export const tileSchema = Schema.Struct({
  coords: Coords.coordsSchema,
  terrain: terrainNameSchema,
  color: Schema.optional(colorSchema), // home nation; absent on sea tiles
  control: Schema.optional(colorSchema), // current controller
});
export type Tile = typeof tileSchema.Type;

// ============================================================================
// Factory
// ============================================================================

/** Build a tile at a cell. `color` undefined = sea tile (no home nation). */
export const fromCoords = (
  coords: Coords.Coords,
  color: Color | undefined,
  terrain: TerrainName,
): Tile => ({ coords, terrain, color, control: color });
