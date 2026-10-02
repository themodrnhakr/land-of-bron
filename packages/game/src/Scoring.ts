import { Array, HashSet, Option, pipe } from "effect";
import type { Catalog, MandateCard, MandateRow } from "./Cards.ts";
import { CHECK_IDS, CHECKS } from "./Moves.ts";
import type { Color, Nation } from "./Nation.ts";
import type { State } from "./State.ts";

// ============================================================================
// Mandate scoring (pure selectors over state + catalog)
// ============================================================================

/**
 * The mandate row that applies to a nation for a card: the row whose subtype
 * matches the chit on the nation's mat slot for the card's (single) domain.
 */
export const applicableMandate = (
  nation: Nation,
  card: MandateCard,
  catalog: Catalog,
): Option.Option<MandateRow> =>
  pipe(
    Array.findFirst(nation.mat.slots, (s) => s.domain === card.domain),
    Option.flatMap((slot) => slot.chit),
    Option.flatMap((chitId) => Array.findFirst(catalog.chits, (c) => c.id === chitId)),
    Option.flatMap((chit) => Array.findFirst(card.mandates, (m) => m.subtype === chit.subtype)),
  );

/**
 * Whether the applicable mandate is currently fulfilled. The predicate reads
 * the state (including `state.events`); when it is evaluated (end of game vs
 * on an event) is the caller's decision.
 *
 * Hardened (D16): the predicate id is checked against the registry's `HashSet`
 * so a prototype key (`"constructor"`, `"toString"`, ...) returns `false`
 * instead of reaching `Object.prototype` and throwing a `TypeError`.
 */
export const mandateFulfilled = (
  state: State,
  nation: Nation,
  card: MandateCard,
  catalog: Catalog,
): boolean => {
  const row = applicableMandate(nation, card, catalog);
  if (Option.isNone(row)) return false;
  const predicate = row.value.check.predicate;
  if (!HashSet.has(CHECK_IDS, predicate)) return false;
  const def = CHECKS[predicate];
  if (def === undefined || typeof def.check !== "function") return false;
  return def.check(state, row.value.check.params);
};

// ============================================================================
// mandateStatus (D6)
// ============================================================================

/** The status of one mandate holding for one nation. */
export interface MandateStatus {
  readonly color: Color;
  readonly cardId: string;
  readonly row: Option.Option<MandateRow>;
  readonly fulfilled: boolean;
  /** VP earned by this holding right now (0 when unfulfilled). */
  readonly vp: number;
}

const statusForNation = (
  state: State,
  nation: Nation,
  catalog: Catalog,
): ReadonlyArray<MandateStatus> => {
  const out: Array<MandateStatus> = [];
  for (const id of nation.mandates) {
    const found = Array.findFirst(
      catalog.cards,
      (c): c is MandateCard => c.id === id && c.kind === "mandate",
    );
    if (Option.isNone(found)) continue;
    const card = found.value;
    const fulfilled = mandateFulfilled(state, nation, card, catalog);
    out.push({
      color: nation.color,
      cardId: card.id,
      row: applicableMandate(nation, card, catalog),
      fulfilled,
      vp: fulfilled ? card.vp : 0,
    });
  }
  return out;
};

/**
 * Every nation's mandate statuses over the **full** state. Mandates are secret
 * to opponents (D11), so this is the end-of-game / server-side form; use
 * {@link mandateStatusForViewer} for anything a client sees.
 *
 * Mandates are win conditions but do **not** end the game (D6/D11): this feeds
 * scoring and display, never `endIf`.
 */
export const mandateStatus = (
  state: State,
  catalog: Catalog,
): ReadonlyArray<MandateStatus> => Array.flatMap(state.nations, (nation) => statusForNation(state, nation, catalog));

/**
 * The per-viewer form: only the viewer's own mandate statuses. A spectator
 * (`viewer === null`) sees none, because every mandate holding is private.
 */
export const mandateStatusForViewer = (
  state: State,
  catalog: Catalog,
  viewer: Color | null,
): ReadonlyArray<MandateStatus> => {
  if (viewer === null) return [];
  const nation = Array.findFirst(state.nations, (n) => n.color === viewer);
  return Option.isNone(nation) ? [] : statusForNation(state, nation.value, catalog);
};

// ============================================================================
// Victory points
// ============================================================================

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
  const nation = Array.findFirst(state.nations, (n) => n.color === color);
  if (Option.isNone(nation)) return 0;
  return Array.reduce(statusForNation(state, nation.value, catalog), 0, (acc, s) => acc + s.vp);
};
