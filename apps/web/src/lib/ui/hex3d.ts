/**
 * Geometry + palette helpers shared by the 3D tile-layout demo.
 *
 * The board is laid out on the X/Z plane with Y up. Axial coordinates map to
 * world space with the same "pointy-top" orientation the 2D demo uses, so the
 * two demos produce visually comparable boards:
 *
 *   x = (q + r / 2) * spacing
 *   z = r * (sqrt(3) / 2) * spacing
 */

/** Circumradius of a hex prism (center → vertex). */
export const HEX_RADIUS = 1;

/** Small visual seam left between neighbouring tiles. */
export const HEX_GAP = 0.06;

/** Center-to-center distance between neighbouring hexes. */
export const HEX_SPACING = Math.sqrt(3) * HEX_RADIUS + HEX_GAP;

/** Extrusion height of a nation tile. */
export const NATION_HEIGHT = 0.56;

/** Extrusion height of a neutral sea tile. */
export const SEA_HEIGHT = 0.12;

/** Nation fill colors, indexed by `nationId`. */
export const NATION_COLORS = [
  "#ef4444",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
] as const;

/** Nation border / highlight colors, indexed by `nationId`. */
export const NATION_BORDER_COLORS = [
  "#fca5a5",
  "#93c5fd",
  "#6ee7b7",
  "#fcd34d",
  "#c4b5fd",
  "#67e8f9",
  "#fbcfe8",
] as const;

/** Neutral / sea tile color. */
export const SEA_COLOR = "#1e293b";

/** Nation names for the status readout, indexed by `nationId`. */
export const NATION_NAMES = [
  "Red Empire",
  "Blue Kingdom",
  "Green Republic",
  "Amber Guild",
  "Purple Dominion",
  "Cyan Alliance",
  "Pink Dynasty",
] as const;

/** A tile ready to hand to the 3D scene. */
export interface Tile3D {
  /** Stable identity, e.g. `"1,-2"`. */
  key: string;
  q: number;
  r: number;
  /** `null` for neutral sea. */
  nationId: number | null;
  /** Centered world X position. */
  x: number;
  /** Centered world Z position. */
  z: number;
}

/** Convert axial coordinates to (uncentered) world X/Z. */
export function axialToWorldXZ(q: number, r: number): { x: number; z: number } {
  return {
    x: (q + r / 2) * HEX_SPACING,
    z: r * (Math.sqrt(3) / 2) * HEX_SPACING,
  };
}
