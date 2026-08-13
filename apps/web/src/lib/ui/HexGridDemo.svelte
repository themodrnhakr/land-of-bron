<script lang="ts">
import { BoardGeneration } from "@land-of-bron/game";

// --- TYPES & CONSTANTS ---
type Strategy = "lattice" | "spaced" | "organic" | "ragged";

interface TileData {
  q: number;
  r: number;
  nationId: number | null; // null represents Sea / Neutral
}

const NATION_COLORS = [
  { bg: "#ef4444", border: "#fca5a5", name: "Red Empire" },
  { bg: "#3b82f6", border: "#93c5fd", name: "Blue Kingdom" },
  { bg: "#10b981", border: "#6ee7b7", name: "Green Republic" },
  { bg: "#f59e0b", border: "#fcd34d", name: "Amber Guild" },
  { bg: "#8b5cf6", border: "#c4b5fd", name: "Purple Dominion" },
  { bg: "#06b6d4", border: "#67e8f9", name: "Cyan Alliance" },
  { bg: "#ec4899", border: "#fbcfe8", name: "Pink Dynasty" },
];

const SEA_COLOR = { bg: "#0f172a", border: "#1e293b" };

const LOCAL_7_HEX = [
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
];

const DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
];

const DEFAULT_SEED = 6345; // the demo's default ragged layout

// --- COMPONENT STATE ---
let strategy = $state<Strategy>("lattice");
let nationCount = $state<number>(4);
let tileWidth = $state<number>(54);
let gap = $state<number>(4);
let hoveredTile = $state<TileData | null>(null);
// Pan state for dragging around the map with the mouse/touch.
let panX = $state<number>(0);
let panY = $state<number>(0);
let dragging = $state<boolean>(false);
let dragStart = $state({ x: 0, y: 0, panX: 0, panY: 0 });
let raggedSeed = $state<number>(DEFAULT_SEED); // deterministic seed for the Ragged Frontier strategy
let useGamePkg = $state<boolean>(false); // use the @land-of-bron/game Tile generator instead of the local demo code
let showNeutral = $state<boolean>(true); // toggle sea / neutral tile rendering

// --- MATH HELPERS ---
function hexDistance(
  a: { q: number; r: number },
  b: { q: number; r: number },
): number {
  return (
    (Math.abs(a.q - b.q)
      + Math.abs(a.q + a.r - b.q - b.r)
      + Math.abs(a.r - b.r)) / 2
  );
}

// Deterministic seeded PRNG (mulberry32). Used so that a given
// (strategy, nationCount, seed) combo always reproduces the same layout.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- GENERATOR ALGORITHMS ---

// Strategy 1: Interlocking Zero-Gap Lattice Math
function generateLatticeMap(count: number): TileData[] {
  // Basis vectors for zero-gap super-hex lattice
  const SUPER_OFFSETS = [
    { i: 0, j: 0 },
    { i: 1, j: 0 },
    { i: 0, j: 1 },
    { i: -1, j: 1 },
    { i: -1, j: 0 },
    { i: 0, j: -1 },
    { i: 1, j: -1 },
  ];

  const tiles: TileData[] = [];
  for (let id = 0; id < count; id++) {
    const superPos = SUPER_OFFSETS[id];
    // Convert super-lattice coords (i,j) to global hex coords (Q,R)
    const centerQ = superPos.i * 2 + superPos.j * -1;
    const centerR = superPos.i * 1 + superPos.j * 3;

    LOCAL_7_HEX.forEach((off) => {
      tiles.push({
        q: centerQ + off.q,
        r: centerR + off.r,
        nationId: id,
      });
    });
  }
  return tiles;
}

