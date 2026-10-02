import { Hash } from "effect";

/**
 * Recursively sort object keys so two structurally-equal values hash the same
 * regardless of key insertion order. Array order is preserved.
 */
const sortKeysDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([k, v]) => [k, sortKeysDeep(v)]));
  }
  return value;
};

/**
 * A deterministic, key-order-independent content hash for any JSON-shaped
 * value. Used to pin a match to an exact catalog and terrain configuration.
 */
export const structuralHash = (value: unknown): string => Hash.string(JSON.stringify(sortKeysDeep(value))).toString();
