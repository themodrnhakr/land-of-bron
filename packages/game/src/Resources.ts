import { Config, Context, Effect, HashMap, HashSet, Layer, Option, Result, Schema } from "effect";
import { structuralHash } from "./ContentHash.ts";
import type { TerrainTable } from "./Terrain.ts";

// ============================================================================
// Resources & production (D52/D53)
// ============================================================================
//
// Both are game-level configuration (Effect `Config`), normalized into a table
// keyed by id, pinned in `State`, and linted before use — the same shape as the
// terrain catalogue (`Terrain.ts`). Tile resources are **derived** from the
// production that can be built on a tile; there is no per-tile resource field.

/**
 * Resource tiers. Tier I (basic) is collected from terrain; Tier II (advanced)
 * is manufactured from basic resources.
 */
export const resourceTierSchema = Schema.Literals([1, 2]);
export type ResourceTier = typeof resourceTierSchema.Type;

/** A resource catalogue entry. All values are placeholders until content lands. */
export const resourceSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.String,
  tier: resourceTierSchema,
});
export type Resource = typeof resourceSchema.Type;

/** A quantity of a resource (`{ resourceId, amount }`), used for costs/output. */
export const resourceAmountSchema = Schema.Struct({
  resourceId: Schema.NonEmptyString,
  amount: Schema.Int.check(Schema.isGreaterThan(0)),
});
export type ResourceAmount = typeof resourceAmountSchema.Type;

/**
 * A production type.
 *
 * `resourceCost` is what it takes to build/run it. `resourceProduced` is a list
 * of **alternative output sets**: one inner array means a fixed output; more
 * than one means the owner chooses one set each turn.
 */
export const productionSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.String,
  tier: resourceTierSchema,
  resourceCost: Schema.Array(resourceAmountSchema),
  resourceProduced: Schema.Array(
    Schema.Array(resourceAmountSchema).check(Schema.isMinLength(1)),
  ).check(Schema.isMinLength(1)),
});
export type Production = typeof productionSchema.Type;

/** A validated production id. The valid set is the configured catalogue. */
export const productionIdSchema = Schema.NonEmptyString;
export type ProductionId = typeof productionIdSchema.Type;

// ============================================================================
// Placeholder defaults (shape + config seam are the deliverable, not content)
// ============================================================================

/** Placeholder Tier I + Tier II resources. */
export const DEFAULT_RESOURCES: ReadonlyArray<Resource> = [
  { id: "grain", name: "Grain", tier: 1 },
  { id: "ore", name: "Ore", tier: 1 },
  { id: "timber", name: "Timber", tier: 1 },
  { id: "tools", name: "Tools", tier: 2 },
];

/** Placeholder production catalogue. `workshop` shows a fixed output; every
 * entry with a single inner output array otherwise. */
export const DEFAULT_PRODUCTION: ReadonlyArray<Production> = [
  {
    id: "farm",
    name: "Farm",
    tier: 1,
    resourceCost: [],
    resourceProduced: [[{ resourceId: "grain", amount: 1 }]],
  },
  {
    id: "mine",
    name: "Mine",
    tier: 1,
    resourceCost: [],
    resourceProduced: [[{ resourceId: "ore", amount: 1 }]],
  },
  {
    id: "lumberCamp",
    name: "Lumber Camp",
    tier: 1,
    resourceCost: [],
    resourceProduced: [[{ resourceId: "timber", amount: 1 }]],
  },
  {
    id: "workshop",
    name: "Workshop",
    tier: 2,
    resourceCost: [{ resourceId: "ore", amount: 1 }, { resourceId: "timber", amount: 1 }],
    resourceProduced: [[{ resourceId: "tools", amount: 1 }]],
  },
];

// ============================================================================
// Effect Config
// ============================================================================

/** Resource catalogue, read from Effect Config under `resources` (D52). */
export const resourcesConfig: Config.Config<ReadonlyArray<Resource>> = Config.withDefault(
  Config.schema(Schema.Array(resourceSchema), "resources"),
  DEFAULT_RESOURCES,
);

