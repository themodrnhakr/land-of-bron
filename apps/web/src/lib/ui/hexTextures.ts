/**
 * Experimental tile-surface recipes for the 3D demo.
 *
 * Four interchangeable "looks" are generated/loaded here so the demo can be a
 * playground for comparing texturing approaches:
 *
 * - `procedural` — runtime-generated noise albedo + bump, no asset files.
 * - `photo`      — committed CC0 photo textures (Poly Haven + three.js water
 *                  normal), tinted per nation.
 * - `stylized`   — crisp, graphic board-game pattern with a subtle relief.
 * - `material`   — no texture maps at all; a `MeshPhysicalMaterial` with
 *                  clearcoat plus a procedural gradient environment.
 * - `linen`      — woven-linen relief tinted by color, with the hand-drawn
 *                  terrain PNGs screen-printed on top (see `static/art`).
 *
 * Everything here touches the DOM/`Image`, so only call these factories on the
 * client (the Threlte canvas subtree never renders during SSR).
 */

import {
  CanvasTexture,
  EquirectangularReflectionMapping,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from "three";

export type TextureMode = "procedural" | "photo" | "stylized" | "material" | "linen";

export const TEXTURE_MODES: { id: TextureMode; label: string; blurb: string }[] = [
  { id: "linen", label: "E · Linen print", blurb: "Woven linen + printed terrain art" },
  { id: "procedural", label: "A · Procedural", blurb: "Generated noise + bump, zero assets" },
  { id: "photo", label: "B · Photo", blurb: "Committed CC0 photo textures, tinted" },
  { id: "stylized", label: "C · Stylized", blurb: "Graphic board-game pattern" },
  { id: "material", label: "D · Material", blurb: "No maps — clearcoat + environment" },
];

/** How one surface (land or sea) should be shaded. */
export interface SurfaceRecipe {
  map: Texture | null;
  normalMap: Texture | null;
  bumpMap: Texture | null;
  roughnessMap: Texture | null;
  roughness: number;
  metalness: number;
  bumpScale: number;
  clearcoat: number;
  clearcoatRoughness: number;
  envMapIntensity: number;
  /** 0 = use the base color as-is, 1 = fully whitened (lets a photo show). */
  tint: number;
  /** Overrides the base color for this surface (used by the sea). */
  baseColor: string | null;
  /** Texture scrolled over time to fake moving water, if any. */
  animated: Texture | null;
}

export interface TextureBundle {
  land: SurfaceRecipe;
  sea: SurfaceRecipe;
  /** Reflection environment for `material` mode (equirect gradient). */
  environment: Texture | null;
}

const recipe = (partial: Partial<SurfaceRecipe>): SurfaceRecipe => ({
  map: null,
  normalMap: null,
  bumpMap: null,
  roughnessMap: null,
  roughness: 0.7,
  metalness: 0.05,
  bumpScale: 0.05,
  clearcoat: 0,
  clearcoatRoughness: 0,
  envMapIntensity: 0.6,
  tint: 0,
  baseColor: null,
  animated: null,
  ...partial,
});

// ---------------------------------------------------------------------------
// Procedural noise
// ---------------------------------------------------------------------------

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Seamlessly tiling value noise, periodic over `cells`. */
function valueNoise(x: number, y: number, cells: number, seed: number): number {
  const fx = x * cells;
  const fy = y * cells;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = smooth(fx - x0);
  const ty = smooth(fy - y0);
  const wrap = (v: number) => ((v % cells) + cells) % cells;
  const a = hash2(wrap(x0), wrap(y0), seed);
  const b = hash2(wrap(x0 + 1), wrap(y0), seed);
  const c = hash2(wrap(x0), wrap(y0 + 1), seed);
  const d = hash2(wrap(x0 + 1), wrap(y0 + 1), seed);
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

/** Fractal sum of value noise, normalised to 0..1. */
function heightField(size: number, seed: number, octaves: number, baseCells: number): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  let cells = baseCells;
  for (let o = 0; o < octaves; o++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = y * size + x;
        out[idx] = (out[idx] ?? 0) + valueNoise(x / size, y / size, cells, seed + o * 101) * amp;
      }
    }
    total += amp;
    amp *= 0.5;
    cells *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] ?? 0) / total;
  return out;
}

