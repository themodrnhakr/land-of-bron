import { Array, Effect, HashMap, HashSet, Option, Result, Schema } from "effect";
import * as Coords from "./Coords.ts";
import type { Color } from "./Nation.ts";
import type { GameEvent, Phase, State } from "./State.ts";
import type { Tile } from "./Tile.ts";

// ============================================================================
// Move categories
// ============================================================================

/** Mechanical move categories — code-side, never configurable. */
export const MOVE_CATEGORY_IDS = ["action", "react", "trigger", "passive"] as const;
export type MoveCategoryId = typeof MOVE_CATEGORY_IDS[number];

/** The move-category vocabulary, as a schema (for `GameEvent.categories`). */
export const moveCategorySchema = Schema.Literals(MOVE_CATEGORY_IDS);

// ============================================================================
// Event tags
// ============================================================================

/**
 * The named event/trigger kinds a move can emit and react to — a code-side
 * vocabulary, open-ended like `MOVE_CATEGORY_IDS` but authored as moves are
 * written. It is a **different axis** from `MoveCategoryId`: categories say
 * *how* a move is invoked (action/react/trigger/passive), tags say *what
 * happened* and are what `respondsTo` matches against.
 *
 * The list starts minimal (there is no content yet) and grows in Phase 4; it
 * must stay non-empty because `Schema.Literals` rejects an empty tuple.
 */
export const KNOWN_TAGS = ["action"] as const;
export type Tag = typeof KNOWN_TAGS[number];

/** The tag vocabulary, as a schema (for `GameEvent.tags` and `respondsTo`). */
export const tagSchema = Schema.Literals(KNOWN_TAGS);

// ============================================================================
// Bound actions (config references a move by id)
// ============================================================================

/**
 * A bound action: a named move implementation plus static arguments.
 * Dynamic behavior lives in the implementation, never in config.
 *
 * `optional` defaults to `false` and `params` defaults to `{}` when the key is
 * absent (D20): absence means "use the default", not `None`.
 */
export const actionBindingSchema = Schema.Struct({
  move: Schema.String, // key into MOVES, lint-checked
  optional: Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(false))),
  params: Schema.Record(Schema.String, Schema.Unknown).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed({})),
  ),
});
export type ActionBinding = typeof actionBindingSchema.Type;

// ============================================================================
// Move contract
// ============================================================================

export type MoveError =
  | { readonly _tag: "Unimplemented"; readonly move: string }
  | { readonly _tag: "Illegal"; readonly reason: string };

export interface MoveContext {
  readonly state: State;
  readonly actor: Color; // the nation performing the move
  readonly turn: number; // the boardgame.io turn counter (ctx.turn)
  readonly phase: Phase; // the boardgame.io phase (ctx.phase)
  /** The in-flight event, set only while applying an interrupt reaction. */
  readonly pendingEvent?: GameEvent;
}

export interface MoveOutcome {
  readonly state: State;
  /** An interrupt reaction may veto the in-flight event (D13). */
  readonly veto?: boolean;
  /** An interrupt reaction may replace the in-flight event (D13). */
  readonly event?: GameEvent;
}

/**
 * The metadata every move carries: how it is invoked (`categories`) and what
 * event kinds its emitted `GameEvent` carries (`tags`).
 */
export interface MoveMetadata {
  readonly categories: ReadonlyArray<MoveCategoryId>;
  readonly tags?: ReadonlyArray<Tag>;
}

/**
 * A move implementation. `params` is the schema of the values the player
 * supplies (drives the UI and server-side validation); `apply` runs the
 * effect and returns the new state.
 *
 * - `categories` — how the move is invoked (structural).
 * - `tags` — the event kinds the move's emitted `GameEvent` carries.
 * - `respondsTo` — the event kinds this move reacts to (set on react moves).
 */
export interface MoveDefinition<P> extends MoveMetadata {
  readonly respondsTo?: ReadonlyArray<Tag>;
  readonly params: Schema.ConstraintDecoder<P>;
  readonly canApply: (ctx: MoveContext, p: P) => Result.Result<boolean, MoveError>;
  readonly apply: (ctx: MoveContext, p: P) => Result.Result<MoveOutcome, MoveError>;
}

