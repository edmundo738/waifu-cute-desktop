/**
 * v0.6 skinned-mesh renderer (canvas 2D, no dependencies).
 *
 * Skeleton: bones with parent + pivot. Local transform of bone b at fraction f:
 *   L_b(f) = Rot(pivot_b, f·rot_b) ∘ T(f·dx_b, f·dy_b)
 * Influence (b, f) = World(parent(b)) ∘ L_b(f)  — "rotational blending": a vertex
 * halfway through the elbow band is rotated by half the elbow angle about the
 * elbow, so joints keep their volume (no linear-blend collapse / candy-wrapper).
 * A vertex stores two influences mixed linearly by c (only used between
 * skeleton BRANCHES, e.g. neck chain vs clavicle at the shoulder line).
 *
 * Rendering cost model: grid cells whose 4 vertices share one pure bone are
 * drawn as rigid runs (one clip path of rects + ONE transformed drawImage per
 * bone); cells with no texture alpha are skipped; only blended cells go through
 * per-triangle affine texture mapping.
 */
import type { Ctx2D } from "../puppetRender";

export type Mat = [number, number, number, number, number, number]; // a b c d e f
export const ID_MAT: Mat = [1, 0, 0, 1, 0, 0];

export function rotMat(px: number, py: number, deg: number, dx = 0, dy = 0): Mat {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  // rotate about (px,py) then translate
  return [c, s, -s, c, px - c * px + s * py + dx, py - s * px - c * py + dy];
}