function fieldToCanvas(field: Float32Array, size: number, base: number, contrast: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < field.length; i++) {
    const v = Math.max(0, Math.min(1, base + ((field[i] ?? 0) - 0.5) * contrast));
    const g = Math.round(v * 255);
    img.data[i * 4] = g;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = g;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function toTexture(canvas: HTMLCanvasElement, repeat: number, srgb: boolean): CanvasTexture {
  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// A — procedural
// ---------------------------------------------------------------------------

export function createProceduralBundle(): TextureBundle {
  const landCanvas = fieldToCanvas(heightField(256, 7, 5, 6), 256, 0.86, 0.5);
  const seaCanvas = fieldToCanvas(heightField(256, 42, 4, 4), 256, 0.62, 1.1);

  const landMap = toTexture(landCanvas, 3, true);
  const landBump = toTexture(landCanvas, 3, false);
  const seaMap = toTexture(seaCanvas, 4, true);
  const seaBump = toTexture(seaCanvas, 4, false);

  return {
    land: recipe({
      map: landMap,
      bumpMap: landBump,
      bumpScale: 0.08,
      roughness: 0.82,
      metalness: 0.04,
    }),
    sea: recipe({
      map: seaMap,
      bumpMap: seaBump,
      bumpScale: 0.16,
      roughness: 0.22,
      metalness: 0.3,
      envMapIntensity: 1,
      animated: seaBump,
    }),
    environment: null,
  };
}

// ---------------------------------------------------------------------------
// B — photo (committed CC0 assets in /static/textures)
// ---------------------------------------------------------------------------

export function createPhotoBundle(): TextureBundle {
  const loader = new TextureLoader();
  const load = (file: string, srgb: boolean, repeat: number): Texture => {
    const tex = loader.load(`/textures/${file}`);
    tex.wrapS = tex.wrapT = RepeatWrapping;
    tex.repeat.set(repeat, repeat);
    tex.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
    tex.anisotropy = 8;
    return tex;
  };

  const landMap = load("ground_diffuse.jpg", true, 2);
  const landNormal = load("ground_normal.jpg", false, 2);
  const landRough = load("ground_roughness.jpg", false, 2);
  const waterNormal = load("water_normal.jpg", false, 3);

  // Real photo albedo, so only a gentle whitening keeps nation identity.
  return {
    land: recipe({
      map: landMap,
      normalMap: landNormal,
      roughnessMap: landRough,
      roughness: 1,
      metalness: 0,
      tint: 0.35,
      envMapIntensity: 0.5,
    }),
    sea: recipe({
      normalMap: waterNormal,
      roughness: 0.12,
      metalness: 0.4,
      bumpScale: 0.5,
      baseColor: "#2f4a68",
      envMapIntensity: 1.2,
      animated: waterNormal,
    }),
    environment: null,
  };
}

// ---------------------------------------------------------------------------
// C — stylized board-game pattern
// ---------------------------------------------------------------------------

function stylizedCanvas(size: number, sea: boolean): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const base = sea ? "#5c708c" : "#b9c1cd";
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // Radial vignette so the (round) cap reads as a domed token.
  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.12, size / 2, size / 2, size * 0.72);
  grad.addColorStop(0, "rgba(255,255,255,0.18)");
  grad.addColorStop(1, "rgba(0,0,0,0.34)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  if (sea) {
    // Diagonal wave stripes.
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = size * 0.02;
    for (let i = -size; i < size * 2; i += size * 0.16) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + size, size);
      ctx.stroke();
    }
    return canvas;
  }

  // Diagonal hatching.
  ctx.strokeStyle = "rgba(15,23,42,0.16)";
  ctx.lineWidth = size * 0.02;
  for (let i = -size; i < size * 2; i += size * 0.13) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
    ctx.stroke();
  }

  // Dot grid.
  ctx.fillStyle = "rgba(15,23,42,0.34)";
  const step = size / 4;
  for (let y = step / 2; y < size; y += step) {
    for (let x = step / 2; x < size; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, size * 0.025, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Thin boundary lines split the tile into quadrants.
  ctx.strokeStyle = "rgba(15,23,42,0.22)";
  ctx.lineWidth = size * 0.012;
  for (const p of [0, size / 2, size]) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  return canvas;
}

export function createStylizedBundle(): TextureBundle {
  const landCanvas = stylizedCanvas(128, false);
  const seaCanvas = stylizedCanvas(128, true);

  const landMap = toTexture(landCanvas, 2, true);
  const landBump = toTexture(landCanvas, 2, false);

  return {
    land: recipe({
      map: landMap,
      bumpMap: landBump,
      bumpScale: 0.04,
      roughness: 0.55,
      metalness: 0.08,
    }),
    sea: recipe({
      map: toTexture(seaCanvas, 2, true),
      roughness: 0.35,
      metalness: 0.2,
      envMapIntensity: 0.9,
    }),
    environment: null,
  };
}

// ---------------------------------------------------------------------------
// D — material only (no maps)
// ---------------------------------------------------------------------------

/** A cheap equirect sky/ground gradient used as a reflection environment. */
function createGradientEnvironment(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 32;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, 32);
  grad.addColorStop(0, "#dfe9f5");
  grad.addColorStop(0.45, "#9fb4cf");
  grad.addColorStop(0.5, "#4c5f7c");
  grad.addColorStop(1, "#0a101c");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 32);

  const tex = new CanvasTexture(canvas);
  tex.mapping = EquirectangularReflectionMapping;
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createMaterialBundle(): TextureBundle {
  return {
    land: recipe({
      roughness: 0.3,
      metalness: 0.12,
      clearcoat: 0.85,
      clearcoatRoughness: 0.22,
      envMapIntensity: 1.3,
    }),
    sea: recipe({
      roughness: 0.08,
      metalness: 0.35,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.6,
    }),
    environment: createGradientEnvironment(),
  };
}

