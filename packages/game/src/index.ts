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