export function mulMat(a: Mat, b: Mat): Mat {
  return [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

export function applyMat(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export function invMat(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2];
  const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

// ---------------------------------------------------------------- skeleton

export interface BoneDef { name: string; parent: number; pivot: [number, number] }
export interface BonePose { rot: number; dx?: number; dy?: number }
export interface Skeleton { defs: BoneDef[]; poses: BonePose[]; world: Mat[] }

export function localMat(b: BoneDef, p: BonePose, f = 1): Mat {
  const m = rotMat(b.pivot[0], b.pivot[1], f * p.rot);
  const dx = (p.dx ?? 0) * f, dy = (p.dy ?? 0) * f;
  return dx || dy ? mulMat(m, [1, 0, 0, 1, dx, dy]) : m;
}

/** World matrices; parents must precede children in `defs`. Root (parent −1) must stay unposed. */
export function solveSkeleton(defs: BoneDef[], poses: BonePose[]): Skeleton {
  const world: Mat[] = [];
  for (let i = 0; i < defs.length; i++) {
    const par = defs[i].parent < 0 ? ID_MAT : world[defs[i].parent];
    world.push(mulMat(par, localMat(defs[i], poses[i] ?? { rot: 0 }, 1)));
  }
  return { defs, poses, world };
}

/** Pose-space position of rest point (x,y) under influence (b, f). Allocation-free. */
function skinInfluence(sk: Skeleton, b: number, f: number, x: number, y: number, out: [number, number]): void {
  if (f >= 1) {
    const m = sk.world[b];
    out[0] = m[0] * x + m[2] * y + m[4];
    out[1] = m[1] * x + m[3] * y + m[5];
    return;
  }
  const def = sk.defs[b];
  const par = def.parent < 0 ? ID_MAT : sk.world[def.parent];
  let X = x, Y = y;
  if (f > 0) {
    const p = sk.poses[b] ?? { rot: 0 };
    X += (p.dx ?? 0) * f;
    Y += (p.dy ?? 0) * f;
    const r = (p.rot * f * Math.PI) / 180;
    if (r !== 0) {
      const c = Math.cos(r), s = Math.sin(r);
      const qx = X - def.pivot[0], qy = Y - def.pivot[1];
      X = def.pivot[0] + c * qx - s * qy;
      Y = def.pivot[1] + s * qx + c * qy;
    }
  }
  out[0] = par[0] * X + par[2] * Y + par[4];
  out[1] = par[1] * X + par[3] * Y + par[5];
}

// ---------------------------------------------------------------- weights

export interface VW { b0: number; f0: number; b1: number; f1: number; c: number }
export type WeightFn = (x: number, y: number) => VW; // pose-space coordinates

const T0: [number, number] = [0, 0];
const T1: [number, number] = [0, 0];
/** Skin an arbitrary pose-space rest point with explicit weights. */
export function skinVW(sk: Skeleton, w: VW, x: number, y: number): [number, number] {
  skinInfluence(sk, w.b0, w.f0, x, y, T0);
  if (w.c <= 0) return [T0[0], T0[1]];
  skinInfluence(sk, w.b1, w.f1, x, y, T1);
  return [T0[0] * (1 - w.c) + T1[0] * w.c, T0[1] * (1 - w.c) + T1[1] * w.c];
}

// ---------------------------------------------------------------- mesh

export interface AlphaMap { data: Uint8Array | Uint8ClampedArray; w: number; h: number } // RGBA

export interface SkinMesh {
  w: number; h: number; step: number; cols: number; rows: number;
  origin: [number, number];           // layer box origin in pose space
  rest: Float32Array;                 // layer-local rest positions (= uv)
  b0: Uint8Array; f0: Float32Array; b1: Uint8Array; f1: Float32Array; c: Float32Array;
  runs: { bone: number; rects: number[] }[]; // rigid rects per bone (x,y,w,h local)
  blend: Uint32Array;                 // blended triangles (vertex indices)
  blendVerts: Uint32Array;            // unique vertices of blended triangles
  stats: { cells: number; rigid: number; blended: number; skipped: number };
  scr?: Float32Array;                 // per-frame screen positions cache
  edgeMask?: Uint8Array;              // per blended tri: bit e = edge e may be offset (uniform texture)
  solidTris?: Uint32Array;            // blend offsets of tris with a band-crossing edge (pass 2)
  solid?: unknown;                    // solid companion texture (attachSolid)
  surface?: { canvas: { width: number; height: number }; ctx: Ctx2D }; // isolated layer (attachSurface)
}

export function buildSkinMesh(
  w: number, h: number, step: number, origin: [number, number],
  wfn: WeightFn, defs: BoneDef[], alpha?: AlphaMap | null,
): SkinMesh {
  const cols = Math.ceil(w / step) + 1;
  const rows = Math.ceil(h / step) + 1;
  const n = cols * rows;
  const rest = new Float32Array(n * 2);
  const b0 = new Uint8Array(n), b1 = new Uint8Array(n);
  const f0 = new Float32Array(n), f1 = new Float32Array(n), cc = new Float32Array(n);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const x = Math.min(w, c * step), y = Math.min(h, r * step);
      rest[i * 2] = x;
      rest[i * 2 + 1] = y;
      const v = wfn(x + origin[0], y + origin[1]);
      b0[i] = v.b0; f0[i] = v.f0; b1[i] = v.b1; f1[i] = v.f1; cc[i] = v.c;
    }
  }
  const canon = (b: number, f: number): number => {
    if (f >= 1 - 1e-6) return b;
    if (f <= 1e-6) return defs[b].parent < 0 ? 0 : defs[b].parent;
    return -1;
  };
  const pure = (i: number): number => {
    const A = canon(b0[i], f0[i]);
    if (cc[i] <= 1e-6) return A;
    const B = canon(b1[i], f1[i]);
    if (cc[i] >= 1 - 1e-6) return B;
    return A >= 0 && A === B ? A : -1;
  };
  const hasAlpha = (x0: number, y0: number, x1: number, y1: number): boolean => {
    if (!alpha) return true;
    const xa = Math.max(0, Math.floor(x0) - 1), xb = Math.min(alpha.w, Math.ceil(x1) + 1);
    const ya = Math.max(0, Math.floor(y0) - 1), yb = Math.min(alpha.h, Math.ceil(y1) + 1);
    for (let y = ya; y < yb; y++) {
      const row = y * alpha.w;
      for (let x = xa; x < xb; x++) if (alpha.data[(row + x) * 4 + 3] > 0) return true;
    }
    return false;
  };
  const runsByBone = new Map<number, number[]>();
  const tris: number[] = [];
  const stats = { cells: 0, rigid: 0, blended: 0, skipped: 0 };
  for (let r = 0; r < rows - 1; r++) {
    let runBone = -2, runStart = 0;
    const flush = (cEnd: number) => {
      if (runBone < 0) return;
      const x0 = runStart * step, y0 = r * step;
      const x1 = Math.min(w, cEnd * step), y1 = Math.min(h, (r + 1) * step);
      if (!runsByBone.has(runBone)) runsByBone.set(runBone, []);
      runsByBone.get(runBone)!.push(x0, y0, x1 - x0, y1 - y0);
    };
    for (let c = 0; c < cols - 1; c++) {
      stats.cells++;
      const i0 = r * cols + c, i1 = i0 + 1, i2 = i0 + cols, i3 = i2 + 1;
      const x0 = rest[i0 * 2], y0 = rest[i0 * 2 + 1], x1 = rest[i3 * 2], y1 = rest[i3 * 2 + 1];
      let kind = -2; // blended
      if (!hasAlpha(x0, y0, x1, y1)) kind = -1;
      else {
        const p = pure(i0);
        if (p >= 0 && p === pure(i1) && p === pure(i2) && p === pure(i3)) kind = p;
      }
      if (kind >= 0) {
        stats.rigid++;
        if (kind !== runBone) { flush(c); runBone = kind; runStart = c; }
        continue;
      }
      flush(c);
      runBone = -2;
      if (kind === -1) { stats.skipped++; continue; }
      stats.blended++;
      tris.push(i0, i1, i3, i0, i3, i2);
    }
    flush(cols - 1);
  }
  // stitch rects: Skia's AA rasteriser does not cancel the coincident opposite
  // edges of abutting rects exactly at some rotations (measured: 16 partial-alpha
  // px at 60°, 0 at 0°/33°) → hairline seams between cell rows of a rigid run once
  // the bone rotates. A 1-texel rect over each shared row boundary (common x-range
  // only, so the union's outline is unchanged) forces winding ≥ 1 there.
  for (const rects of runsByBone.values()) {
    const n0 = rects.length;
    for (let i = 0; i < n0; i += 4) {
      for (let j = 0; j < n0; j += 4) {
        if (Math.abs(rects[i + 1] + rects[i + 3] - rects[j + 1]) > 1e-6) continue;   // j directly below i
        const xa = Math.max(rects[i], rects[j]), xb = Math.min(rects[i] + rects[i + 2], rects[j] + rects[j + 2]);
        if (xb - xa > 1e-6) rects.push(xa, rects[j + 1] - 0.5, xb - xa, 1);
      }
    }
  }
  const runs = [...runsByBone.entries()].map(([bone, rects]) => ({ bone, rects }));
  const uniq = new Set(tris);
  // edge classes (texture space, 1 px sampling):
  //   0 uniform — every sample's 3×3 neighbourhood opaque (≥250) or every one clear
  //     (0): offsetting it in pass 1 only overlaps opaque/clear texels → harmless;
  //   1 exact+fill — touches the anti-aliased band and the edge LINE itself crosses
  //     opaque texels: kept exact in pass 1, its conflation seam filled in pass 2;
  //   2 exact — band/clear only along the line: a seam there is inside the band
  //     (sub-texel alpha loss) and the solid texture is empty there anyway.
  const edgeClass = (ax: number, ay: number, bx: number, by: number): number => {
    if (!alpha) return 0;
    let op = false, cl = false, band = false, lineOpaque = 0;
    const ns = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay)));
    const at = (X: number, Y: number) => (X < 0 || Y < 0 || X >= alpha.w || Y >= alpha.h ? 0 : alpha.data[(Y * alpha.w + X) * 4 + 3]);
    for (let s = 0; s <= ns; s++) {
      const x = Math.round(ax + ((bx - ax) * s) / ns), y = Math.round(ay + ((by - ay) * s) / ns);
      if (at(x, y) >= 250) lineOpaque++;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const av = at(x + dx, y + dy);
          if (av >= 250) op = true; else if (av === 0) cl = true; else band = true;
        }
      }
    }
    if (!band && !(op && cl)) return 0;
    return lineOpaque >= 1 ? 1 : 2;
  };
  const edgeMask = new Uint8Array(tris.length / 3);
  const solidTris: number[] = [];
  for (let t = 0, q = 0; t < tris.length; t += 3, q++) {
    let e = 0, fill = false;
    for (let k = 0; k < 3; k++) {
      const p = tris[t + k], r = tris[t + ((k + 1) % 3)];
      const cls = edgeClass(rest[p * 2], rest[p * 2 + 1], rest[r * 2], rest[r * 2 + 1]);
      if (cls === 0) e |= 1 << k; else if (cls === 1) fill = true;
    }
    edgeMask[q] = e;
    if (fill) solidTris.push(t);
  }
  return {
    w, h, step, cols, rows, origin, rest, b0, f0, b1, f1, c: cc, runs,
    blend: Uint32Array.from(tris), blendVerts: Uint32Array.from(uniq), stats,
    edgeMask, solidTris: Uint32Array.from(solidTris),
  };
}

