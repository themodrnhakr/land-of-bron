import { Array, Option, Result, Schema } from "effect";
import * as Cards from "./Cards.ts";
import { type ActionBinding, type MoveContext, type MoveDefinition, MOVES } from "./Moves.ts";
import type { Color, Nation } from "./Nation.ts";
import type { GameEvent, PendingReactions, ReactionDeclaration, ReactionPhase, State } from "./State.ts";

// ============================================================================
// Reaction engine (D13)
// ============================================================================
//
// Pure, deterministic functions over `(state, catalog, event)`:
//   propose event -> interrupt window (fold, may mutate/veto) -> apply ->
//   trigger window (fire, no chaining).
// The window lives in `G.pendingReactions`; boardgame.io stages are transport
// only. Reactions are terminal: an event produced by a reaction never opens
// another window.

/** A registry of move implementations (injectable for tests). */
export type MovesRegistry = Record<string, MoveDefinition<any>>;

// ----------------------------------------------------------------------------
// Eligibility
// ----------------------------------------------------------------------------

/** The reaction bindings a nation currently holds: chit powers + card actions. */
export const reactionBindings = (
  nation: Nation,
  catalog: Cards.Catalog,
): ReadonlyArray<ActionBinding> => {
  const chitPowers = Array.flatMap(nation.mat.slots, (slot) =>
    Option.match(slot.chit, {
      onNone: () => [] as ReadonlyArray<ActionBinding>,
      onSome: (id) =>
        Option.match(Cards.chitById(catalog, id), {
          onNone: () => [] as ReadonlyArray<ActionBinding>,
          onSome: (chit) => chit.powers,
        }),
    }));
  const cardIds = [...nation.hand, ...nation.playArea, ...nation.mat.cards];
  const cardActions = Array.flatMap(cardIds, (id) =>
    Option.match(Cards.cardById(catalog, id), {
      onNone: () => [] as ReadonlyArray<ActionBinding>,
      onSome: (card) => (card.kind === "regular" ? card.actions : ([] as ReadonlyArray<ActionBinding>)),
    }));
  return [...chitPowers, ...cardActions];
};

/** The move category required in each window: react = interrupt, trigger = trigger. */
export const categoryForPhase = (phase: ReactionPhase): "react" | "trigger" =>
  phase === "interrupt" ? "react" : "trigger";

/** Whether a move definition responds to an event *and* belongs to the window. */
export const respondsToEvent = (
  def: MoveDefinition<any> | undefined,
  event: GameEvent,
  phase: ReactionPhase,
): boolean =>
  def !== undefined
  && def.categories.includes(categoryForPhase(phase))
  && def.respondsTo !== undefined
  && def.respondsTo.length > 0
  && def.respondsTo.some((tag) => event.tags.includes(tag));

/** Whether a nation holds any binding whose move responds in this window. */
export const canReact = (
  nation: Nation,
  catalog: Cards.Catalog,
  event: GameEvent,
  phase: ReactionPhase,
  moves: MovesRegistry = MOVES as unknown as MovesRegistry,
): boolean => reactionBindings(nation, catalog).some((binding) => respondsToEvent(moves[binding.move], event, phase));

/**
 * Eligible reactors in resolution order (D13): the event's **target** first if
 * eligible, then every other eligible nation in seat order.
 */
export const eligibleReactors = (
  state: State,
  catalog: Cards.Catalog,
  event: GameEvent,
  phase: ReactionPhase,
  moves: MovesRegistry = MOVES as unknown as MovesRegistry,
): ReadonlyArray<Color> => {
  const eligible = state.nations
    .filter((nation) => canReact(nation, catalog, event, phase, moves))
    .map((nation) => nation.color);
  const target = Option.isSome(event.target) ? event.target.value : undefined;
  if (target !== undefined && eligible.includes(target)) {
    return [target, ...eligible.filter((color) => color !== target)];
  }
  return eligible;
};

// ----------------------------------------------------------------------------
// Window lifecycle
// ----------------------------------------------------------------------------

/** Open a window for an event if anyone can react; `None` otherwise. */
export const openWindow = (
  state: State,
  catalog: Cards.Catalog,
  event: GameEvent,
  phase: ReactionPhase,
  moves: MovesRegistry = MOVES as unknown as MovesRegistry,
): Option.Option<PendingReactions> => {
  const eligible = eligibleReactors(state, catalog, event, phase, moves);
  return eligible.length === 0
    ? Option.none()
    : Option.some({ event, phase, eligible, declarations: [], passed: [] });
};

export type ReactionError =
  | { readonly _tag: "NotEligible"; readonly actor: Color }
  | { readonly _tag: "AlreadyDeclared"; readonly actor: Color }
  | { readonly _tag: "UnknownMove"; readonly move: string }
  | { readonly _tag: "AlreadyPassed"; readonly actor: Color };