/** A mandate check predicate — code-side, keyed by id from config. */
export interface CheckDefinition<P> {
  readonly params: Schema.ConstraintDecoder<P>;
  readonly check: (state: State, p: P) => boolean;
}

// ============================================================================
// Registries — code keyed by id, referenced from config
// ============================================================================

const pass: MoveDefinition<{}> = {
  categories: ["action"],
  tags: ["action"],
  params: Schema.Struct({}),
  canApply: () => Result.succeed(true),
  apply: (ctx) => Result.succeed({ state: ctx.state }),
};

/** The board cell at `at`, if the board has one. */
const tileAt = (ctx: MoveContext, at: Coords.Coords): Option.Option<Tile> =>
  Array.findFirst(ctx.state.tiles, (t) => t.coords.q === at.q && t.coords.r === at.r);

/**
 * PLACEHOLDER MOVE. The real counter-attack rule is user-provided (Phase 4 is
 * gated on the move set). Its only enforced legality here is structural: the
 * targeted cell must exist on the board, and the event carries the `action`
 * tag it responds to.
 */
const counterAttack: MoveDefinition<{ readonly at: Coords.Coords }> = {
  categories: ["react"],
  respondsTo: ["action"],
  params: Schema.Struct({ at: Coords.coordsSchema }),
  canApply: (ctx, p) => Result.succeed(Option.isSome(tileAt(ctx, p.at))),
  apply: (ctx) => Result.succeed({ state: ctx.state }),
};

/** Move implementations, keyed by id. Config references these by id. */
export const MOVES = { pass, counterAttack };
export type MoveId = keyof typeof MOVES;

const always: CheckDefinition<unknown> = {
  params: Schema.Struct({}),
  check: () => true,
};

/** Mandate check predicates, keyed by id. Config references these by id. */
export const CHECKS: Record<string, CheckDefinition<unknown>> = { always };

// ============================================================================
// Registry id sets (O(1), prototype-safe membership)
// ============================================================================

/**
 * The valid move ids as a `HashSet` — membership without the `in`-operator
 * prototype-chain hole (finding A). Pairs with the catalog indexing of D8.
 */
export const MOVE_IDS: HashSet.HashSet<string> = HashSet.fromIterable(Object.keys(MOVES));

/** The valid check-predicate ids as a `HashSet`. */
export const CHECK_IDS: HashSet.HashSet<string> = HashSet.fromIterable(Object.keys(CHECKS));

// ============================================================================
// Tag usage index (Phase 6 admin portal)
// ============================================================================

const indexBy = (
  pick: (def: MoveDefinition<any>) => ReadonlyArray<Tag> | undefined,
  moves: Record<string, MoveDefinition<any>>,
): HashMap.HashMap<Tag, ReadonlyArray<string>> => {
  let acc = HashMap.empty<Tag, ReadonlyArray<string>>();
  for (const [id, def] of Object.entries(moves)) {
    for (const tag of pick(def) ?? []) {
      const existing = HashMap.get(acc, tag);
      acc = HashMap.set(acc, tag, Option.isSome(existing) ? [...existing.value, id] : [id]);
    }
  }
  return acc;
};

/**
 * Every tag mapped to the moves whose emitted event carries it. The admin
 * portal needs this so an author can pick a `respondsTo` tag and see which
 * moves produce it (D13-Q4 / Phase 6).
 */
export const tagIndex = (
  moves: Record<string, MoveDefinition<any>> = MOVES,
): HashMap.HashMap<Tag, ReadonlyArray<string>> => indexBy((def) => def.tags, moves);

/** Every tag mapped to the react moves that respond to it. */
export const respondsToIndex = (
  moves: Record<string, MoveDefinition<any>> = MOVES,
): HashMap.HashMap<Tag, ReadonlyArray<string>> => indexBy((def) => def.respondsTo, moves);