// Strategy 2: Spaced Nations + Automatic Sea Fill
function generateSpacedMap(count: number): TileData[] {
  const RING_CENTERS = [
    { q: 0, r: 0 },
    { q: 4, r: 0 },
    { q: 0, r: 4 },
    { q: -4, r: 4 },
    { q: -4, r: 0 },
    { q: 0, r: -4 },
    { q: 4, r: -4 },
  ];

  const map = new Map<string, TileData>();
  const activeCenters = RING_CENTERS.slice(0, count);

  // 1. Assign Nation Tiles
  activeCenters.forEach((center, id) => {
    LOCAL_7_HEX.forEach((off) => {
      const q = center.q + off.q;
      const r = center.r + off.r;
      map.set(`${q},${r}`, { q, r, nationId: id });
    });
  });

  // 2. Fill background sea tiles inside radius 5
  const mapRadius = 5;
  for (let q = -mapRadius; q <= mapRadius; q++) {
    const r1 = Math.max(-mapRadius, -q - mapRadius);
    const r2 = Math.min(mapRadius, -q + mapRadius);
    for (let r = r1; r <= r2; r++) {
      const key = `${q},${r}`;
      if (!map.has(key)) {
        map.set(key, { q, r, nationId: null });
      }
    }
  }

  return Array.from(map.values());
}

// Strategy 3: Organic Voronoi Multi-Source BFS Growth
function generateOrganicMap(count: number): TileData[] {
  const SEEDS = [
    { q: 0, r: 0 },
    { q: 3, r: -1 },
    { q: 1, r: 3 },
    { q: -3, r: 3 },
    { q: -3, r: 0 },
    { q: -1, r: -3 },
    { q: 3, r: -3 },
  ].slice(0, count);

  const map = new Map<string, TileData>();
  const counts = new Array(count).fill(0);

  // Set initial seed tiles
  SEEDS.forEach((seed, id) => {
    map.set(`${seed.q},${seed.r}`, {
      q: seed.q,
      r: seed.r,
      nationId: id,
    });
    counts[id] = 1;
  });

  // Grow step-by-step until all nations have 7 tiles
  let growing = true;
  while (growing) {
    growing = false;
    for (let id = 0; id < count; id++) {
      if (counts[id] >= 7) continue;

      const candidates: { q: number; r: number }[] = [];
      for (const tile of map.values()) {
        if (tile.nationId !== id) continue;
        for (const dir of DIRECTIONS) {
          const nq = tile.q + dir.q;
          const nr = tile.r + dir.r;
          const key = `${nq},${nr}`;
          if (
            !map.has(key) && !candidates.some(c => c.q === nq && c.r === nr)
          ) {
            candidates.push({ q: nq, r: nr });
          }
        }
      }

      if (candidates.length > 0) {
        // Sort candidates by closeness to the seed tile to keep shapes coherent
        candidates.sort((a, b) =>
          hexDistance(a, SEEDS[id]) - hexDistance(b, SEEDS[id])
        );
        const chosen = candidates[0];
        map.set(`${chosen.q},${chosen.r}`, {
          q: chosen.q,
          r: chosen.r,
          nationId: id,
        });
        counts[id]++;
        growing = true;
      }
    }
  }

  // Fill surrounding sea frame
  const mapRadius = 5;
  for (let q = -mapRadius; q <= mapRadius; q++) {
    const r1 = Math.max(-mapRadius, -q - mapRadius);
    const r2 = Math.min(mapRadius, -q + mapRadius);
    for (let r = r1; r <= r2; r++) {
      const key = `${q},${r}`;
      if (!map.has(key)) {
        map.set(key, { q, r, nationId: null });
      }
    }
  }

  return Array.from(map.values());
}

