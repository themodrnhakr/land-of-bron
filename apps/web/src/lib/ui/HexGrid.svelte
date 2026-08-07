<div class="hex-grid">
  <!-- Center / Origin (0, 0, 0) -->
  <div class="hex" style="--q: 0; --r: 0">0, 0, 0</div>

  <!-- First Ring -->
  <div class="hex" style="--q: 1; --r: 0">1, 0, -1</div>
  <div class="hex" style="--q: 0; --r: 1">0, 1, -1</div>
  <div class="hex" style="--q: -1; --r: 1">-1, 1, 0</div>
  <div class="hex" style="--q: -1; --r: 0">-1, 0, 1</div>
  <div class="hex" style="--q: 0; --r: -1">0, -1, 1</div>
  <div class="hex" style="--q: 1; --r: -1">1, -1, 0</div>

  <!-- Second Ring Sample -->
  <div class="hex" style="--q: 2; --r: -1">2, -1, -1</div>
  <div class="hex" style="--q: 0; --r: 2">0, 2, -2</div>
</div>

<style>
.hex-grid {
  --w: 100px; /* Hexagon width */
  --g: 8px; /* Uniform gap between hexagons */

  position: relative;
  width: 100%;
  min-height: 600px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.hex {
  /* Derive third cube coordinate automatically */
  --s: calc(-1 * (var(--q) + var(--r)));

  /* Base geometry */
  position: absolute;
  width: var(--w);
  aspect-ratio: cos(30deg);
  border-radius: 50% / 25%;
  corner-shape: bevel;

  /* Styling */
  background: #1e293b;
  border: 2px solid #38bdf8;
  color: #f8fafc;
  display: grid;
  place-content: center;
  font-family: monospace;
  font-size: 0.85rem;

  /* Coordinate translation relative to container center */
  left: calc(50% + (var(--q) + var(--r) / 2) * (var(--w) + var(--g)));
  top: calc(50% + var(--r) * cos(30deg) * (var(--w) + var(--g)));
  transform: translate(-50%, -50%);
}
</style>
