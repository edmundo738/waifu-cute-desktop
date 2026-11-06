/**
 * v0.6 Stage 1 — skinned-sheet renderer (canvas 2D, no dependencies).
 *
 * The head+neck+upper-torso is ONE continuous texture (rig/body_sheet.png).
 * A grid mesh over it is weighted to four bones (root, torso, neck, head) with
 * smoothstep blend bands, so torso lean / head tilt deform the junctions
 * instead of tearing sprite seams.
 *
 * Performance model: triangles whose three vertices share one bone at weight 1
 * are drawn as a single transformed drawImage (rigid region); only triangles
 * inside blend bands (~1.3k) go through the per-triangle affine texture map.
 */
import type { Ctx2D } from "../puppetRender";

export interface SkinMesh {
  w: number; h: number; step: number;
  cols: number; rows: number;
  /** rest positions in sheet-local px, xy interleaved */
  rest: Float32Array;
  /** per vertex: bone indices (0 root,1 torso,2 neck,3 head) + weight of b1 */
  vb0: Uint8Array; vb1: Uint8Array; vw: Float32Array;
  /** triangles, vertex indices; rigid ones flagged per triangle */
  tris: Uint32Array;
  rigid: Uint8Array;
  /** rigid draw spans: sheet-local row ranges per bone */
  rigidSpans: { bone: number; r0: number; r1: number }[];
}

export type Mat = [number, number, number, number, number, number]; // a b c d e f

export const BONE = { root: 0, torso: 1, neck: 2, head: 3 } as const;

const smooth = (t: number): number => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

/** Piecewise bone weights by sheet-local row (== pose row, sheet y0 = 0). */
export function weightsAt(y: number): { b0: number; b1: number; w: number } {
  if (y <= 190) return { b0: BONE.head, b1: BONE.head, w: 0 };
  if (y <= 215) return { b0: BONE.head, b1: BONE.neck, w: smooth((y - 190) / 25) };
  if (y <= 255) return { b0: BONE.neck, b1: BONE.torso, w: smooth((y - 215) / 40) };
  if (y <= 336) return { b0: BONE.torso, b1: BONE.torso, w: 0 };
  return { b0: BONE.torso, b1: BONE.root, w: smooth((y - 336) / 48) };
}

export function buildSkinMesh(w: number, h: number, step: number): SkinMesh {
  const cols = Math.floor(w / step) + 1;
  const rows = Math.floor(h / step) + 1;
  const n = cols * rows;
  const rest = new Float32Array(n * 2);
  const vb0 = new Uint8Array(n);
  const vb1 = new Uint8Array(n);
  const vw = new Float32Array(n);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const x = Math.min(w, c * step);
      const y = Math.min(h, r * step);
      rest[i * 2] = x;
      rest[i * 2 + 1] = y;
      const wt = weightsAt(y);
      vb0[i] = wt.b0;
      vb1[i] = wt.b1;
      vw[i] = wt.w;
    }
  }
  const tris: number[] = [];
  const rigid: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const i0 = r * cols + c, i1 = i0 + 1, i2 = i0 + cols, i3 = i2 + 1;
      for (const t of [i0, i1, i3, i0, i3, i2]) tris.push(t);
      for (let k = 0; k < 2; k++) {
        const a = tris[tris.length - 6 + k * 3];
        const b = tris[tris.length - 6 + k * 3 + 1];
        const cc = tris[tris.length - 6 + k * 3 + 2];
        const pure = (i: number) => vw[i] === 0;
        const same = vb0[a] === vb0[b] && vb0[b] === vb0[cc];
        rigid.push(same && pure(a) && pure(b) && pure(cc) ? 1 : 0);
      }
    }
  }
  return {
    w, h, step, cols, rows, rest, vb0, vb1, vw,
    tris: Uint32Array.from(tris), rigid: Uint8Array.from(rigid),
    rigidSpans: [
      { bone: BONE.head, r0: 0, r1: 190 },
      { bone: BONE.torso, r0: 255, r1: 336 },
    ],
  };
}