// Strategy 4: Ragged Frontier — noisy growth, ragged borders, and a small
// amount of neutral space scattered as thin seams between nations. Every
// nation gets exactly TARGET tiles (matching the other strategies' 7-tile sets).
// Takes a seeded rng so the layout is fully reproducible for a given seed.
function generateRaggedMap(count: number, rng: () => number): TileData[] {
  // Tunable knobs:
  const SEED_RING_DIST = 2; // distance of the seed ring from the center
  const TARGET = 7; // exact tiles per nation
  // Pick randomly among the closest N% of frontier cells each claim.
  // 0 = strictly closest (clean Voronoi), 1 = fully random (spaghetti).
  const NOISE_POOL_FRACTION = 0.35;
  // Cap outward growth so the landmass stays compact (thin sea frame).
  const GROWTH_CAP = SEED_RING_DIST + 2;

  interface FrontierCell {
    q: number;
    r: number;
    own: number; // own-nation neighbors (fillers ≥ 2, tips = 1)
  }

  const RING_OFFSETS = [
    { q: 1, r: 0 },
    { q: 0, r: 1 },
    { q: -1, r: 1 },
    { q: -1, r: 0 },
    { q: 0, r: -1 },
    { q: 1, r: -1 },
  ];

  const SEEDS = [
    { q: 0, r: 0 },
    ...RING_OFFSETS.map((o) => ({ q: o.q * SEED_RING_DIST, r: o.r * SEED_RING_DIST })),
  ].slice(0, count);

  const map = new Map<string, TileData>();
  SEEDS.forEach((seed, id) => {
    map.set(`${seed.q},${seed.r}`, {
      q: seed.q,
      r: seed.r,
      nationId: id,
    });
  });
  const counts = new Array<number>(count).fill(1);

  const frontierOf = (id: number): FrontierCell[] => {
    const out: FrontierCell[] = [];
    for (const tile of map.values()) {
      if (tile.nationId !== id) continue;
      for (const dir of DIRECTIONS) {
        const nq = tile.q + dir.q;
        const nr = tile.r + dir.r;
        const key = `${nq},${nr}`;
        if (
          !map.has(key) &&
          !out.some((c) => c.q === nq && c.r === nr) &&
          hexDistance({ q: nq, r: nr }, { q: 0, r: 0 }) <= GROWTH_CAP
        ) {
          // Count own-nation neighbors so we can distinguish "filler" cells
          // (fill concave notches) from "tip" cells (extend arms).
          let own = 0;
          for (const d2 of DIRECTIONS) {
            const n2 = map.get(`${nq + d2.q},${nr + d2.r}`);
            if (n2 && n2.nationId === id) own++;
          }
          out.push({ q: nq, r: nr, own });
        }
      }
    }
    return out;
  };

  // Grow every nation to exactly TARGET tiles. The most-constrained nation
  // (fewest open frontier cells) always moves first, so nobody can get boxed
  // in below its target; the noisy pick keeps borders ragged.
  let guard = 0;
  while (guard < 3000) {
    guard++;
    const frontiers = new Array<FrontierCell[]>(count);
    for (let id = 0; id < count; id++) {
      const c = counts[id] ?? 0;
      frontiers[id] = c >= TARGET ? [] : frontierOf(id);
    }

    let bestId = -1;
    let bestFrontier = Infinity;
    let bestCount = Infinity;
    for (let id = 0; id < count; id++) {
      const c = counts[id] ?? 0;
      const f = frontiers[id]?.length ?? 0;
      if (c >= TARGET || f === 0) continue;
      if (f < bestFrontier || (f === bestFrontier && c < bestCount)) {
        bestFrontier = f;
        bestCount = c;
        bestId = id;
      }
    }
    if (bestId < 0) break;

    const seed = SEEDS[bestId]!;
    // Filler-first: prefer cells that fill concave notches (2+ own neighbors)
    // over tip cells (1 neighbor) that would grow thin arms / peninsulas.
    // Tips only get claimed when no fillers remain, so shapes glob together.
    let candidates = frontiers[bestId]!;
    const fillers = candidates.filter((c) => c.own >= 2);
    if (fillers.length > 0) candidates = fillers;
    candidates.sort((a, b) =>
      hexDistance(a, seed) - hexDistance(b, seed),
    );
    const poolSize = Math.max(1, Math.floor(candidates.length * NOISE_POOL_FRACTION));
    const chosen = candidates[Math.floor(rng() * poolSize)]!;

    map.set(`${chosen.q},${chosen.r}`, {
      q: chosen.q,
      r: chosen.r,
      nationId: bestId,
    });
    counts[bestId] = (counts[bestId] ?? 0) + 1;
  }

  // Neutral sea: only cells within 1 hex of the landmass (a border ring)
  // plus interior gaps, which are enclosed by land and therefore adjacent
  // to it. Sea never extends more than 1 tile beyond any nation border.
  const sea = new Map<string, TileData>();
  for (const tile of map.values()) {
    if (tile.nationId === null) continue;
    for (const dir of DIRECTIONS) {
      const nq = tile.q + dir.q;
      const nr = tile.r + dir.r;
      const key = `${nq},${nr}`;
      if (!map.has(key) && !sea.has(key)) {
        sea.set(key, { q: nq, r: nr, nationId: null });
      }
    }
  }
  for (const tile of sea.values()) {
    map.set(`${tile.q},${tile.r}`, tile);
  }

  return Array.from(map.values());
}