/** Record a public declaration. At most one per player per window (D32). */
export const declare = (
  window: PendingReactions,
  actor: Color,
  move: string,
  params: Record<string, unknown>,
  seq: number,
  moves: MovesRegistry = MOVES as unknown as MovesRegistry,
): Result.Result<PendingReactions, ReactionError> => {
  if (!window.eligible.includes(actor)) return Result.fail({ _tag: "NotEligible", actor });
  if (window.declarations.some((d) => d.actor === actor)) {
    return Result.fail({ _tag: "AlreadyDeclared", actor });
  }
  if (!Object.hasOwn(moves, move)) return Result.fail({ _tag: "UnknownMove", move });
  const declaration: ReactionDeclaration = { seq, actor, move, params };
  return Result.succeed({
    ...window,
    declarations: [...window.declarations, declaration],
    passed: window.passed.filter((color) => color !== actor),
  });
};

/** Mark a player as passing. Passing after declaring is a no-op. */
export const pass = (
  window: PendingReactions,
  actor: Color,
): Result.Result<PendingReactions, ReactionError> => {
  if (!window.eligible.includes(actor)) return Result.fail({ _tag: "NotEligible", actor });
  if (window.declarations.some((d) => d.actor === actor)) return Result.succeed(window);
  if (window.passed.includes(actor)) return Result.fail({ _tag: "AlreadyPassed", actor });
  return Result.succeed({ ...window, passed: [...window.passed, actor] });
};

/** Whether every eligible player has declared or passed. */
export const isComplete = (window: PendingReactions): boolean =>
  window.eligible.every((color) => window.passed.includes(color) || window.declarations.some((d) => d.actor === color));

/** The window's declarations in resolution order (declaration order). */
export const orderedDeclarations = (window: PendingReactions): ReadonlyArray<ReactionDeclaration> =>
  [...window.declarations].sort((a, b) => a.seq - b.seq);

// ----------------------------------------------------------------------------
// Resolution
// ----------------------------------------------------------------------------

const applyDeclaration = (
  state: State,
  declaration: ReactionDeclaration,
  event: GameEvent,
  moves: MovesRegistry,
  turn: number,
  phase: ReactionPhase,
): Option.Option<{ readonly state: State; readonly event: GameEvent; readonly veto: boolean }> => {
  const def = moves[declaration.move];
  if (def === undefined) return Option.none();
  const decoded = Schema.decodeUnknownResult(def.params)(declaration.params);
  if (Result.isFailure(decoded)) return Option.none();
  const ctx: MoveContext = {
    state,
    actor: declaration.actor,
    turn,
    phase: "action",
    pendingEvent: event,
  };
  const legal = def.canApply(ctx, decoded.success);
  if (Result.isFailure(legal) || !legal.success) return Option.none();
  const applied = def.apply(ctx, decoded.success);
  if (Result.isFailure(applied)) return Option.none();
  return Option.some({
    state: applied.success.state,
    event: applied.success.event ?? event,
    veto: applied.success.veto === true,
  });
};

export interface InterruptResolution {
  readonly state: State;
  readonly event: GameEvent;
  readonly vetoed: boolean;
}

/**
 * Fold the interrupt declarations over the in-flight event. Each declaration
 * may replace the event or veto it; a veto stops the fold. The declared order
 * is the resolution order (target-first ordering is already baked into who is
 * eligible and how the framework prompts them).
 */
export const resolveInterrupt = (
  state: State,
  window: PendingReactions,
  moves: MovesRegistry = MOVES as unknown as MovesRegistry,
): InterruptResolution => {
  let current = state;
  let event = window.event;
  let vetoed = false;
  for (const declaration of orderedDeclarations(window)) {
    const resolved = applyDeclaration(current, declaration, event, moves, event.turn, window.phase);
    if (Option.isNone(resolved)) continue;
    current = resolved.value.state;
    event = resolved.value.event;
    if (resolved.value.veto) {
      vetoed = true;
      break;
    }
  }
  return { state: current, event, vetoed };
};

/**
 * Apply the **trigger** declarations after the event has resolved. Terminal:
 * any event a reaction move produces is discarded, never enqueued (D13).
 */
export const resolveTrigger = (
  state: State,
  window: PendingReactions,
  moves: MovesRegistry = MOVES as unknown as MovesRegistry,
): State => {
  let current = state;
  for (const declaration of orderedDeclarations(window)) {
    const resolved = applyDeclaration(
      current,
      declaration,
      window.event,
      moves,
      window.event.turn,
      window.phase,
    );
    if (Option.isSome(resolved)) current = resolved.value.state;
  }
  return current;
};

/**
 * Apply an event's own effect: run the originating move's `apply`. Used after
 * the interrupt window closes without a veto.
 */
export const applyEvent = (
  state: State,
  event: GameEvent,
  moves: MovesRegistry = MOVES as unknown as MovesRegistry,
): State => {
  const def = moves[event.move];
  if (def === undefined) return state;
  const decoded = Schema.decodeUnknownResult(def.params)(event.params);
  if (Result.isFailure(decoded)) return state;
  const ctx: MoveContext = { state, actor: event.actor, turn: event.turn, phase: "action" };
  const applied = def.apply(ctx, decoded.success);
  return Result.isFailure(applied) ? state : applied.success.state;
};

/** Append an event to the replayable log. */
export const logEvent = (state: State, event: GameEvent): State => ({
  ...state,
  events: [...state.events, event],
});