/** Production catalogue, read from Effect Config under `production` (D52). */
export const productionConfig: Config.Config<ReadonlyArray<Production>> = Config.withDefault(
  Config.schema(Schema.Array(productionSchema), "production"),
  DEFAULT_PRODUCTION,
);

// ============================================================================
// Lint
// ============================================================================

/** A lint finding: where and what. Mirrors `Cards.LintIssue`. */
export type ResourceLintIssue = { readonly path: string; readonly message: string };

/**
 * Validate the resource + production catalogues in isolation: unique ids and
 * every referenced resource id resolving. Structural shapes (positive amounts,
 * non-empty output sets) are already enforced by the schemas.
 */
export const lintProduction = (
  resources: ReadonlyArray<Resource>,
  production: ReadonlyArray<Production>,
): Result.Result<
  { readonly resources: ReadonlyArray<Resource>; readonly production: ReadonlyArray<Production> },
  ReadonlyArray<ResourceLintIssue>
> => {
  const issues: ResourceLintIssue[] = [];

  const resourceIds = new Set<string>();
  for (const r of resources) {
    if (resourceIds.has(r.id)) {
      issues.push({ path: `resources.${r.id}`, message: "duplicate resource id" });
      continue;
    }
    resourceIds.add(r.id);
  }

  const productionIds = new Set<string>();
  for (const p of production) {
    if (productionIds.has(p.id)) {
      issues.push({ path: `production.${p.id}`, message: "duplicate production id" });
      continue;
    }
    productionIds.add(p.id);
    for (const cost of p.resourceCost) {
      if (!resourceIds.has(cost.resourceId)) {
        issues.push({
          path: `production.${p.id}.resourceCost`,
          message: `unknown resource "${cost.resourceId}"`,
        });
      }
    }
    p.resourceProduced.forEach((set, i) => {
      for (const out of set) {
        if (!resourceIds.has(out.resourceId)) {
          issues.push({
            path: `production.${p.id}.resourceProduced.${i}`,
            message: `unknown resource "${out.resourceId}"`,
          });
        }
      }
    });
  }

  return issues.length > 0
    ? Result.fail(issues)
    : Result.succeed({ resources, production });
};

/**
 * Cross-catalogue check: every `buildableProduction` id named by a terrain must
 * exist in the production catalogue. Called at game-service construction, where
 * both tables are available.
 */
export const lintTerrainProduction = (
  terrain: TerrainTable,
  table: ProductionTable,
): Result.Result<void, ReadonlyArray<ResourceLintIssue>> => {
  const issues: ResourceLintIssue[] = [];
  for (const t of terrain.nation) {
    for (const id of t.buildableProduction) {
      if (!HashSet.has(table.productionIds, id)) {
        issues.push({
          path: `terrain.${t.id}.buildableProduction`,
          message: `unknown production "${id}"`,
        });
      }
    }
  }
  return issues.length > 0 ? Result.fail(issues) : Result.succeed(undefined);
};

// ============================================================================
// Normalized table
// ============================================================================

/** The pinned production-config identity (mirrors `State.productionPinSchema`). */
export interface ProductionPin {
  readonly version: string;
  readonly hash: string;
}

/** The normalized, indexed resource + production configuration. */
export interface ProductionTable {
  readonly resources: ReadonlyArray<Resource>;
  readonly production: ReadonlyArray<Production>;
  readonly resourceById: HashMap.HashMap<string, Resource>;
  readonly productionById: HashMap.HashMap<string, Production>;
  readonly resourceIds: HashSet.HashSet<string>;
  readonly productionIds: HashSet.HashSet<string>;
  readonly pin: ProductionPin;
}

export type ProductionTableError = {
  readonly _tag: "InvalidProductionTable";
  readonly issues: ReadonlyArray<ResourceLintIssue>;
};

/**
 * Normalize + validate a resource/production configuration. Total: a `Result`,
 * never a throw.
 */
