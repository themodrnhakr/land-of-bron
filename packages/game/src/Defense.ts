import { Config, Context, Effect, HashMap, HashSet, Layer, Option, Result, Schema } from "effect";
import { structuralHash } from "./ContentHash.ts";
import {
  DEFAULT_PRODUCTION_TABLE,
  ProductionCatalog,
  type ProductionTable,
  resourceAmountSchema,
  type ResourceLintIssue,
} from "./Resources.ts";

// ============================================================================
// Defense structures (D54)
// ============================================================================
//
// A defense structure is a buildable type with a resource cost, a defense
// value, and a **per-nation, per-type cap**. Like terrain/resources it is
// game-level Effect Config; unlike resources/production it is not pinned in
// `State` (it is only consumed while building a nation's supply). The cap is
// structural: `makeNation` builds exactly `cap` pieces of each type.

/** A defense structure type. Values are placeholders until content lands. */
export const defenseStructureSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.String,
  resourceCost: Schema.Array(resourceAmountSchema),
  defensePoints: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  cap: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)), // per-nation cap for this type
});
export type DefenseStructure = typeof defenseStructureSchema.Type;

/** A validated defense-structure id. */
export type DefenseStructureId = DefenseStructure["id"];

/** Placeholder defense-structure catalogue. */
export const DEFAULT_DEFENSE_STRUCTURES: ReadonlyArray<DefenseStructure> = [
  {
    id: "palisade",
    name: "Palisade",
    resourceCost: [{ resourceId: "timber", amount: 1 }],
    defensePoints: 1,
    cap: 4,
  },
  {
    id: "bastion",
    name: "Bastion",
    resourceCost: [{ resourceId: "ore", amount: 1 }],
    defensePoints: 2,
    cap: 2,
  },
];

/** Defense-structure catalogue, read from Effect Config under `defenseStructures`. */
export const defenseStructuresConfig: Config.Config<ReadonlyArray<DefenseStructure>> = Config.withDefault(
  Config.schema(Schema.Array(defenseStructureSchema), "defenseStructures"),
  DEFAULT_DEFENSE_STRUCTURES,
);

// ============================================================================
// Lint + table
// ============================================================================

/** Validate the defense catalogue: unique ids and costs resolving. */
export const lintDefense = (
  defenseStructures: ReadonlyArray<DefenseStructure>,
  production: ProductionTable,
): Result.Result<ReadonlyArray<DefenseStructure>, ReadonlyArray<ResourceLintIssue>> => {
  const issues: ResourceLintIssue[] = [];
  const seen = new Set<string>();
  for (const d of defenseStructures) {
    if (seen.has(d.id)) {
      issues.push({ path: `defenseStructures.${d.id}`, message: "duplicate defense structure id" });
      continue;
    }
    seen.add(d.id);
    for (const cost of d.resourceCost) {
      if (!HashSet.has(production.resourceIds, cost.resourceId)) {
        issues.push({
          path: `defenseStructures.${d.id}.resourceCost`,
          message: `unknown resource "${cost.resourceId}"`,
        });
      }
    }
  }
  return issues.length > 0 ? Result.fail(issues) : Result.succeed(defenseStructures);
};

/** The pinned defense-config identity (not currently recorded in `State`). */
export interface DefensePin {
  readonly version: string;
  readonly hash: string;
}

/** The normalized defense-structure configuration. */
export interface DefenseTable {
  readonly types: ReadonlyArray<DefenseStructure>;
  readonly byId: HashMap.HashMap<string, DefenseStructure>;
  readonly ids: HashSet.HashSet<string>;
  readonly pin: DefensePin;
}

export type DefenseTableError = {
  readonly _tag: "InvalidDefenseTable";
  readonly issues: ReadonlyArray<ResourceLintIssue>;
};

/** Normalize + validate the defense catalogue. Total: a `Result`. */
export const makeDefenseTable = (
  defenseStructures: ReadonlyArray<DefenseStructure>,
  production: ProductionTable,
  version = "1",
): Result.Result<DefenseTable, DefenseTableError> => {
  const linted = lintDefense(defenseStructures, production);
  if (Result.isFailure(linted)) {
    return Result.fail({ _tag: "InvalidDefenseTable", issues: linted.failure });
  }
  return Result.succeed({
    types: defenseStructures,
    byId: HashMap.fromIterable(defenseStructures.map((d): [string, DefenseStructure] => [d.id, d])),
    ids: HashSet.fromIterable(defenseStructures.map((d) => d.id)),
    pin: { version, hash: structuralHash(defenseStructures) },
  });
};

// ============================================================================
// Accessors + service
// ============================================================================

/** A defense structure by id, if configured. */
export const defenseStructureById = (
  table: DefenseTable,
  id: string,
): Option.Option<DefenseStructure> => HashMap.get(table.byId, id);

/** Whether a defense-structure id is configured. */
export const hasDefenseStructure = (table: DefenseTable, id: string): boolean => HashSet.has(table.ids, id);

/** The per-type supply specs used to build a nation's defense pool. */
export const defenseSupplySpec = (
  table: DefenseTable,
): ReadonlyArray<{ readonly id: string; readonly cap: number }> => table.types.map((t) => ({ id: t.id, cap: t.cap }));

/** The defense catalogue, provided as a service. */
export class DefenseCatalog extends Context.Service<DefenseCatalog, DefenseTable>()("DefenseCatalog") {}

/**
 * Build the defense table from Effect Config, linting costs against the
 * production catalogue so an unknown resource cannot slip through.
 */
export const DefenseCatalogFromConfig: Layer.Layer<
  DefenseCatalog,
  DefenseTableError | Config.ConfigError,
  ProductionCatalog
> = Layer.effect(
  DefenseCatalog,
  Effect.gen(function*() {
    const types = yield* defenseStructuresConfig;
    const production = yield* ProductionCatalog;
    return yield* Effect.fromResult(makeDefenseTable(types, production));
  }),
);

/** A pre-built table for tests and the dev layer. */
export const DefenseCatalogFixture = (table: DefenseTable) => Layer.succeed(DefenseCatalog, table);

const defaultTableResult = makeDefenseTable(DEFAULT_DEFENSE_STRUCTURES, DEFAULT_PRODUCTION_TABLE);
if (Result.isFailure(defaultTableResult)) {
  throw new Error(`invalid default defense table: ${JSON.stringify(defaultTableResult.failure.issues)}`);
}

/** The default defense table (dev layer + tests). */
export const DEFAULT_DEFENSE_TABLE: DefenseTable = defaultTableResult.success;