/** Skin one rest position through its two bones (rest is sheet-local; mats are pose-space). */
function skinPt(mesh: SkinMesh, i: number, mats: Mat[], out: [number, number], origin: [number, number]): void {
  const x = mesh.rest[i * 2] + origin[0], y = mesh.rest[i * 2 + 1] + origin[1];
  const w1 = mesh.vw[i];
  const w0 = 1 - w1;
  const m0 = mats[mesh.vb0[i]], m1 = mats[mesh.vb1[i]];
  const x0 = m0[0] * x + m0[2] * y + m0[4];
  const y0 = m0[1] * x + m0[3] * y + m0[5];
  if (w1 === 0) { out[0] = x0; out[1] = y0; return; }
  const x1 = m1[0] * x + m1[2] * y + m1[4];
  const y1 = m1[1] * x + m1[3] * y + m1[5];
  out[0] = x0 * w0 + x1 * w1;
  out[1] = y0 * w0 + y1 * w1;
}

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

export const ID_MAT: Mat = [1, 0, 0, 1, 0, 0];

/**
 * Draw the skinned sheet. `view` maps pose px → pre-wrapper screen px
 * (scale k + offsets ox,oy); the caller's current ctx transform (e.g. breathe)
 * wraps everything uniformly.
 */
export function drawSkinnedSheet(
  ctx: Ctx2D,
  tex: { img: unknown; w: number; h: number },
  mesh: SkinMesh,
  mats: Mat[],
  view: { scale: number; ox: number; oy: number },
  origin: [number, number], // sheet box origin in pose space
): void {
  const { scale: k, ox, oy } = view;
  // rigid spans: one transformed blit each
  for (const span of mesh.rigidSpans) {
    const m = mats[span.bone];
    // screen = V ∘ M ∘ O, applied on top of the current (breathe) transform
    const a = k * m[0], b = k * m[1], c = k * m[2], d = k * m[3];
    const e = k * (m[0] * origin[0] + m[2] * origin[1] + m[4]) + ox;
    const f = k * (m[1] * origin[0] + m[3] * origin[1] + m[5]) + oy;
    ctx.save();
    ctx.transform(a, b, c, d, e, f);
    ctx.drawImage(tex.img, 0, span.r0, tex.w, span.r1 - span.r0, 0, span.r0, tex.w, span.r1 - span.r0);
    ctx.restore();
  }
  // skinned band triangles
  const pt: [number, number] = [0, 0];
  const uv: [number, number][] = [[0, 0], [0, 0], [0, 0]];
  const dst: [number, number][] = [[0, 0], [0, 0], [0, 0]];
  for (let t = 0; t < mesh.tris.length; t += 3) {
    const ti = t / 3;
    if (mesh.rigid[ti]) continue;
    for (let v = 0; v < 3; v++) {
      const i = mesh.tris[t + v];
      skinPt(mesh, i, mats, pt, origin);
      uv[v][0] = mesh.rest[i * 2];
      uv[v][1] = mesh.rest[i * 2 + 1];
      dst[v][0] = ox + k * pt[0];
      dst[v][1] = oy + k * pt[1];
    }
    // expand clip ~0.7px around centroid to hide inter-triangle seams
    const cx = (dst[0][0] + dst[1][0] + dst[2][0]) / 3;
    const cy = (dst[0][1] + dst[1][1] + dst[2][1]) / 3;
    ctx.save();
    ctx.beginPath();
    for (let v = 0; v < 3; v++) {
      const dx = dst[v][0] - cx, dy = dst[v][1] - cy;
      const len = Math.hypot(dx, dy) || 1;
      const px = dst[v][0] + (dx / len) * 0.7;
      const py = dst[v][1] + (dy / len) * 0.7;
      if (v === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.clip();
    // affine uv→dst
    const [u0, v0] = uv[0], [u1, v1] = uv[1], [u2, v2] = uv[2];
    const det = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
    if (Math.abs(det) < 1e-9) { ctx.restore(); continue; }
    const [x0, y0] = dst[0], [x1, y1] = dst[1], [x2, y2] = dst[2];
    const a = ((x1 - x0) * (v2 - v0) - (x2 - x0) * (v1 - v0)) / det;
    const b = ((y1 - y0) * (v2 - v0) - (y2 - y0) * (v1 - v0)) / det;
    const c = ((x2 - x0) * (u1 - u0) - (x1 - x0) * (u2 - u0)) / det;
    const d = ((y2 - y0) * (u1 - u0) - (y1 - y0) * (u2 - u0)) / det;
    const e = x0 - a * u0 - c * v0;
    const f = y0 - b * u0 - d * v0;
    ctx.transform(a, b, c, d, e, f);
    ctx.drawImage(tex.img, 0, 0);
    ctx.restore();
  }
}
