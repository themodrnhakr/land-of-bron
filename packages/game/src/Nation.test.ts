import { describe, expect, test } from "bun:test";
import { Option } from "effect";
import * as Nation from "./Nation.ts";
import { PIECE_LIMITS } from "./Pieces.ts";

describe("makeNation supplies (D52-D56)", () => {
  test("builds the production pool with the configured kind", () => {
    const nation = Nation.makeNation("red", "Red", PIECE_LIMITS, [], { productionKind: "mine" });
    expect(nation.production).toHaveLength(PIECE_LIMITS.production);
    expect(new Set(nation.production.map((p) => p.kind))).toEqual(new Set(["mine"]));
    expect(nation.production.every((p) => Option.isNone(p.at))).toBe(true);
  });

  test("defaults the production kind when none is supplied", () => {
    const nation = Nation.makeNation("red", "Red");
    expect(nation.production.every((p) => p.kind.length > 0)).toBe(true);
  });

  test("builds defense structures per type, respecting each cap", () => {
    const nation = Nation.makeNation("red", "Red", PIECE_LIMITS, [], {
      defenseTypes: [{ id: "palisade", cap: 2 }, { id: "bastion", cap: 1 }],
    });
    expect(nation.defenseStructures.map((p) => p.kind)).toEqual(["palisade", "palisade", "bastion"]);
    expect(nation.defenseStructures.every((p) => Option.isNone(p.at))).toBe(true);
  });

  test("builds supply lines with the encoded maintenance cost", () => {
    const nation = Nation.makeNation("red", "Red", PIECE_LIMITS, [], {
      supplyLineMaintenance: [{ resourceId: "grain", amount: 1 }],
    });
    expect(nation.supplyLines).toHaveLength(PIECE_LIMITS.supplyLines);
    expect(nation.supplyLines[0]!.maintenanceCost).toEqual([{ resourceId: "grain", amount: 1 }]);
    expect(Option.isNone(nation.supplyLines[0]!.at)).toBe(true);
  });

  test("builds edge-located railroad and port pools", () => {
    const nation = Nation.makeNation("red", "Red");
    expect(nation.railroads).toHaveLength(PIECE_LIMITS.railroads);
    expect(nation.ports).toHaveLength(PIECE_LIMITS.ports);
    expect(nation.railroads.every((p) => Option.isNone(p.at))).toBe(true);
    expect(nation.ports.every((p) => Option.isNone(p.at))).toBe(true);
  });

  test("builds the ship pool with the per-type composition", () => {
    const nation = Nation.makeNation("red", "Red");
    expect(nation.ships).toHaveLength(PIECE_LIMITS.ships);
    expect(nation.ships.filter((s) => s.kind === "merchant")).toHaveLength(PIECE_LIMITS.merchantShips);
    expect(nation.ships.filter((s) => s.kind === "naval")).toHaveLength(PIECE_LIMITS.navalShips);
    expect(nation.ships.every((s) => Option.isNone(s.at))).toBe(true);
  });

  test("still creates one embassy per other nation (D22)", () => {
    const nation = Nation.makeNation("red", "Red", PIECE_LIMITS, ["red", "blue", "green"]);
    expect(nation.embassy.map((e) => e.host)).toEqual(["blue", "green"]);
  });
});