// Reactive Map Generation
let tiles = $derived.by(() => {
  // Game-package implementation (packages/game/src/BoardGeneration.ts):
  // supports lattice and frontier only. Used to cross-check parity against
  // the local generators below (the same seed should produce the same layout).
  if (useGamePkg && (strategy === "lattice" || strategy === "ragged")) {
    const result = BoardGeneration.generateCoords({
      playerCount: nationCount,
      strategy: strategy === "ragged" ? "frontier" : "lattice",
      seed: raggedSeed,
      target: 7,
      noisePoolFraction: 0.35,
      seedRingDist: 2,
      growthCap: 4,
    });
    if (result._tag === "Failure") {
      throw new Error(
        `BoardGeneration.generateCoords failed: ${result.failure._tag}`,
      );
    }
    const nations = result.success;
    const gameTiles: TileData[] = [];
    nations.forEach((territory, nationId) => {
      territory.forEach((c) => {
        gameTiles.push({ q: c.q, r: c.r, nationId });
      });
    });
    BoardGeneration.neutralCoords(nations).forEach((c) => {
      gameTiles.push({ q: c.q, r: c.r, nationId: null });
    });
    return gameTiles;
  }

  switch (strategy) {
    case "lattice":
      return generateLatticeMap(nationCount);
    case "spaced":
      return generateSpacedMap(nationCount);
    case "organic":
      return generateOrganicMap(nationCount);
    case "ragged":
      // The layout is a pure function of (nationCount, raggedSeed): same seed
      // + same nation count always reproduces the exact same map.
      return generateRaggedMap(nationCount, mulberry32(raggedSeed >>> 0));
  }
});

// Tiles actually rendered (allows hiding the neutral sea).
let renderedTiles = $derived.by(() =>
  showNeutral ? tiles : tiles.filter((t) => t.nationId !== null),
);
</script>

