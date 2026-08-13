import { Option, Schema } from "effect";

// ============================================================================
// Cards
// ============================================================================

/** The kinds of card in the game. */
export const cardKindSchema = Schema.Literals(["action", "event", "reaction"]);
export type CardKind = typeof cardKindSchema.Type;

/** A card definition: full card data lives once in the catalog. */
export const cardSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  kind: cardKindSchema,
  text: Schema.String, // rules text
});
export type Card = typeof cardSchema.Type;

/**
 * The card catalog. State (hand, deck, mat) stores only ids; the full card
 * data is looked up here, so card text never duplicates into player state.
 * Content is pending game design — the list starts empty.
 */
export const CARDS: ReadonlyArray<Card> = [];

/** Look up a card by id (for rendering hands/decks/mats). */
export const cardById = (id: string): Option.Option<Card> => {
  const card = CARDS.find((c) => c.id === id);
  return card === undefined ? Option.none() : Option.some(card);
};
