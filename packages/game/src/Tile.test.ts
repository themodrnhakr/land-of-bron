import { describe, expect, test } from "bun:test";
import { Option, Schema } from "effect";
import * as Coords from "./Coords.ts";
import * as Tile from "./Tile.ts";

describe("Tile.fromCoords", () => {
  test("a land tile has its home colour and no control override", () => {
    const tile = Tile.fromCoords(Coords.ORIGIN, "red", "plains");
    expect(tile.color).toEqual(Option.some("red"));
    expect(Option.isNone(tile.control)).toBe(true); // never written as control = color (D19)
  });

  test("a sea tile has no home colour", () => {
    const tile = Tile.fromCoords({ q: 5, r: 0 }, undefined, "sea");
    expect(Option.isNone(tile.color)).toBe(true);
    expect(Option.isNone(tile.control)).toBe(true);
  });
});

describe("Tile.effectiveControl", () => {
  test("defaults to the home colour when there is no override", () => {
    expect(Tile.effectiveControl(Tile.fromCoords(Coords.ORIGIN, "blue", "plains")))
      .toEqual(Option.some("blue"));
  });

  test("reports the override when one is set", () => {
    const tile = { ...Tile.fromCoords(Coords.ORIGIN, "blue", "plains"), control: Option.some("red" as const) };
    expect(Tile.effectiveControl(tile)).toEqual(Option.some("red"));
    expect(Tile.homeColor(tile)).toEqual(Option.some("blue")); // home is immutable
  });

  test("is None on a sea tile", () => {
    expect(Option.isNone(Tile.effectiveControl(Tile.fromCoords(Coords.ORIGIN, undefined, "sea")))).toBe(true);
  });
});

describe("Tile schema Option round-trip (D20, open question 7)", () => {
  test("encodes None as an absent key and decodes an absent key back to None", () => {
    const tile = Tile.fromCoords(Coords.ORIGIN, "red", "plains");
    const encoded = Schema.encodeSync(Tile.tileSchema)(tile);
    expect(encoded).toEqual({ coords: { q: 0, r: 0 }, terrain: "plains", color: "red" });
    expect("control" in encoded).toBe(false);

    const decoded = Schema.decodeUnknownSync(Tile.tileSchema)(encoded);
    expect(decoded.color).toEqual(Option.some("red"));
    expect(Option.isNone(decoded.control)).toBe(true);
  });

  test("round-trips a control override", () => {
    const tile = { ...Tile.fromCoords(Coords.ORIGIN, "red", "plains"), control: Option.some("blue" as const) };
    const encoded = Schema.encodeSync(Tile.tileSchema)(tile);
    expect(encoded).toMatchObject({ color: "red", control: "blue" });
    const decoded = Schema.decodeUnknownSync(Tile.tileSchema)(encoded);
    expect(decoded.control).toEqual(Option.some("blue"));
  });
});