// ---------------------------------------------------------------------------
// E — linen + printed terrain art
// ---------------------------------------------------------------------------

/** Hand-drawn terrain illustrations, committed in `static/art`. */
export const ART_URLS = Array.from({ length: 8 }, (_, i) => `/art/terrain-${i + 1}.png`);

/**
 * Load the terrain PNGs as white-backed "print" textures.
 *
 * The source art is black ink on a transparent background. A `map` ignores
 * alpha (unless the material is transparent), so the transparent pixels would
 * read as black and flood the tile. Flattening each image onto white first
 * means the material `color` tints the fabric while the ink stays black — a
 * screen-printed look.
 */
export async function loadArtTextures(): Promise<CanvasTexture[]> {
  const size = 1024;
  const images = await Promise.all(
    ART_URLS.map(async (url) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.src = url;
      await image.decode();
      return image;
    }),
  );
  return images.map((image) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    // Woven-cloth background, then the ink printed on top.
    ctx.drawImage(linenAlbedoCanvas(), 0, 0, size, size);
    // Slightly translucent ink so it reads as dye printed into the cloth.
    ctx.globalAlpha = 0.88;
    ctx.drawImage(image, 0, 0, size, size);
    ctx.globalAlpha = 1;
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  });
}

/** Deterministically pick a terrain print for a tile. */
export function artIndexFor(q: number, r: number, count: number): number {
  const h = (Math.imul(q, 73856093) ^ Math.imul(r, 19349663)) >>> 0;
  return count > 0 ? h % count : 0;
}

/** A plain weave. `albedo` gives near-white cloth, otherwise a bump map. */
function linenWeaveCanvas(size: number, cells: number, albedo: boolean): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = albedo ? "#f3f2ef" : "#808080";
  ctx.fillRect(0, 0, size, size);
  const cell = size / cells;
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const over = (cx + cy) % 2 === 0;
      const x0 = cx * cell;
      const y0 = cy * cell;
      // Each thread is a ridge: the one "on top" shades across its width.
      const g = over
        ? ctx.createLinearGradient(x0, y0, x0, y0 + cell)
        : ctx.createLinearGradient(x0, y0, x0 + cell, y0);
      if (albedo) {
        g.addColorStop(0, "rgba(0,0,0,0.10)");
        g.addColorStop(0.5, "rgba(255,255,255,0.20)");
        g.addColorStop(1, "rgba(0,0,0,0.10)");
      } else {
        g.addColorStop(0, "rgba(0,0,0,0.65)");
        g.addColorStop(0.5, "rgba(255,255,255,0.65)");
        g.addColorStop(1, "rgba(0,0,0,0.65)");
      }
      ctx.fillStyle = g;
      ctx.fillRect(x0, y0, cell, cell);
    }
  }
  return canvas;
}

let linenAlbedoCached: HTMLCanvasElement | null = null;
function linenAlbedoCanvas(): HTMLCanvasElement {
  return (linenAlbedoCached ??= linenWeaveCanvas(256, 32, true));
}

/**
 * Linen recipe shared by land and sea. The land albedo is the per-tile terrain
 * print supplied by the scene; the sea keeps the plain cloth.
 */
export function createLinenBundle(): TextureBundle {
  const bump = toTexture(linenWeaveCanvas(256, 16, false), 2, false);
  const rough = toTexture(linenWeaveCanvas(256, 16, false), 2, false);
  const cloth = toTexture(linenAlbedoCanvas(), 1, true);
  const linen: Partial<SurfaceRecipe> = {
    bumpMap: bump,
    bumpScale: 0.05,
    roughnessMap: rough,
    roughness: 0.98,
    metalness: 0,
    envMapIntensity: 0.35,
  };
  return {
    land: recipe(linen),
    sea: recipe({ ...linen, map: cloth }),
    environment: null,
  };
}