<div class="map-generator">

  <!-- HEX GRID CONTAINER -->
  <main
    class="grid-viewport"
    class:dragging={dragging}
    style="--w: {tileWidth}px; --g: {gap}px; --pan-x: {panX}px; --pan-y: {panY}px"
    onpointerdown={(e) => {
      dragging = true;
      dragStart = { x: e.clientX, y: e.clientY, panX, panY };
      e.currentTarget.setPointerCapture(e.pointerId);
    }}
    onpointermove={(e) => {
      if (!dragging) return;
      panX = dragStart.panX + (e.clientX - dragStart.x);
      panY = dragStart.panY + (e.clientY - dragStart.y);
    }}
    onpointerup={() => (dragging = false)}
    onpointercancel={() => (dragging = false)}
    ondblclick={() => {
      // Double-click to re-center the map.
      panX = 0;
      panY = 0;
    }}
  >
    {#each renderedTiles as tile (`${tile.q},${tile.r}`)}
      {@const styleObj = tile.nationId !== null ? NATION_COLORS[tile.nationId] : SEA_COLOR}
      <button
        type="button"
        class="hex-tile"
        class:is-sea={tile.nationId === null}
        style="--q: {tile.q}; --r: {tile.r}; --bg: {styleObj.bg}; --border: {styleObj.border}"
        onmouseenter={() => {
          if (!dragging) hoveredTile = tile;
        }}
        onmouseleave={() => (hoveredTile = null)}
      >
        <span class="coord-label">
          {tile.q},{tile.r}
        </span>
      </button>
    {/each}
  </main>

  <!-- CONTROL BAR -->
  <header class="control-panel">
    <div class="control-group">
      <span class="control-label">Generation Strategy:</span>
      <!-- Strategies 2 (Spaced Nations) and 3 (Organic Voronoi) are kept in
           code — generateSpacedMap / generateOrganicMap and their switch
           cases — but intentionally hidden from the UI. -->
      <div class="segmented" role="group" aria-label="Generation strategy">
        <button
          type="button"
          class="seg-btn"
          class:active={strategy === "lattice"}
          aria-pressed={strategy === "lattice"}
          onclick={() => (strategy = "lattice")}
        >
          1. Interlocking Lattice
        </button>
        <button
          type="button"
          class="seg-btn"
          class:active={strategy === "ragged"}
          aria-pressed={strategy === "ragged"}
          onclick={() => (strategy = "ragged")}
        >
          4. Ragged Frontier
        </button>
      </div>
    </div>

    <div class="control-group">
      <span class="control-label">Source:</span>
      <div class="segmented" role="group" aria-label="Implementation source">
        <button
          type="button"
          class="seg-btn"
          class:active={!useGamePkg}
          aria-pressed={!useGamePkg}
          onclick={() => (useGamePkg = false)}
        >
          Demo
        </button>
        <button
          type="button"
          class="seg-btn"
          class:active={useGamePkg}
          aria-pressed={useGamePkg}
          onclick={() => (useGamePkg = true)}
        >
          Game pkg
        </button>
      </div>
      {#if useGamePkg}
        <span class="hint">from @land-of-bron/game — check parity against the demo</span>
      {/if}
    </div>

    {#if strategy === "ragged"}
      <div class="control-group">
        <label for="seed">Seed:</label>
        <input
          id="seed"
          class="seed-input"
          type="number"
          min="0"
          step="1"
          bind:value={raggedSeed}
          title="Deterministic seed — the same seed with the same nation count always reproduces the same layout"
        />
        <button
          type="button"
          class="seed-default-btn"
          onclick={() => (raggedSeed = DEFAULT_SEED)}
          title="Reset to the default seed ({DEFAULT_SEED})"
        >
          Default
        </button>
        <span class="hint">ragged borders, 7 tiles each, thin neutral seams</span>
      </div>
    {/if}

    <div class="control-group">
      <label class="switch-label" for="showNeutral">
        <input
          id="showNeutral"
          type="checkbox"
          class="switch-input"
          bind:checked={showNeutral}
        />
        <span class="switch-track"><span class="switch-thumb"></span></span>
        <span>Neutral tiles</span>
      </label>
    </div>

    <div class="control-group">
      <label for="nations">Nations: <strong>{nationCount}</strong></label>
      <input
        id="nations"
        type="range"
        min="3"
        max="7"
        bind:value={nationCount}
      />
    </div>

    <div class="control-group">
      <label for="tileSize">Tile Size:</label>
      <input
        id="tileSize"
        type="range"
        min="35"
        max="75"
        bind:value={tileWidth}
      />
    </div>
  </header>

  <!-- STATUS FOOTER -->
  <footer class="status-bar">
    {#if hoveredTile}
      <div>
        <strong>Coordinates:</strong> ({hoveredTile.q}, {hoveredTile.r}, {
          -hoveredTile.q - hoveredTile.r
        })
      </div>
      <div>
        <strong>Owner:</strong>
        {#if hoveredTile.nationId !== null}
          <span style="color: {NATION_COLORS[hoveredTile.nationId].bg}">
            {NATION_COLORS[hoveredTile.nationId].name}
          </span>
        {:else}
          <span style="color: #64748b">Neutral Sea</span>
        {/if}
      </div>
    {:else}
      <div class="placeholder">
        Hover over any hex tile to inspect coordinates
      </div>
    {/if}
  </footer>
</div>

<style>
.map-generator {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 620px;
  background: #020617;
  color: #f8fafc;
  font-family: system-ui, -apple-system, sans-serif;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #1e293b;
}

/* Control Panel Styling */
.control-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  padding: 1rem 1.5rem;
  background: #0f172a;
  border-top: 1px solid #1e293b;
  align-items: center;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.9rem;
}

input[type="range"] {
  background: #1e293b;
  color: #f8fafc;
  border: 1px solid #334155;
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  cursor: pointer;
}

.control-label {
  font-size: 0.9rem;
  color: #e2e8f0;
}

/* Segmented toggle for the generation strategy */
.segmented {
  display: inline-flex;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 3px;
  gap: 3px;
}

.seg-btn {
  background: transparent;
  color: #94a3b8;
  border: none;
  border-radius: 6px;
  padding: 0.35rem 0.8rem;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
  white-space: nowrap;
}

.seg-btn:hover {
  color: #f8fafc;
}

.seg-btn.active {
  background: #334155;
  color: #f8fafc;
}

.seg-btn:focus-visible {
  outline: 2px solid #10b981;
  outline-offset: 2px;
}

.seed-input {
  width: 6.5rem;
}

.seed-default-btn {
  background: #1e293b;
  color: #94a3b8;
  border: 1px solid #334155;
  padding: 0.3rem 0.6rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8rem;
  transition: background 0.15s ease, color 0.15s ease;
}

.seed-default-btn:hover {
  background: #334155;
  color: #f8fafc;
}

.hint {
  font-size: 0.75rem;
  color: #94a3b8;
  font-style: italic;
}

/* Toggle switch for hiding neutral tiles */
.switch-label {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.9rem;
  user-select: none;
}

.switch-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.switch-track {
  width: 34px;
  height: 18px;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 999px;
  position: relative;
  flex-shrink: 0;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.switch-thumb {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 14px;
  height: 14px;
  background: #94a3b8;
  border-radius: 50%;
  transition: transform 0.2s ease, background 0.2s ease;
}

.switch-input:checked + .switch-track {
  background: #10b981;
  border-color: #059669;
}

.switch-input:checked + .switch-track .switch-thumb {
  transform: translateX(16px);
  background: #f8fafc;
}

.switch-input:focus-visible + .switch-track {
  outline: 2px solid #10b981;
  outline-offset: 2px;
}

/* Grid Viewport & Layout */
.grid-viewport {
  position: relative;
  flex: 1;
  min-height: 480px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: radial-gradient(circle at center, #0f172a 0%, #020617 100%);
  cursor: grab;
  touch-action: none; /* pan with touch instead of scrolling */
  user-select: none;
}

.grid-viewport.dragging {
  cursor: grabbing;
}

/* Hexagon Styling using modern CSS corner-shape & fallback clip-path */
.hex-tile {
  position: absolute;
  width: var(--w);
  aspect-ratio: cos(30deg);
  border-radius: 50% / 25%;
  corner-shape: bevel;
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);

  /* Position calculation from q and r (plus drag pan offset) */
  left: calc(
    50% + (var(--q) + var(--r) / 2) * (var(--w) + var(--g)) + var(--pan-x)
  );
  top: calc(
    50% + var(--r) * cos(30deg) * (var(--w) + var(--g)) + var(--pan-y)
  );
  transform: translate(-50%, -50%);

  /* Colors and Transitions */
  background-color: var(--bg);
  border: 1px solid var(--border);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.15s ease, filter 0.15s ease;
  padding: 0;
}

.hex-tile:hover {
  transform: translate(-50%, -50%) scale(1.15);
  z-index: 20;
  filter: brightness(1.25);
}

.hex-tile.is-sea {
  opacity: 0.4;
}

.hex-tile.is-sea:hover {
  opacity: 0.8;
}

.coord-label {
  font-family: monospace;
  font-size: clamp(0.6rem, 1.5vw, 0.75rem);
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  pointer-events: none;
}

/* Footer Status Bar */
.status-bar {
  display: flex;
  justify-content: space-between;
  padding: 0.75rem 1.5rem;
  background: #0f172a;
  border-top: 1px solid #1e293b;
  font-size: 0.85rem;
  font-family: monospace;
}

.placeholder {
  color: #64748b;
}
</style>
