import { describe, expect, test } from "bun:test";
import { ConfigProvider, Effect, Option, Result, Schema } from "effect";
import * as Resources from "./Resources.ts";
import * as Terrain from "./Terrain.ts";

const resource = (id: string, tier: 1 | 2 = 1): Resources.Resource => ({ id, name: id, tier });
const amount = (resourceId: string, n: number): Resources.ResourceAmount => ({ resourceId, amount: n });
const production = (
  id: string,
  tier: 1 | 2,
  resourceCost: ReadonlyArray<Resources.ResourceAmount>,
  resourceProduced: ReadonlyArray<ReadonlyArray<Resources.ResourceAmount>>,
): Resources.Production => ({ id, name: id, tier, resourceCost, resourceProduced });

describe("makeProductionTable", () => {
  const RESOURCES = [resource("grain"), resource("ore"), resource("tools", 2)];
  const PRODUCTION = [
    production("farm", 1, [], [[amount("grain", 1)]]),
    production("workshop", 2, [amount("ore", 1)], [[amount("tools", 1)]]),
  ];

  test("normalizes into O(1) lookups with a pin", () => {
    const result = Resources.makeProductionTable(RESOURCES, PRODUCTION);
    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isFailure(result)) return;
    const table = result.success;
    expect(Option.isSome(Resources.resourceById(table, "grain"))).toBe(true);
    expect(Option.isNone(Resources.resourceById(table, "gold"))).toBe(true);
    expect(Option.isSome(Resources.productionById(table, "farm"))).toBe(true);
    expect(Resources.hasProduction(table, "farm")).toBe(true);
    expect(Resources.hasProduction(table, "nope")).toBe(false);
    expect(table.pin.hash.length).toBeGreaterThan(0);
  });

  test("rejects duplicate resource ids", () => {
    const result = Resources.makeProductionTable([resource("grain"), resource("grain")], []);
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure.issues.some((i) => i.message.includes("duplicate resource"))).toBe(true);
    }
  });

  test("rejects duplicate production ids", () => {
    const result = Resources.makeProductionTable(RESOURCES, [
      production("farm", 1, [], [[amount("grain", 1)]]),
      production("farm", 1, [], [[amount("grain", 2)]]),
    ]);
    expect(Result.isFailure(result)).toBe(true);
  });

  test("rejects a cost or output referencing an unknown resource", () => {
    const cost = Resources.makeProductionTable(RESOURCES, [
      production("mine", 1, [amount("gold", 1)], [[amount("ore", 1)]]),
    ]);
    expect(Result.isFailure(cost)).toBe(true);
    const out = Resources.makeProductionTable(RESOURCES, [
      production("mine", 1, [], [[amount("gold", 1)]]),
    ]);
    expect(Result.isFailure(out)).toBe(true);
  });

  test("productionIdsSchema accepts configured ids only", () => {
    const schema = Resources.productionIdsSchema(Resources.DEFAULT_PRODUCTION);
    expect(Result.isSuccess(Schema.decodeUnknownResult(schema)("farm"))).toBe(true);
    expect(Result.isSuccess(Schema.decodeUnknownResult(schema)("nonexistent"))).toBe(false);
  });
});

describe("production schema (D52)", () => {
  test("resourceProduced must contain at least one output set", () => {
    const bad = { id: "x", name: "x", tier: 1, resourceCost: [], resourceProduced: [] };
    expect(Result.isFailure(Schema.decodeUnknownResult(Resources.productionSchema)(bad))).toBe(true);
  });

  test("an output set cannot be empty and amounts must be positive", () => {
    const emptySet = { id: "x", name: "x", tier: 1, resourceCost: [], resourceProduced: [[]] };
    expect(Result.isFailure(Schema.decodeUnknownResult(Resources.productionSchema)(emptySet))).toBe(true);
    const zero = {
      id: "x",
      name: "x",
      tier: 1,
      resourceCost: [],
      resourceProduced: [[{ resourceId: "grain", amount: 0 }]],
    };
    expect(Result.isFailure(Schema.decodeUnknownResult(Resources.productionSchema)(zero))).toBe(true);
  });

  test("accepts multiple output sets (choose one per turn)", () => {
    const choose = production("mill", 1, [], [[amount("grain", 1)], [amount("ore", 1)]]);
    expect(Result.isSuccess(Schema.decodeUnknownResult(Resources.productionSchema)(choose))).toBe(true);
  });
});

