<script>
	import HexGridDemo from "$lib/ui/HexGridDemo.svelte";
</script>

<main class="page">
	<header class="hero">
		<h1>Hex Map Layouts</h1>
		<p>
			A visual explorer for different ways to arrange a set of hex-grid
			nations. Every layout gives each nation exactly 7 tiles — a capital
			plus six surrounding hexes — but the shape of the map, its borders,
			and the neutral space between nations differ per strategy.
		</p>
	</header>

	<section class="strategies" aria-label="Layout strategies">
		<article class="strategy-card">
			<h2>1. Interlocking Lattice <span class="tag">zero gap</span></h2>
			<p>
				The classic map: each nation is an identical 7-tile hex cluster,
				arranged on a zero-gap lattice so nations tile the board perfectly
				with no neutral space between them. Fully deterministic — the same
				nation count always produces the same map.
			</p>
		</article>

		<article class="strategy-card">
			<h2>4. Ragged Frontier <span class="tag">irregular + neutral seams</span></h2>
			<p>
				Nations still get exactly 7 tiles each, but borders grow irregularly:
				no two nations share the same shape, and their coasts interlock with
				ragged inlets and peninsulas. Neutral sea extends only one tile
				beyond nation borders, filling the thin gaps where nations meet.
				The layout is seeded — the seed field reproduces any exact map.
			</p>
		</article>
	</section>

	<HexGridDemo />

	<p class="footnote">
		Two additional layouts (Spaced Nations and Organic Voronoi expansion)
		still exist in the codebase but are intentionally hidden from this demo.
	</p>
</main>

<style>
	.page {
		min-height: 100vh;
		background: #020617;
		color: #f8fafc;
		font-family: system-ui, -apple-system, sans-serif;
		padding: 2.5rem 1.5rem 3rem;
		max-width: 1100px;
		margin: 0 auto;
	}

	.hero h1 {
		font-size: 2rem;
		margin: 0 0 0.5rem;
		letter-spacing: -0.02em;
	}

	.hero p {
		color: #94a3b8;
		max-width: 70ch;
		line-height: 1.6;
		margin: 0;
	}

	.strategies {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 1rem;
		margin: 1.5rem 0;
	}

	.strategy-card {
		background: #0f172a;
		border: 1px solid #1e293b;
		border-radius: 12px;
		padding: 1.25rem 1.5rem;
	}

	.strategy-card h2 {
		font-size: 1.05rem;
		margin: 0 0 0.6rem;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}

	.tag {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #a7f3d0;
		background: rgba(16, 185, 129, 0.15);
		border: 1px solid rgba(16, 185, 129, 0.35);
		border-radius: 999px;
		padding: 0.15rem 0.6rem;
	}

	.strategy-card p {
		color: #cbd5e1;
		font-size: 0.92rem;
		line-height: 1.6;
		margin: 0;
	}

	.footnote {
		color: #475569;
		font-size: 0.8rem;
		margin-top: 1.25rem;
	}
</style>
