import { Array, Effect, HashMap, HashSet, Option, Order, pipe, Schema } from "effect";
import { Coords, Nation } from ".";

export const terrainNameSchema = Schema.String;
export type TerrainName = typeof terrainNameSchema;

export const terrainSchema = Schema.Struct({
  name: terrainNameSchema,
  resistance: Schema.String,
  population: Schema.String,
  count: Schema.Number,
});
export type Terrain = typeof terrainSchema;

export const tileSchema = Schema.Struct({
  color: Nation.colorSchema,
  terrain: terrainNameSchema,
  control: Schema.optional(Nation.colorSchema),
  coords: Coords.coordsSchema,
});
export type Tile = typeof tileSchema;

export const strategySchema = Schema.Literals(["lattice", "frontier"]);
export const Strategy = typeof strategySchema;

export const generateCoordsOpts = Schema.Struct({
  playerCount: Schema.Number,
  strategy: strategySchema,
  seed: Schema.Number.pipe(Schema.withDecodingDefault(
    Effect.succeed(0),
  )),
  // Exact tiles per nation (frontier strategy).
  target: Schema.Number.pipe(Schema.withDecodingDefault(
    Effect.succeed(7),
  )),
  // Random pick pool: closest N% of frontier cells per claim. Lower = smoother
  // borders, higher = more ragged.
  noisePoolFraction: Schema.Number.pipe(Schema.withDecodingDefault(
    Effect.succeed(0.35),
  )),
  // Distance of ring capitals from the center (frontier strategy).
  seedRingDist: Schema.Number.pipe(Schema.withDecodingDefault(
    Effect.succeed(2),
  )),
  // Outward growth limit from the center; keeps the landmass compact. Should
  // be at least seedRingDist + 2 or nations near the rim can run out of room.
  growthCap: Schema.Number.pipe(Schema.withDecodingDefault(
    Effect.succeed(4),
  )),
});
export type GenerateCoordsOpts = typeof generateCoordsOpts.Type;

// --- hex math helpers ---

const ORIGIN: Coords.Coords = { q: 0, r: 0 };

const DIRECTIONS: readonly Coords.Coords[] = [
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
];

// The 7-tile nation shape: capital plus its six surrounding hexes. This shape
// defines the lattice strategy, so it is fixed rather than configurable.
const LOCAL_7_HEX: readonly Coords.Coords[] = [
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
];