/** Pose-space skinned position of mesh vertex i. */
export function skinMeshVertex(mesh: SkinMesh, i: number, sk: Skeleton): [number, number] {
  return skinVW(sk, { b0: mesh.b0[i], f0: mesh.f0[i], b1: mesh.b1[i], f1: mesh.f1[i], c: mesh.c[i] },
    mesh.rest[i * 2] + mesh.origin[0], mesh.rest[i * 2 + 1] + mesh.origin[1]);
}

/**
 * Draw a skinned layer. `view` maps pose px → pre-wrapper screen px; the caller's
 * current ctx transform (e.g. breathe) wraps everything uniformly.
 */
/** blended-triangle clip offset (device px) and miter cap */
export const SEAM_DELTA = 0.75;
const SEAM_MITER = 3 * SEAM_DELTA;

export function drawSkinMesh(
  ctx: Ctx2D, tex: { img: unknown }, mesh: SkinMesh, sk: Skeleton,
  view: { scale: number; ox: number; oy: number },
): void {
  const { scale: k, ox, oy } = view;
  const [gx, gy] = mesh.origin;
  // skin each blended vertex once (pre-wrapper screen px)
  const n = mesh.rest.length / 2;
  if (!mesh.scr || mesh.scr.length !== n * 2) mesh.scr = new Float32Array(n * 2);
  const scr = mesh.scr;
  for (let j = 0; j < mesh.blendVerts.length; j++) {
    const i = mesh.blendVerts[j];
    const x = mesh.rest[i * 2] + gx, y = mesh.rest[i * 2 + 1] + gy;
    skinInfluence(sk, mesh.b0[i], mesh.f0[i], x, y, T0);
    let X = T0[0], Y = T0[1];
    const c = mesh.c[i];
    if (c > 0) {
      skinInfluence(sk, mesh.b1[i], mesh.f1[i], x, y, T1);
      X = X * (1 - c) + T1[0] * c;
      Y = Y * (1 - c) + T1[1] * c;
    }
    scr[i * 2] = ox + k * X;
    scr[i * 2 + 1] = oy + k * Y;
  }
  const R = mesh.rest;
  const surf = mesh.surface;
  if (surf && mesh.blend.length > 0 && ctx.getTransform && ctx.setTransform && surf.ctx.setTransform) {
    // ISOLATED, CONFLATION-FREE PATH: rigid runs + blended triangles (exact clips,
    // no offsets) accumulate ADDITIVELY ('lighter') on the layer's own surface, so
    // complementary anti-aliased coverages along shared edges sum to the texel's
    // full value (measured ±7 α vs −67 with source-over) — no seams, no double
    // alpha. The finished layer is composited once with source-over.
    const T = ctx.getTransform();
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    const sc = surf.canvas;
    if (sc.width !== cw || sc.height !== ch) { sc.width = cw; sc.height = ch; }
    // device-space bbox of this frame's layer content
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const addPt = (px: number, py: number) => {
      const X = T.a * px + T.c * py + T.e, Y = T.b * px + T.d * py + T.f;
      if (X < x0) x0 = X;
      if (X > x1) x1 = X;
      if (Y < y0) y0 = Y;
      if (Y > y1) y1 = Y;
    };
    for (const run of mesh.runs) {
      const m = sk.world[run.bone];
      let rx0 = Infinity, ry0 = Infinity, rx1 = -Infinity, ry1 = -Infinity;
      const r = run.rects;
      for (let i = 0; i < r.length; i += 4) {
        rx0 = Math.min(rx0, r[i]); ry0 = Math.min(ry0, r[i + 1]);
        rx1 = Math.max(rx1, r[i] + r[i + 2]); ry1 = Math.max(ry1, r[i + 1] + r[i + 3]);
      }
      for (const [u, v] of [[rx0, ry0], [rx1, ry0], [rx0, ry1], [rx1, ry1]]) {
        const px = u + gx, py = v + gy;
        addPt(ox + k * (m[0] * px + m[2] * py + m[4]), oy + k * (m[1] * px + m[3] * py + m[5]));
      }
    }
    for (let j = 0; j < mesh.blendVerts.length; j++) { const i = mesh.blendVerts[j]; addPt(scr[i * 2], scr[i * 2 + 1]); }
    const bx = Math.max(0, Math.floor(x0) - 3), by = Math.max(0, Math.floor(y0) - 3);
    const bw = Math.min(cw, Math.ceil(x1) + 3) - bx, bh = Math.min(ch, Math.ceil(y1) + 3) - by;
    if (!(bw > 0 && bh > 0)) return;
    const o = surf.ctx;
    o.setTransform!(1, 0, 0, 1, 0, 0);
    o.globalCompositeOperation = "source-over";
    o.clearRect(bx, by, bw, bh);
    o.setTransform!(T.a, T.b, T.c, T.d, T.e, T.f);
    o.globalCompositeOperation = "lighter";
    drawRuns(o, tex.img, mesh, sk, view);
    for (let t = 0; t < mesh.blend.length; t += 3) drawTri(o, tex.img, scr, R, mesh.blend[t], mesh.blend[t + 1], mesh.blend[t + 2], 0, 0, 0);
    o.globalCompositeOperation = "source-over";
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(sc, bx, by, bw, bh, bx, by, bw, bh);
    ctx.restore();
    return;
  }
  // FALLBACK (no surface): direct source-over.
  drawRuns(ctx, tex.img, mesh, sk, view);
  // pass 1 — original texture; edges whose texture is uniform (all opaque / all
  // clear) are pushed SEAM_DELTA outward (overlap there is harmless), edges that
  // cross the anti-aliased silhouette band stay exact (no double alpha = no beads).
  const em = mesh.edgeMask;
  for (let t = 0, q = 0; t < mesh.blend.length; t += 3, q++) {
    const e = em ? em[q] : 7;
    drawTri(ctx, tex.img, scr, R, mesh.blend[t], mesh.blend[t + 1], mesh.blend[t + 2],
      e & 1 ? SEAM_DELTA : 0, e & 2 ? SEAM_DELTA : 0, e & 4 ? SEAM_DELTA : 0);
  }
  // pass 2 — only triangles with an exact (band-crossing) edge: uniform offset with
  // the SOLID texture: fills the conflation seam on the opaque part of those edges.
  if (mesh.solid && mesh.solidTris) {
    for (let j = 0; j < mesh.solidTris.length; j++) {
      const t = mesh.solidTris[j];
      drawTri(ctx, mesh.solid, scr, R, mesh.blend[t], mesh.blend[t + 1], mesh.blend[t + 2], SEAM_DELTA, SEAM_DELTA, SEAM_DELTA);
    }
  }
}

