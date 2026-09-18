import { Option } from "effect";
import type { Catalog, MandateCard, MandateRow } from "./Cards.ts";
import { CHECKS } from "./Moves.ts";
import type { Color, Nation } from "./Nation.ts";
import type { State } from "./State.ts";

// ============================================================================
// Mandate scoring (pure selectors over state + catalog)
// ============================================================================

/**
 * The mandate row that applies to a nation for a card: the row whose subtype
 * matches the chit on the nation's mat slot for the card's domain.
 */
export const applicableMandate = (
  nation: Nation,
  card: MandateCard,
  catalog: Catalog,
): Option.Option<MandateRow> => {
  const domain = card.domains[0];
  if (domain === undefined) return Option.none();
  const slot = nation.mat.slots.find((s) => s.domain === domain);
  const chitId = slot?.chit;
  if (chitId === undefined) return Option.none();
  const chit = catalog.chits.find((c) => c.id === chitId);
  if (chit === undefined) return Option.none();
  const row = card.mandates.find((m) => m.subtype === chit.subtype);
  return row === undefined ? Option.none() : Option.some(row);
};

/**
 * Whether the applicable mandate is currently fulfilled. Evaluates the
 * predicate registered under `check.predicate` against the state; `mode`
 * (`endOfGame` vs `event`) is the caller's decision about when to evaluate —
 * the predicate itself reads the state (including `state.events`).
 */
export const mandateFulfilled = (
  state: State,
  nation: Nation,
  card: MandateCard,
  catalog: Catalog,
): boolean => {
  const row = applicableMandate(nation, card, catalog);
  if (Option.isNone(row)) return false;
  const def = CHECKS[row.value.check.predicate];
  if (def === undefined) return false;
  return def.check(state, row.value.check.params ?? {});
};

/**
 * A nation's live victory points: the sum of `vp` over mandate cards the
 * nation holds whose applicable mandate is fulfilled. Live for display; the
 * same function is the end-of-game tally.
 */
export const victoryPoints = (
  state: State,
  catalog: Catalog,
  color: Color,
): number => {
  const nation = state.nations.find((n) => n.color === color);
  if (nation === undefined) return 0;
  let total = 0;
  for (const id of nation.mandates) {
    const card = catalog.cards.find((c) => c.id === id);
    if (card === undefined || card.kind !== "mandate") continue;
    if (mandateFulfilled(state, nation, card, catalog)) total += card.vp;
  }
  return total;
};
