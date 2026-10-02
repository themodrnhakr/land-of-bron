import { Option, Schema } from "effect";
import * as Coords from "./Coords.ts";
import { type Color, colorSchema } from "./Nation.ts";

// ============================================================================
// Tile definitions & contents
// ============================================================================

/**
 * A terrain id. The id is a plain validated string here; the set of valid ids
 * is the configured terrain table (D21), checked at setup and linted against
 * the `nationTerrainIdsSchema` / `allTerrainIdsSchema` factories.
 */
export const terrainIdSchema = Schema.String;
export type TerrainId = typeof terrainIdSchema.Type;

/**
 * A tile on the board: geography (coords, terrain, home nation) plus current
 * control. All pieces that sit on a tile live in the owning nation's
 * inventories — the tile itself never duplicates them.
 *
 * `color` is the immutable home nation (`None` on sea tiles). `control` stores
 * **only an override**: `None` means the home colour controls the tile, so a
 * land tile is never written as `control = color` (D19). Read the effective
 * controller through {@link effectiveControl}, never `tile.control` directly.
 */
export const tileSchema = Schema.Struct({
  coords: Coords.coordsSchema,
  terrain: terrainIdSchema,
  color: Schema.OptionFromOptional(colorSchema), // home nation; None on sea tiles
  control: Schema.OptionFromOptional(colorSchema), // override only; None = home controls
});
export type Tile = typeof tileSchema.Type;

// ============================================================================
// Factory & derived accessors
// ============================================================================

/**
 * Build a tile at a cell. `color` undefined = sea tile (no home nation).
 * The control override always starts `None`.
 */
export const fromCoords = (
  coords: Coords.Coords,
  color: Color | undefined,
  terrain: TerrainId,
): Tile => ({
  coords,
  terrain,
  color: Option.fromUndefinedOr(color),
  control: Option.none(),
});

/**
 * The effective controller of a tile: the explicit override if present,
 * otherwise the immutable home colour. `None` on sea tiles (and any
 * uncontrolled neutral tile).
 */
export const effectiveControl = (tile: Tile): Option.Option<Color> =>
  Option.isSome(tile.control) ? tile.control : tile.color;

/** The immutable home colour of a tile, if it is a land tile. */
export const homeColor = (tile: Tile): Option.Option<Color> => tile.color;