/** rigid runs: one clip (union of rects + row stitches) + one transformed blit per bone */
function drawRuns(ctx: Ctx2D, img: unknown, mesh: SkinMesh, sk: Skeleton, view: { scale: number; ox: number; oy: number }): void {
  const { scale: k, ox, oy } = view;
  const [gx, gy] = mesh.origin;
  for (const run of mesh.runs) {
    const m = sk.world[run.bone];
    ctx.save();
    ctx.transform(k * m[0], k * m[1], k * m[2], k * m[3],
      k * (m[0] * gx + m[2] * gy + m[4]) + ox, k * (m[1] * gx + m[3] * gy + m[5]) + oy);
    ctx.beginPath();
    const r = run.rects;
    for (let i = 0; i < r.length; i += 4) ctx.rect(r[i], r[i + 1], r[i + 2], r[i + 3]);
    ctx.clip();
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }
}

/** Per-layer offscreen surface for the isolated (additive, conflation-free) path. */
export function attachSurface(mesh: SkinMesh, makeCanvas: (w: number, h: number) => unknown): void {
  const c = makeCanvas(1, 1) as { width: number; height: number; getContext(t: "2d"): unknown };
  const cx = c.getContext("2d") as Ctx2D | null;
  if (cx) mesh.surface = { canvas: c, ctx: cx };
}

