import type { Color, Nation } from "./Nation.ts";
import { State } from "./State.ts";

// ============================================================================
// playerView redaction (D11)
// ============================================================================
//
// `hand`, `deck`, `mandates` and `mat.cards` are secret to opponents;
// everything else (discard, playArea, mat slots/chits, score, every piece
// pool, embassy, capital) is public. Redaction is a pure function of
// `(state, viewer)` so it can be replayed and tested without the framework.

/**
 * The colour that `playerID` controls, or `null` for a spectator / unknown id.
 * boardgame.io's default player ids are the nation indices as strings.
 */
export const colorForPlayerId = (state: State, playerID: string | null): Color | null => {
  if (playerID === null) return null;
  const index = Number(playerID);
  if (!Number.isInteger(index) || index < 0 || index >= state.nations.length) return null;
  return state.nations[index]!.color;
};

const redactNation = (nation: Nation, visible: boolean): Nation =>
  visible ? nation : {
    ...nation,
    hand: [],
    deck: [],
    mandates: [],
    mat: { ...nation.mat, cards: [] },
  };

/**
 * Redact a state for one viewer. The owner keeps their private zones; every
 * other nation's are emptied. A `null` viewer (spectator) sees none.
 */
export const redactForViewer = (state: State, viewer: Color | null): State =>
  new State({
    ...state,
    nations: state.nations.map((nation) => redactNation(nation, viewer !== null && nation.color === viewer)),
  });
