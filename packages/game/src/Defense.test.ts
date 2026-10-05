import { describe, expect, test } from "bun:test";
import { ConfigProvider, Effect, Option, Result } from "effect";
import * as Defense from "./Defense.ts";
import * as Resources from "./Resources.ts";

const d = (
  id: string,
  cap: number,
  resourceCost: ReadonlyArray<Resources.ResourceAmount> = [],
): Defense.DefenseStructure => ({ id, name: id, resourceCost, defensePoints: 1, cap });

describe("makeDefenseTable", () => {
  test("normalizes the catalogue and keeps the per-type caps", () => {
    const result = Defense.makeDefenseTable([d("wall", 3), d("tower", 1)], Resources.DEFAULT_PRODUCTION_TABLE);
    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isFailure(result)) return;
    const table = result.success;
    expect(table.types.map((t) => t.id)).toEqual(["wall", "tower"]);
    expect(Defense.defenseSupplySpec(table)).toEqual([
      { id: "wall", cap: 3 },
      { id: "tower", cap: 1 },
    ]);
    expect(Option.isSome(Defense.defenseStructureById(table, "wall"))).toBe(true);
    expect(Defense.hasDefenseStructure(table, "moat")).toBe(false);
  });

  test("rejects duplicate ids", () => {
    const result = Defense.makeDefenseTable([d("wall", 1), d("wall", 2)], Resources.DEFAULT_PRODUCTION_TABLE);
    expect(Result.isFailure(result)).toBe(true);
  });

  test("rejects a cost referencing an unknown resource", () => {
    const result = Defense.makeDefenseTable(
      [d("wall", 1, [{ resourceId: "mithril", amount: 1 }])],
      Resources.DEFAULT_PRODUCTION_TABLE,
    );
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) expect(result.failure.issues[0]!.message).toContain("mithril");
  });

  test("the default catalogue is valid", () => {
    expect(Defense.DEFAULT_DEFENSE_TABLE.types.length).toBeGreaterThan(0);
  });
});

describe("defenseStructuresConfig", () => {
  test("falls back to the default catalogue", () => {
    const types = Effect.runSync(
      Defense.defenseStructuresConfig.parse(ConfigProvider.fromUnknown({})),
    );
    expect(types).toEqual(Defense.DEFAULT_DEFENSE_STRUCTURES);
  });

  test("rejects a negative cap", () => {
    const exit = Effect.runSyncExit(
      Defense.defenseStructuresConfig.parse(
        ConfigProvider.fromUnknown({ defenseStructures: [d("wall", -1)] }),
      ),
    );
    expect(exit._tag).toBe("Failure");
  });
});