/**
 * One affine-textured triangle. Clip = triangle with each edge e pushed d_e device
 * px along its outward normal; vertex = intersection of the two offset lines
 * (2×2 solve; equal offsets give the miter P + δ(n1+n2)/(1+n1·n2)), capped at 3δ.
 */
function drawTri(
  ctx: Ctx2D, img: unknown, scr: Float32Array, R: Float32Array,
  ia: number, ib: number, ic: number, d0: number, d1: number, d2: number,
): void {
  const x0 = scr[ia * 2], y0 = scr[ia * 2 + 1];
  const x1 = scr[ib * 2], y1 = scr[ib * 2 + 1];
  const x2 = scr[ic * 2], y2 = scr[ic * 2 + 1];
  const u0 = R[ia * 2], v0 = R[ia * 2 + 1];
  const u1 = R[ib * 2], v1 = R[ib * 2 + 1];
  const u2 = R[ic * 2], v2 = R[ic * 2 + 1];
  const det = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
  if (Math.abs(det) < 1e-9) return;
  const sgn = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0) > 0 ? 1 : -1;
  let l = Math.hypot(x1 - x0, y1 - y0) || 1;
  const n0x = (sgn * (y1 - y0)) / l, n0y = (-sgn * (x1 - x0)) / l;   // edge 0: P0→P1
  l = Math.hypot(x2 - x1, y2 - y1) || 1;
  const n1x = (sgn * (y2 - y1)) / l, n1y = (-sgn * (x2 - x1)) / l;   // edge 1: P1→P2
  l = Math.hypot(x0 - x2, y0 - y2) || 1;
  const n2x = (sgn * (y0 - y2)) / l, n2y = (-sgn * (x0 - x2)) / l;   // edge 2: P2→P0
  ctx.save();
  ctx.beginPath();
  for (let v = 0; v < 3; v++) {
    const px = v === 0 ? x0 : v === 1 ? x1 : x2, py = v === 0 ? y0 : v === 1 ? y1 : y2;
    // incoming edge a, outgoing edge b
    const ax = v === 0 ? n2x : v === 1 ? n0x : n1x, ay = v === 0 ? n2y : v === 1 ? n0y : n1y;
    const bx = v === 0 ? n0x : v === 1 ? n1x : n2x, by = v === 0 ? n0y : v === 1 ? n1y : n2y;
    const da = v === 0 ? d2 : v === 1 ? d0 : d1, db = v === 0 ? d0 : v === 1 ? d1 : d2;
    let qx = 0, qy = 0;
    if (da > 0 || db > 0) {
      const dd = ax * by - ay * bx;
      if (Math.abs(dd) > 1e-3) { qx = (da * by - ay * db) / dd; qy = (ax * db - da * bx) / dd; }
      else { qx = (da * ax + db * bx) / 2; qy = (da * ay + db * by) / 2; }
      const ql = Math.hypot(qx, qy);
      if (ql > SEAM_MITER) { qx *= SEAM_MITER / ql; qy *= SEAM_MITER / ql; }
    }
    if (v === 0) ctx.moveTo(px + qx, py + qy); else ctx.lineTo(px + qx, py + qy);
  }
  ctx.closePath();
  ctx.clip();
  const a = ((x1 - x0) * (v2 - v0) - (x2 - x0) * (v1 - v0)) / det;
  const b = ((y1 - y0) * (v2 - v0) - (y2 - y0) * (v1 - v0)) / det;
  const c = ((x2 - x0) * (u1 - u0) - (x1 - x0) * (u2 - u0)) / det;
  const d = ((y2 - y0) * (u1 - u0) - (y1 - y0) * (u2 - u0)) / det;
  ctx.transform(a, b, c, d, x0 - a * u0 - c * v0, y0 - b * u0 - d * v0);
  // only the triangle's uv footprint (+2 texel margin covers the clip offset ≤3δ
  // at any scale ≥ ~1.2 device px / texel… margin grows with 1/scale below)
  const m = 2 + Math.ceil(SEAM_MITER / Math.max(0.25, Math.sqrt(Math.abs(a * d - b * c))));
  const sx = Math.max(0, Math.floor(Math.min(u0, u1, u2)) - m), sy = Math.max(0, Math.floor(Math.min(v0, v1, v2)) - m);
  const ex = Math.ceil(Math.max(u0, u1, u2)) + m, ey = Math.ceil(Math.max(v0, v1, v2)) + m;
  const iw = (img as { width: number }).width, ih = (img as { height: number }).height;
  const sw = Math.min(iw, ex) - sx, sh = Math.min(ih, ey) - sy;
  if (sw > 0 && sh > 0) ctx.drawImage(img, sx, sy, sw, sh, sx, sy, sw, sh);
  ctx.restore();
}

