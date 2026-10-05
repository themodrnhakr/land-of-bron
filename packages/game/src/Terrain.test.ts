import { describe, expect, test } from "bun:test";
import { Array, ConfigProvider, Effect, HashSet, Option, Result, Schema } from "effect";
import * as Terrain from "./Terrain.ts";

const def = (id: string, tileCount = 1): Terrain.NationTerrain => ({
  id,
  name: id,
  population: 1,
  populationText: "1",
  movement: 1,
  movementText: "1",
  assetId: `a/${id}`,
  tileCount,
  buildableProduction: [],
  maxProduction: 2,
  maxTierTwoProduction: 1,
});

describe("makeTerrainTable", () => {
  test("builds a normalized table with O(1) lookups and a pin", () => {
    const result = Terrain.makeTerrainTable([def("plains", 2), def("forest", 1)], Terrain.DEFAULT_BORDER_TERRAIN);
    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isFailure(result)) return;
    const table = result.success;
    expect(table.nation.map((t) => t.id)).toEqual(["plains", "forest"]);
    expect(Option.isSome(Terrain.terrainById(table, "plains"))).toBe(true);
    expect(Option.isNone(Terrain.terrainById(table, "lava"))).toBe(true);
    expect(HashSet.size(table.allIds)).toBe(3); // plains + forest + sea
    expect(HashSet.has(table.nationIds, "sea")).toBe(false);
    expect(table.pin.hash.length).toBeGreaterThan(0);
  });

  test("rejects duplicate terrain ids", () => {
    const result = Terrain.makeTerrainTable([def("plains"), def("plains")], Terrain.DEFAULT_BORDER_TERRAIN);
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) expect(result.failure.message).toContain("duplicate");
  });

  test("rejects an empty nation terrain table", () => {
    const result = Terrain.makeTerrainTable([], Terrain.DEFAULT_BORDER_TERRAIN);
    expect(Result.isFailure(result)).toBe(true);
  });

  test("requires every hardcoded border id to be configured", () => {
    const result = Terrain.makeTerrainTable([def("plains")], []);
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) expect(result.failure.message).toContain("sea");
  });

  test("the default table is valid and its pool exceeds the default target", () => {
    expect(Terrain.terrainPoolSize(Terrain.DEFAULT_TERRAIN_TABLE)).toBeGreaterThan(7);
  });
});

describe("terrain accessors", () => {
  const table = Terrain.DEFAULT_TERRAIN_TABLE;

  test("hasTerrain and the id sets agree", () => {
    expect(Terrain.hasTerrain(table, "plains")).toBe(true);
    expect(Terrain.hasTerrain(table, "sea")).toBe(true);
    expect(Terrain.hasTerrain(table, "lava")).toBe(false);
  });

  test("population and movement are readable for a known id and 0 for an unknown one", () => {
    const plains = Array.findFirst(table.nation, (t) => t.id === "plains");
    expect(Option.isSome(plains)).toBe(true);
    if (Option.isSome(plains)) {
      expect(Terrain.terrainPopulation(table, "plains")).toBe(plains.value.population);
      expect(Terrain.terrainMovement(table, "plains")).toBe(plains.value.movement);
    }
    expect(Terrain.terrainPopulation(table, "lava")).toBe(0);
    expect(Terrain.terrainMovement(table, "lava")).toBe(0);
  });
});

describe("id schemas", () => {
  const table = Terrain.DEFAULT_TERRAIN_TABLE;

  test("nationTerrainIdsSchema accepts configured nation ids only", () => {
    const schema = Terrain.nationTerrainIdsSchema(table.nation);
    expect(Result.isSuccess(Schema.decodeUnknownResult(schema)("plains"))).toBe(true);
    expect(Result.isSuccess(Schema.decodeUnknownResult(schema)("sea"))).toBe(false);
  });

  test("allTerrainIdsSchema also accepts the border ids", () => {
    const schema = Terrain.allTerrainIdsSchema(table.nation);
    expect(Result.isSuccess(Schema.decodeUnknownResult(schema)("sea"))).toBe(true);
    expect(Result.isSuccess(Schema.decodeUnknownResult(schema)("lava"))).toBe(false);
  });
});

describe("nationTerrainConfig (D21)", () => {
  test("falls back to the default table when no config is provided", () => {
    const nation = Effect.runSync(
      Terrain.nationTerrainConfig.parse(ConfigProvider.fromUnknown({})),
    );
    expect(nation).toEqual(Terrain.DEFAULT_NATION_TERRAIN);
  });

  test("reads a structured table from the provider", () => {
    const custom = [def("swamp", 5)];
    const nation = Effect.runSync(
      Terrain.nationTerrainConfig.parse(ConfigProvider.fromUnknown({ terrain: custom })),
    );
    expect(nation).toEqual(custom);
  });

  test("rejects an invalid terrain definition", () => {
    const bad = [{ ...def("swamp"), population: -1 }];
    const exit = Effect.runSyncExit(
      Terrain.nationTerrainConfig.parse(ConfigProvider.fromUnknown({ terrain: bad })),
    );
    expect(exit._tag).toBe("Failure");
  });

  test("rejects a terrain whose tier-II cap exceeds its total production cap (D53)", () => {
    const bad = [{ ...def("swamp"), maxProduction: 1, maxTierTwoProduction: 2 }];
    const exit = Effect.runSyncExit(
      Terrain.nationTerrainConfig.parse(ConfigProvider.fromUnknown({ terrain: bad })),
    );
    expect(exit._tag).toBe("Failure");
  });
});
