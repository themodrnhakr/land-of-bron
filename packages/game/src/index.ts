/** Axial/cube coordinates and hex math primitives. */
export * as Coords from "./Coords.ts";

/** Boardgame.io game service. */
export * as Game from "./Game.ts";

/** Game configuration and state schemas. */
export * as State from "./State.ts";

/** Nation definitions: identity, player zones, piece inventories. */
export * as Nation from "./Nation.ts";

/** Tile definitions & contents (geography + control). */
export * as Tile from "./Tile.ts";

/** Per-viewer state redaction for boardgame.io `playerView` (D11). */
export * as View from "./View.ts";

/** Pure reaction engine: windows, declarations, interrupt/trigger resolution (D13). */
export * as Reactions from "./Reactions.ts";

/** Piece definitions: face literals, supply caps, placed-piece helpers. */
export * as Pieces from "./Pieces.ts";

/** Card catalog + schema. */
export * as Cards from "./Cards.ts";

/** Code-side move definitions and mandate check predicates. */
export * as Moves from "./Moves.ts";

/** Victory-point and mandate scoring selectors. */
export * as Scoring from "./Scoring.ts";

/** Per-match setup configuration (boardgame.io setupData) + decoding. */
export * as Setup from "./Setup.ts";

/** Board generation: strategies, options, and errors. */
export * as BoardGeneration from "./BoardGeneration.ts";

/** Individual generation strategies (`Lattice`, `Frontier`). */
export * as BoardGenerationStrategies from "./BoardGenerationStrategies.ts";

/** Terrain definitions, the normalized terrain table, and Effect Config wiring. */
export * as Terrain from "./Terrain.ts";

/** Seeded PRNG helpers shared by generation and terrain selection. */
export * as Random from "./Random.ts";

/** Deterministic, key-order-independent content hashing. */
export * as ContentHash from "./ContentHash.ts";