const hexDistance = (a: Coords.Coords, b: Coords.Coords): number =>
  (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

const add = (a: Coords.Coords, b: Coords.Coords): Coords.Coords => ({
  q: a.q + b.q,
  r: a.r + b.r,
});

// --- strategy: lattice ---

// Super-lattice offsets (i, j) → nation center (Q, R) via Q = 2i - j, R = i + 3j.
// Packing the 7-tile hex blobs on this lattice tiles the map with zero gaps.
// Defines the strategy, so the positions are fixed rather than configurable.
const SUPER_LATTICE: readonly Coords.Coords[] = [
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
];

const generateLattice = (opts: GenerateCoordsOpts): Array<Array<Coords.Coords>> =>
  // For each nation center (taken from the super lattice)...
  pipe(
    SUPER_LATTICE,
    Array.take(opts.playerCount),
    Array.map((superPos) => {
      // ...convert super coords (i, j) into a real hex center, then stamp the
      // 7-tile local shape at that center.
      const center: Coords.Coords = {
        q: superPos.q * 2 - superPos.r,
        r: superPos.q + superPos.r * 3,
      };
      return pipe(LOCAL_7_HEX, Array.map((offset) => add(center, offset)));
    }),
  );

// --- strategy: frontier ---

// A frontier cell is an unclaimed hex adjacent to a nation's territory.
// `own` is a growth heuristic: how many of its 6 neighbors already belong to
// that nation. own >= 2 means the cell fills a concave notch ("filler"), while
// own === 1 means it extends an arm ("tip"). It exists only during generation.
interface FrontierCell extends Coords.Coords {
  own: number;
}

// The entire growth process is a pure fold over this immutable state: a cell
// → nation map plus a per-nation tile count. Nothing is mutated; every step
// produces a new state.
interface FrontierState {
  map: HashMap.HashMap<Coords.Coords, number>;
  counts: ReadonlyArray<number>;
  seed: number; // PRNG state — threaded purely, advanced one draw per claim
}

// The 6 cells surrounding a given tile.
const neighborsOf = (tile: Coords.Coords): Array<Coords.Coords> => pipe(DIRECTIONS, Array.map((dir) => add(tile, dir)));

// Count how many of a cell's neighbors belong to the given nation.
// Lookups use plain {q,r} objects: v4 structural equality (Equal.equals)
// matches them against the map's keys with no string conversion.
const countOwnNeighbors = (
  map: HashMap.HashMap<Coords.Coords, number>,
  id: number,
  cell: Coords.Coords,
): number =>
  pipe(
    DIRECTIONS,
    Array.reduce(0, (acc, dir) => {
      const owner = HashMap.get(map, { q: cell.q + dir.q, r: cell.r + dir.r });
      return Option.isSome(owner) && owner.value === id ? acc + 1 : acc;
    }),
  );

// All unclaimed cells a nation could claim next: the neighbors of its tiles
// that are still free and inside the growth cap. Purely descriptive — nothing
// is claimed here, only enumerated.
const frontierOf = (
  map: HashMap.HashMap<Coords.Coords, number>,
  id: number,
  growthCap: number,
): Array<FrontierCell> =>
  pipe(
    HashMap.toEntries(map), // every [cell, owner] pair
    Array.filter(([, owner]) => owner === id), // this nation's tiles
    Array.flatMap(([tile]) => neighborsOf(tile)), // the 6 neighbors of each
    Array.filter(
      (cell) => !HashMap.has(map, cell) && hexDistance(cell, ORIGIN) <= growthCap,
    ),
    Array.dedupe, // drop duplicates (structural)
    Array.map((cell) => ({ ...cell, own: countOwnNeighbors(map, id, cell) })),
  );

// A nation that is able to grow in the current round.
interface CandidateRound {
  id: number;
  count: number;
  frontier: Array<FrontierCell>;
}

// Pick the nation to move this round: the most-constrained one (fewest open
// frontier cells; ties broken by smaller size). Because the most-constrained
// nation always moves before anyone can wall it in, every nation is guaranteed
// to reach its target size — this is the invariant that makes "exactly target
// tiles per nation" hold.
const pickMostConstrained = (
  state: FrontierState,
  frontiers: Array<Array<FrontierCell>>,
  target: number,
): Option.Option<CandidateRound> =>
  pipe(
    Array.makeBy(state.counts.length, (id): CandidateRound => ({
      id,
      count: state.counts[id] ?? 0,
      frontier: frontiers[id]!,
    })),
    Array.filter((r) => r.count < target && r.frontier.length > 0),
    Array.reduce(Option.none<CandidateRound>(), (best, r) => {
      if (Option.isNone(best)) return Option.some(r);
      const b = best.value;
      const moreConstrained = r.frontier.length < b.frontier.length
        || (r.frontier.length === b.frontier.length && r.count < b.count);
      return moreConstrained ? Option.some(r) : best;
    }),
  );

// One step of the mulberry32 PRNG: given the current seed, produce a random
// number in [0, 1) plus the next seed. Purely functional — the PRNG state is
// carried inside FrontierState, so a given seed always reproduces the same
// layout with no mutable variables.
const nextRandom = (seed: number): readonly [number, number] => {
  const a = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a >>> 0];
};

// Pick which frontier cell to claim. Filler-first: fill concave notches before
// extending arms, so shapes glob together. Within that pool, pick randomly
// among the closest noisePoolFraction of candidates so borders stay ragged.
const chooseCandidate = (
  candidates: Array<FrontierCell>,
  capital: Coords.Coords,
  noisePoolFraction: number,
  seed: number,
): { cell: Coords.Coords; nextSeed: number } =>
  pipe(
    Array.filter(candidates, (c) => c.own >= 2), // fillers preferred...
    (fillers) => (fillers.length > 0 ? fillers : candidates), // ...tips only as fallback
    Array.sortBy(Order.mapInput(Order.Number, (c) => hexDistance(c, capital))),
    Array.take(Math.max(1, Math.floor(candidates.length * noisePoolFraction))),
    (pool) => {
      const [roll, nextSeed] = nextRandom(seed);
      const chosen = pool[Math.floor(roll * pool.length)]!;
      // Strip the `own` bookkeeping field: map keys must be plain {q,r} so
      // that structural equality matches the cells used in has()/get().
      return { cell: { q: chosen.q, r: chosen.r }, nextSeed };
    },
  );

// Immutable claim: store the cell under the nation and bump its count.
const claim = (
  state: FrontierState,
  id: number,
  cell: Coords.Coords,
  nextSeed: number,
): FrontierState => ({
  map: HashMap.set({ q: cell.q, r: cell.r }, id)(state.map),
  counts: pipe(state.counts, Array.map((c, i) => (i === id ? c + 1 : c))),
  seed: nextSeed,
});

