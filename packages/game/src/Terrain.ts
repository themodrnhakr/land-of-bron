import { Array, Config, Context, Effect, HashMap, HashSet, Layer, Option, Result, Schema } from "effect";
import { structuralHash } from "./ContentHash.ts";
import { productionIdSchema } from "./Resources.ts";

// ============================================================================
// Terrain definitions (D21)
// ============================================================================
//
// Terrain is game-level configuration, not per-match `setupData`: the number of
// nation terrain types and every attribute is injected via Effect `Config`.
// Definitions are normalized into a table keyed by id, pinned in `State` by
// version + hash, and linted against the id vocabularies.

/**
 * A nation ("land") terrain type. Every attribute is user-facing behavior:
 * `population` and `movement` are read by the engine; the display texts and
 * `assetId` are for the client.
 */
export const nationTerrainSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.String, // tile name
  population: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  populationText: Schema.String, // population display text
  movement: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  movementText: Schema.String, // movement display text
  assetId: Schema.String, // client asset id
  tileCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)), // tiles per nation in the draw pool
  // --- buildable production + per-tile caps (D53) ---
  // The production ids are validated against the configured catalogue
  // (`Resources.lintTerrainProduction`), not a static union. Tile resources are
  // derived from these buildable production kinds (D52).
  buildableProduction: Schema.Array(productionIdSchema),
  maxProduction: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)), // max produced pieces per tile
  maxTierTwoProduction: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)), // max Tier-II pieces per tile
}).check(
  Schema.makeFilter((t: { maxProduction: number; maxTierTwoProduction: number }) =>
    t.maxTierTwoProduction > t.maxProduction
      ? [{
        path: ["maxTierTwoProduction"],
        issue: `maxTierTwoProduction (${t.maxTierTwoProduction}) must not exceed maxProduction (${t.maxProduction})`,
      }]
      : []
  ),
);
export type NationTerrain = typeof nationTerrainSchema.Type;

/** The border ("sea") terrain ids are hardcoded. */
export const BORDER_TERRAIN_IDS = ["sea"] as const;
export const borderTerrainIdsSchema = Schema.Literals(BORDER_TERRAIN_IDS);
export type BorderTerrainId = typeof borderTerrainIdsSchema.Type;

/**
 * A border terrain type. The id set is hardcoded, but the attributes mirror the
 * nation terrain shape so features can be tweaked later without a schema change.
 */
export const borderTerrainSchema = Schema.Struct({
  id: borderTerrainIdsSchema,
  name: Schema.String,
  population: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  populationText: Schema.String,
  movement: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  movementText: Schema.String,
  assetId: Schema.String,
  tileCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});
export type BorderTerrain = typeof borderTerrainSchema.Type;

/** Any terrain definition. */
export const allTerrainSchema = Schema.Union([nationTerrainSchema, borderTerrainSchema]);
export type Terrain = typeof allTerrainSchema.Type;

/**
 * A schema for the configured nation terrain ids. Built from the table because
 * the id set is itself configurable, so it cannot be a static literal union.
 */
export const nationTerrainIdsSchema = (table: ReadonlyArray<NationTerrain>) =>
  Schema.Literals(table.map((t) => t.id) as [string, ...Array<string>]);

/** A schema for every terrain id: nation ids plus the hardcoded border ids. */
export const allTerrainIdsSchema = (table: ReadonlyArray<NationTerrain>) =>
  Schema.Literals(
    [...table.map((t) => t.id), ...BORDER_TERRAIN_IDS] as unknown as [string, ...Array<string>],
  );

// ============================================================================
// Defaults
// ============================================================================

/**
 * The default nation terrain table. These values are **placeholders** pending
 * the real game content — the shape and the config seam are what matter here.
 * The tile counts sum to more than the default `target` (7) so the D23 weighted
 * draw always has slack.
 */
export const DEFAULT_NATION_TERRAIN: ReadonlyArray<NationTerrain> = [
  {
    id: "plains",
    name: "Plains",
    population: 3,
    populationText: "3",
    movement: 2,
    movementText: "2",
    assetId: "terrain/plains",
    tileCount: 4,
    // Placeholder caps, matching the D53 example (plains: <= 4 total, <= 2 tier II).
    buildableProduction: ["farm", "workshop"],
    maxProduction: 4,
    maxTierTwoProduction: 2,
  },
  {
    id: "forest",
    name: "Forest",
    population: 2,
    populationText: "2",
    movement: 1,
    movementText: "1",
    assetId: "terrain/forest",
    tileCount: 3,
    buildableProduction: ["farm", "lumberCamp"],
    maxProduction: 3,
    maxTierTwoProduction: 1,
  },
  {
    id: "mountain",
    name: "Mountain",
    population: 1,
    populationText: "1",
    movement: 1,
    movementText: "1",
    assetId: "terrain/mountain",
    tileCount: 2,
    buildableProduction: ["mine", "workshop"],
    maxProduction: 2,
    maxTierTwoProduction: 1,
  },
  {
    id: "desert",
    name: "Desert",
    population: 1,
    populationText: "1",
    movement: 1,
    movementText: "1",
    assetId: "terrain/desert",
    tileCount: 1,
    buildableProduction: ["farm"],
    maxProduction: 1,
    maxTierTwoProduction: 0,
  },
];

/** The default border terrain table (just sea). */
export const DEFAULT_BORDER_TERRAIN: ReadonlyArray<BorderTerrain> = [
  {
    id: "sea",
    name: "Sea",
    population: 0,
    populationText: "0",
    movement: 1,
    movementText: "1",
    assetId: "terrain/sea",
    tileCount: 0,
  },
];

