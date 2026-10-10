<script lang="ts">
import { resolve } from "$app/paths";
</script>

<main class="page">
  <header class="hero">
    <h1 class="page-title">Hex Map Layouts</h1>
    <p>Two renderings of the same board-generation ideas — pick a demo.</p>
  </header>

  <nav class="demo-links" aria-label="Demos">
    <a class="demo-card" href={resolve("/tile-layout")}>
      <h2>2D Tile Layout</h2>
      <p>
        The original flat, top-down explorer with the full set of controls and
        layout strategies.
      </p>
      <span class="cta">Open 2D demo →</span>
    </a>

    <a class="demo-card" href={resolve("/tile-layout-3d")}>
      <h2>3D Tile Layout</h2>
      <p>
        The same board rendered as extruded hex prisms with Threlte — ragged
        frontier only, neutral tiles on.
      </p>
      <span class="cta">Open 3D demo →</span>
    </a>
  </nav>
</main>

<style>
.page {
  min-height: 100vh;
  background: #020617;
  color: #f8fafc;
  font-family: system-ui, -apple-system, sans-serif;
  padding: 3rem 1.5rem;
  max-width: 1100px;
  margin: 0 auto;
}

.page-title {
  font-size: 2rem;
  margin: 0 0 0.5rem;
  letter-spacing: -0.02em;
}

.hero {
  margin-bottom: 2rem;
}

.hero p {
  color: #94a3b8;
  max-width: 70ch;
  line-height: 1.6;
  margin: 0;
}

.demo-links {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.25rem;
}

.demo-card {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 1.5rem;
  text-decoration: none;
  color: inherit;
  transition:
    border-color 0.15s ease,
    transform 0.15s ease,
    background 0.15s ease;
}

.demo-card:hover {
  border-color: #10b981;
  background: #131f36;
  transform: translateY(-2px);
}

.demo-card h2 {
  font-size: 1.2rem;
  margin: 0;
}

.demo-card p {
  color: #cbd5e1;
  font-size: 0.92rem;
  line-height: 1.6;
  margin: 0;
}

.cta {
  margin-top: auto;
  padding-top: 0.5rem;
  color: #a7f3d0;
  font-size: 0.9rem;
  font-weight: 600;
}
</style>