/**
 * Solid companion texture for pass 2 (alpha binarised at 250, eroded 1 texel at
 * binary edges, RGB kept). Built once
 * from the layer's RGBA AlphaMap with an environment-provided canvas factory.
 */
export function attachSolid(mesh: SkinMesh, alpha: AlphaMap, makeCanvas: (w: number, h: number) => unknown): void {
  const c = makeCanvas(alpha.w, alpha.h) as {
    getContext(t: "2d"): {
      createImageData(w: number, h: number): { data: Uint8ClampedArray };
      putImageData(d: unknown, x: number, y: number): void;
    } | null;
  };
  const cx = c.getContext("2d");
  if (!cx) return;
  const id = cx.createImageData(alpha.w, alpha.h);
  const s = alpha.data, d = id.data, W = alpha.w, H = alpha.h;
  // eroded by 1 texel ONLY at binary edges (opaque texel 4-adjacent to a fully
  // clear one = prep cuts, always backed by hidden art): there bilinear sampling of
  // the solid would redraw pass 1's render-time ramp (measured +64 α beads).
  // Next to a real anti-aliased band the solid keeps the outermost opaque texel
  // (fills its seam); its bilinear spread into the band adds ≈ +0.05 α.
  const A = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H ? s[(y * W + x) * 4 + 3] : 0);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      d[i] = s[i]; d[i + 1] = s[i + 1]; d[i + 2] = s[i + 2];
      const binEdge = A(x - 1, y) === 0 || A(x + 1, y) === 0 || A(x, y - 1) === 0 || A(x, y + 1) === 0;
      d[i + 3] = A(x, y) >= 250 && !binEdge ? 255 : 0;
    }
  }
  cx.putImageData(id, 0, 0);
  mesh.solid = c;
}