// ============================================================================
// The normalized table
// ============================================================================

/** The catalog pin shape (mirrors `State.catalogPinSchema` without importing it). */
export interface TerrainPin {
  readonly version: string;
  readonly hash: string;
}

/** The normalized, indexed terrain configuration. */
export interface TerrainTable {
  readonly nation: ReadonlyArray<NationTerrain>;
  readonly border: ReadonlyArray<BorderTerrain>;
  readonly byId: HashMap.HashMap<string, Terrain>;
  readonly nationIds: HashSet.HashSet<string>;
  readonly allIds: HashSet.HashSet<string>;
  readonly pin: TerrainPin;
}

export type TerrainTableError = {
  readonly _tag: "InvalidTerrainTable";
  readonly message: string;
};

/**
 * Normalize + validate a terrain configuration. Total: returns a `Result`
 * rather than throwing. Rejects duplicate ids, an empty nation table, and a
 * border table that does not cover every hardcoded border id.
 */
export const makeTerrainTable = (
  nation: ReadonlyArray<NationTerrain>,
  border: ReadonlyArray<BorderTerrain>,
  version = "1",
): Result.Result<TerrainTable, TerrainTableError> => {
  const seen = new Set<string>();
  for (const t of [...nation, ...border]) {
    if (seen.has(t.id)) {
      return Result.fail({
        _tag: "InvalidTerrainTable",
        message: `duplicate terrain id "${t.id}"`,
      });
    }
    seen.add(t.id);
  }
  if (nation.length === 0) {
    return Result.fail({ _tag: "InvalidTerrainTable", message: "no nation terrain configured" });
  }
  for (const borderId of BORDER_TERRAIN_IDS) {
    if (!border.some((b) => b.id === borderId)) {
      return Result.fail({
        _tag: "InvalidTerrainTable",
        message: `border terrain "${borderId}" is not configured`,
      });
    }
  }
  const byId = HashMap.fromIterable(
    [...nation, ...border].map((t): [string, Terrain] => [t.id, t]),
  );
  return Result.succeed({
    nation,
    border,
    byId,
    nationIds: HashSet.fromIterable(nation.map((t) => t.id)),
    allIds: HashSet.fromIterable([...nation, ...border].map((t) => t.id)),
    pin: { version, hash: structuralHash({ nation, border }) },
  });
};

// ============================================================================
// Accessors
// ============================================================================

/** The definition for a terrain id, if configured. */
export const terrainById = (table: TerrainTable, id: string): Option.Option<Terrain> => HashMap.get(table.byId, id);

/** Whether a terrain id is configured. */
export const hasTerrain = (table: TerrainTable, id: string): boolean => HashSet.has(table.allIds, id);

/** Population for a terrain id (engine-readable). */
export const terrainPopulation = (table: TerrainTable, id: string): number =>
  Option.match(HashMap.get(table.byId, id), { onNone: () => 0, onSome: (t) => t.population });

/** Movement for a terrain id (engine-readable). */
export const terrainMovement = (table: TerrainTable, id: string): number =>
  Option.match(HashMap.get(table.byId, id), { onNone: () => 0, onSome: (t) => t.movement });

/** The total size of the nation-terrain draw pool. */
export const terrainPoolSize = (table: TerrainTable): number =>
  Array.reduce(table.nation, 0, (acc, t) => acc + t.tileCount);

// ============================================================================
// Effect Config + service
// ============================================================================

/**
 * The game-level terrain configuration, read from Effect Config under the
 * `terrain` key, defaulting to {@link DEFAULT_NATION_TERRAIN}. Per-match
 * `setupData` never carries terrain (D21).
 */
export const nationTerrainConfig: Config.Config<ReadonlyArray<NationTerrain>> = Config.withDefault(
  Config.schema(Schema.Array(nationTerrainSchema), "terrain"),
  DEFAULT_NATION_TERRAIN,
);

/** The terrain table, provided as a service so `Game.Service` depends on it. */
export class TerrainCatalog extends Context.Service<TerrainCatalog, TerrainTable>()("TerrainCatalog") {}

/** Build the terrain table from Effect Config at layer-construction time. */
export const TerrainCatalogFromConfig: Layer.Layer<
  TerrainCatalog,
  TerrainTableError | Config.ConfigError
> = Layer.effect(
  TerrainCatalog,
  Effect.gen(function*() {
    const nation = yield* nationTerrainConfig;
    return yield* Effect.fromResult(makeTerrainTable(nation, DEFAULT_BORDER_TERRAIN));
  }),
);

/** A pre-built terrain table for tests and the dev layer. */
export const TerrainCatalogFixture = (table: TerrainTable) => Layer.succeed(TerrainCatalog, table);

/** Build a table from just nation terrain, using the default border table. */
export const terrainTableFromNation = (
  nation: ReadonlyArray<NationTerrain>,
): Result.Result<TerrainTable, TerrainTableError> => makeTerrainTable(nation, DEFAULT_BORDER_TERRAIN);

const defaultTableResult = makeTerrainTable(DEFAULT_NATION_TERRAIN, DEFAULT_BORDER_TERRAIN);
if (Result.isFailure(defaultTableResult)) {
  throw new Error(`invalid default terrain table: ${defaultTableResult.failure.message}`);
}

/** The default terrain table, ready to use (the dev layer and tests). */
export const DEFAULT_TERRAIN_TABLE: TerrainTable = defaultTableResult.success;