export const makeProductionTable = (
  resources: ReadonlyArray<Resource>,
  production: ReadonlyArray<Production>,
  version = "1",
): Result.Result<ProductionTable, ProductionTableError> => {
  const linted = lintProduction(resources, production);
  if (Result.isFailure(linted)) {
    return Result.fail({ _tag: "InvalidProductionTable", issues: linted.failure });
  }
  return Result.succeed({
    resources,
    production,
    resourceById: HashMap.fromIterable(resources.map((r): [string, Resource] => [r.id, r])),
    productionById: HashMap.fromIterable(production.map((p): [string, Production] => [p.id, p])),
    resourceIds: HashSet.fromIterable(resources.map((r) => r.id)),
    productionIds: HashSet.fromIterable(production.map((p) => p.id)),
    pin: { version, hash: structuralHash({ resources, production }) },
  });
};

// ============================================================================
// Accessors
// ============================================================================

/** A resource definition by id, if configured. */
export const resourceById = (table: ProductionTable, id: string): Option.Option<Resource> =>
  HashMap.get(table.resourceById, id);

/** A production definition by id, if configured. */
export const productionById = (table: ProductionTable, id: string): Option.Option<Production> =>
  HashMap.get(table.productionById, id);

/** Whether a production id is configured. */
export const hasProduction = (table: ProductionTable, id: string): boolean => HashSet.has(table.productionIds, id);

/** The production (if any) that a terrain allows to be built on it. */
export const buildableProduction = (
  terrain: TerrainTable,
  table: ProductionTable,
  terrainId: string,
): ReadonlyArray<Production> => {
  const def = Option.getOrUndefined(HashMap.get(terrain.byId, terrainId));
  if (def === undefined || !("buildableProduction" in def)) return [];
  return table.production.filter((p) => def.buildableProduction.includes(p.id));
};

/**
 * The resources that can be collected from a terrain tile — the union of the
 * outputs of its buildable production (D52: derived, never stored on the tile).
 */
export const tileResources = (
  terrain: TerrainTable,
  table: ProductionTable,
  terrainId: string,
): ReadonlyArray<Resource> => {
  const ids = new Set<string>();
  for (const p of buildableProduction(terrain, table, terrainId)) {
    for (const set of p.resourceProduced) {
      for (const out of set) ids.add(out.resourceId);
    }
  }
  return table.resources.filter((r) => ids.has(r.id));
};

/** A schema for the configured production ids (factory, like `nationTerrainIdsSchema`). */
export const productionIdsSchema = (table: ReadonlyArray<Production>) =>
  Schema.Literals(table.map((p) => p.id) as [string, ...Array<string>]);

// ============================================================================
// Effect service
// ============================================================================

/** The resource + production table, provided as a service. */
export class ProductionCatalog extends Context.Service<ProductionCatalog, ProductionTable>()(
  "ProductionCatalog",
) {}

/** Build the table from Effect Config at layer-construction time. */
export const ProductionCatalogFromConfig: Layer.Layer<
  ProductionCatalog,
  ProductionTableError | Config.ConfigError
> = Layer.effect(
  ProductionCatalog,
  Effect.gen(function*() {
    const resources = yield* resourcesConfig;
    const production = yield* productionConfig;
    return yield* Effect.fromResult(makeProductionTable(resources, production));
  }),
);

/** A pre-built table for tests and the dev layer. */
export const ProductionCatalogFixture = (table: ProductionTable) => Layer.succeed(ProductionCatalog, table);

/** Build a table from resources + production with the default version. */
export const productionTable = (
  resources: ReadonlyArray<Resource>,
  production: ReadonlyArray<Production>,
): Result.Result<ProductionTable, ProductionTableError> => makeProductionTable(resources, production);

const defaultTableResult = makeProductionTable(DEFAULT_RESOURCES, DEFAULT_PRODUCTION);
if (Result.isFailure(defaultTableResult)) {
  throw new Error(`invalid default production table: ${JSON.stringify(defaultTableResult.failure.issues)}`);
}

/** The default production table (dev layer + tests). */
export const DEFAULT_PRODUCTION_TABLE: ProductionTable = defaultTableResult.success;

/** The default production kind used to fill a fresh nation's pool (placeholder). */
export const DEFAULT_PRODUCTION_KIND: string = DEFAULT_PRODUCTION[0]!.id;
