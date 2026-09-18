import { Result, Schema } from "effect";
import * as Coords from "./Coords.ts";
import type { Color } from "./Nation.ts";
import type { State } from "./State.ts";

// ============================================================================
// Move categories
// ============================================================================

/** Mechanical move categories — code-side, never configurable. */
export const MOVE_CATEGORY_IDS = ["action", "react", "trigger", "passive"] as const;
export type MoveCategoryId = typeof MOVE_CATEGORY_IDS[number];

// ============================================================================
// Bound actions (config references a move by id)
// ============================================================================

/**
 * A bound action: a named move implementation plus static arguments.
 * Dynamic behavior lives in the implementation, never in config.
 */
export const actionBindingSchema = Schema.Struct({
  move: Schema.String, // key into MOVES, lint-checked
  optional: Schema.optional(Schema.Boolean), // player may skip
  params: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)), // static args
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
  readonly turn: number;
}

export interface MoveOutcome {
  readonly state: State;
}

/**
 * A move implementation. `params` is the schema of the values the player
 * supplies (drives the UI and server-side validation); `apply` runs the
 * effect and returns the new state. `respondsTo` is set on react moves.
 */
export interface MoveDefinition<P> {
  readonly categories: ReadonlyArray<MoveCategoryId>;
  readonly respondsTo?: ReadonlyArray<MoveCategoryId>;
  readonly params: Schema.Schema<P>;
  readonly canApply: (ctx: MoveContext, p: P) => Result.Result<boolean, MoveError>;
  readonly apply: (ctx: MoveContext, p: P) => Result.Result<MoveOutcome, MoveError>;
}

/** A mandate check predicate — code-side, keyed by id from config. */
export interface CheckDefinition<P> {
  readonly params: Schema.Schema<P>;
  readonly check: (state: State, p: P) => boolean;
}

// ============================================================================
// Registries — code keyed by id, referenced from config
// ============================================================================

const pass: MoveDefinition<{}> = {
  categories: ["action"],
  params: Schema.Struct({}),
  canApply: () => Result.succeed(true),
  apply: (ctx) => Result.succeed({ state: ctx.state }),
};

const counterAttack: MoveDefinition<{ readonly at: Coords.Coords }> = {
  categories: ["react"],
  respondsTo: ["action"],
  params: Schema.Struct({ at: Coords.coordsSchema }),
  canApply: () => Result.succeed(true),
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