describe("tile resources are derived from buildable production (D52)", () => {
  const terrain = Terrain.DEFAULT_TERRAIN_TABLE;
  const table = Resources.DEFAULT_PRODUCTION_TABLE;

  test("plains can build farm + workshop, so it yields grain and tools", () => {
    const kinds = Resources.buildableProduction(terrain, table, "plains").map((p) => p.id);
    expect(kinds).toEqual(["farm", "workshop"]);
    const resources = Resources.tileResources(terrain, table, "plains").map((r) => r.id);
    expect(resources.sort()).toEqual(["grain", "tools"]);
  });

  test("sea has no buildable production and therefore no resources", () => {
    expect(Resources.buildableProduction(terrain, table, "sea")).toEqual([]);
    expect(Resources.tileResources(terrain, table, "sea")).toEqual([]);
  });
});

describe("lintTerrainProduction", () => {
  test("flags a terrain that names an unknown production id", () => {
    const def: Terrain.NationTerrain = {
      id: "swamp",
      name: "Swamp",
      population: 1,
      populationText: "1",
      movement: 1,
      movementText: "1",
      assetId: "a/swamp",
      tileCount: 1,
      buildableProduction: ["nonexistent"],
      maxProduction: 1,
      maxTierTwoProduction: 0,
    };
    const terrain = Terrain.makeTerrainTable([def], Terrain.DEFAULT_BORDER_TERRAIN);
    expect(Result.isSuccess(terrain)).toBe(true);
    if (Result.isFailure(terrain)) return;
    const lint = Resources.lintTerrainProduction(terrain.success, Resources.DEFAULT_PRODUCTION_TABLE);
    expect(Result.isFailure(lint)).toBe(true);
    if (Result.isFailure(lint)) expect(lint.failure[0]!.message).toContain("nonexistent");
  });

  test("accepts the default terrain against the default production catalogue", () => {
    const lint = Resources.lintTerrainProduction(
      Terrain.DEFAULT_TERRAIN_TABLE,
      Resources.DEFAULT_PRODUCTION_TABLE,
    );
    expect(Result.isSuccess(lint)).toBe(true);
  });
});

describe("resource/production config (D52)", () => {
  test("falls back to the default catalogue when no config is provided", () => {
    const resources = Effect.runSync(
      Resources.resourcesConfig.parse(ConfigProvider.fromUnknown({})),
    );
    expect(resources).toEqual(Resources.DEFAULT_RESOURCES);
  });

  test("reads custom catalogues from the provider", () => {
    const custom = [resource("swampGas", 2)];
    const resources = Effect.runSync(
      Resources.resourcesConfig.parse(ConfigProvider.fromUnknown({ resources: custom })),
    );
    expect(resources).toEqual(custom);
  });

  test("reads a custom production catalogue from the provider", () => {
    const custom = [production("mill", 1, [], [[amount("grain", 2)]])];
    const prods = Effect.runSync(
      Resources.productionConfig.parse(ConfigProvider.fromUnknown({ production: custom })),
    );
    expect(prods).toEqual(custom);
  });

  test("rejects an invalid resource tier", () => {
    const bad = [{ id: "x", name: "x", tier: 3 }];
    const exit = Effect.runSyncExit(
      Resources.resourcesConfig.parse(ConfigProvider.fromUnknown({ resources: bad })),
    );
    expect(exit._tag).toBe("Failure");
  });
});