// One growth step: if some nation can still grow, claim exactly one cell for
// the most-constrained one; otherwise signal that the growth is complete.
const round = (
  state: FrontierState,
  opts: GenerateCoordsOpts,
  seeds: ReadonlyArray<Coords.Coords>,
): { state: FrontierState; done: boolean } =>
  pipe(
    Array.makeBy(opts.playerCount, (id) =>
      (state.counts[id] ?? 0) >= opts.target
        ? []
        : frontierOf(state.map, id, opts.growthCap)),
    (frontiers) => pickMostConstrained(state, frontiers, opts.target),
    Option.match({
      onNone: () => ({ state, done: true }), // nobody can grow — finished
      onSome: (r) => {
        const { cell, nextSeed } = chooseCandidate(
          r.frontier,
          seeds[r.id]!,
          opts.noisePoolFraction,
          state.seed,
        );
        return { state: claim(state, r.id, cell, nextSeed), done: false };
      },
    }),
  );

// Fold the rounds until nobody can grow. Purely recursive — Effect.iterate
// isn't in this beta, and the depth (≤ target × playerCount) is tiny.
const grow = (
  state: FrontierState,
  opts: GenerateCoordsOpts,
  seeds: ReadonlyArray<Coords.Coords>,
): FrontierState => {
  const result = round(state, opts, seeds);
  return result.done ? result.state : grow(result.state, opts, seeds);
};

// Capital seeds: one nation at the center, the rest on a ring at seedRingDist.
const makeSeeds = (opts: GenerateCoordsOpts): Array<Coords.Coords> =>
  pipe(
    DIRECTIONS,
    Array.map((dir) => ({ q: dir.q * opts.seedRingDist, r: dir.r * opts.seedRingDist })),
    Array.prepend(ORIGIN),
    Array.take(opts.playerCount),
  );

// Rebuild per-nation territories from the final map. HashMap iteration order
// is not insertion order, so each capital is placed first explicitly and the
// rest is sorted by distance from the capital for a fully deterministic layout.
const groupTerritories = (
  map: HashMap.HashMap<Coords.Coords, number>,
  seeds: ReadonlyArray<Coords.Coords>,
  playerCount: number,
): Array<Array<Coords.Coords>> =>
  pipe(
    Array.makeBy(playerCount, (id) => {
      const capital = seeds[id]!;
      const rest = pipe(
        HashMap.toEntries(map),
        Array.filter(([, owner]) => owner === id),
        Array.map(([cell]) => cell),
        Array.filter((cell) => cell.q !== capital.q || cell.r !== capital.r),
        Array.sortBy(Order.mapInput(Order.Number, (c) => hexDistance(c, capital))),
      );
      return [capital, ...rest];
    }),
  );

const generateFrontier = (opts: GenerateCoordsOpts): Array<Array<Coords.Coords>> => {
  const seeds = makeSeeds(opts);
  // Start with each capital owned by its nation and the PRNG seeded, then
  // grow to completion.
  const initial: FrontierState = {
    map: HashMap.fromIterable(
      pipe(seeds, Array.map((seed, id) => [seed, id] as const)),
    ),
    counts: Array.makeBy(opts.playerCount, () => 1),
    seed: opts.seed >>> 0,
  };
  const final = grow(initial, opts, seeds);
  return groupTerritories(final.map, seeds, opts.playerCount);
};

export const generateCoords = (opts: GenerateCoordsOpts): Array<Array<Coords.Coords>> => {
  // Decoding applies the schema defaults (seed, target, noisePoolFraction,
  // seedRingDist, growthCap) when the caller omits them.
  const o = Schema.decodeSync(generateCoordsOpts)(opts);
  switch (o.strategy) {
    case "lattice":
      return generateLattice(o);
    case "frontier":
      // Deterministic: the same seed always reproduces the same layout — the
      // PRNG seed is part of the fold itself.
      return generateFrontier(o);
  }
};

// Neutral sea: every cell within 1 hex of a nation tile (the border ring),
// plus any enclosed gaps between nations. Sea never extends more than one
// tile beyond a nation border.
export const neutralCoords = (
  nations: Array<Array<Coords.Coords>>,
): Array<Coords.Coords> => {
  // All land tiles, as a HashSet (structural equality → no string keys).
  const land = pipe(
    nations,
    Array.flatMap((territory) => territory),
    Array.reduce(HashSet.empty<Coords.Coords>(), (acc, cell) => HashSet.add(acc, cell)),
  );
  // Sea = the neighbors of land tiles that are not themselves land. Enclosed
  // gaps are included automatically because they touch land.
  const sea = pipe(
    land,
    HashSet.reduce(HashSet.empty<Coords.Coords>(), (acc, cell) =>
      pipe(
        DIRECTIONS,
        Array.reduce(acc, (out, dir) => {
          const neighbor = add(cell, dir);
          return !HashSet.has(land, neighbor) && !HashSet.has(out, neighbor)
            ? HashSet.add(out, neighbor)
            : out;
        }),
      )),
  );
  // Flatten the HashSet into an array for the caller.
  return pipe(
    sea,
    HashSet.reduce([] as Array<Coords.Coords>, (acc, cell) => Array.append(acc, cell)),
  );
};
