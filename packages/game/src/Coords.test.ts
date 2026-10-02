import { describe, expect, test } from "bun:test";
import * as Coords from "./Coords.ts";

/** Stable string key for a hex cell — used for set membership in assertions. */
const key = (c: Coords.Coords): string => `${c.q},${c.r}`;

/** A square-ish patch of the hex plane around the origin. */
const PATCH: ReadonlyArray<Coords.Coords> = (() => {
  const cells: Coords.Coords[] = [];
  for (let q = -4; q <= 4; q++) {
    for (let r = -4; r <= 4; r++) cells.push({ q, r });
  }
  return cells;
})();

describe("Coords", () => {
  test("DIRECTIONS is six distinct unit steps that sum to the origin", () => {
    expect(Coords.DIRECTIONS).toHaveLength(6);
    expect(new Set(Coords.DIRECTIONS.map(key)).size).toBe(6);
    for (const d of Coords.DIRECTIONS) {
      expect(Coords.hexDistance(Coords.ORIGIN, d)).toBe(1);
    }
    const sum = Coords.DIRECTIONS.reduce((acc, d) => Coords.add(acc, d), Coords.ORIGIN);
    expect(sum).toEqual(Coords.ORIGIN);
  });

  test("hexDistance is zero exactly on the diagonal, and is symmetric", () => {
    for (const a of PATCH) {
      expect(Coords.hexDistance(a, a)).toBe(0);
      for (const b of PATCH) {
        expect(Coords.hexDistance(a, b)).toBe(Coords.hexDistance(b, a));
      }
    }
  });

  test("hexDistance is 1 exactly between neighbours", () => {
    for (const a of PATCH) {
      const neighbours = Coords.DIRECTIONS.map((d) => Coords.add(a, d));
      for (const n of neighbours) {
        expect(Coords.hexDistance(a, n)).toBe(1);
      }
      for (const b of PATCH) {
        if (b.q === a.q && b.r === a.r) continue;
        if (neighbours.some((n) => n.q === b.q && n.r === b.r)) continue;
        expect(Coords.hexDistance(a, b)).toBeGreaterThan(1);
      }
    }
  });

  test("hexDistance satisfies the triangle inequality", () => {
    for (const a of PATCH) {
      for (const b of PATCH) {
        for (const c of PATCH) {
          expect(Coords.hexDistance(a, c)).toBeLessThanOrEqual(
            Coords.hexDistance(a, b) + Coords.hexDistance(b, c),
          );
        }
      }
    }
  });

  test("add is commutative, associative and has ORIGIN as identity", () => {
    for (const a of PATCH) {
      expect(Coords.add(a, Coords.ORIGIN)).toEqual(a);
      for (const b of PATCH) {
        expect(Coords.add(a, b)).toEqual(Coords.add(b, a));
        for (const c of PATCH) {
          expect(Coords.add(Coords.add(a, b), c)).toEqual(Coords.add(a, Coords.add(b, c)));
        }
      }
    }
  });

  test("toCube/fromCube round-trips and maintains q + r + s === 0", () => {
    for (const a of PATCH) {
      const cube = Coords.toCube(a);
      expect(cube.q + cube.r + cube.s).toBe(0);
      expect(Coords.fromCube(cube)).toEqual(a);
      // fromCube drops `s` even when the input is inconsistent.
      expect(Coords.fromCube({ q: a.q, r: a.r, s: 999 })).toEqual(a);
    }
  });

  test("toCube agrees with hexDistance via cube-space Manhattan distance", () => {
    for (const a of PATCH) {
      for (const b of PATCH) {
        const ca = Coords.toCube(a);
        const cb = Coords.toCube(b);
        const manhattan = (Math.abs(ca.q - cb.q) + Math.abs(ca.r - cb.r) + Math.abs(ca.s - cb.s)) / 2;
        expect(manhattan).toBe(Coords.hexDistance(a, b));
      }
    }
  });
});
