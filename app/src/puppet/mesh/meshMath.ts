/**
 * v0.6 foundation prototype — 2D mesh + skeletal skinning math (pure, tested).
 * This is the technical base for the continuous-anatomy rig: ONE artwork per
 * body part region receives a triangle mesh; bones drive vertices through
 * smooth (linear-blend) weights, so elbows/neck bend WITHOUT cutting the art
 * into paper-doll pieces. Renderer-agnostic: the browser canvas draws the
 * deformed mesh as textured triangles; the node selftest verifies the math.
 *
 * Design rules encoded here (from the architecture proposal):
 *  - denser topology where things bend (caller chooses step per region)
 *  - gradual weights (smoothstep falloff), never a hard vertex→bone switch
 *  - rest pose = identity (no drift), transforms compose per bone hierarchy
 */

export interface GridMesh {
  cols: number;
  rows: number;
  /** rest positions, interleaved x,y (pose-space px) */
  rest: Float64Array;
  /** triangle indices */
  tris: Uint32Array;
}

export interface Bone {
  name: string;
  /** root & tip in pose space (bind pose) */
  x0: number; y0: number; x1: number; y1: number;
  parent: number; // -1 = root
}

export interface BonePose {
  rotDeg: number;
  dx: number;
  dy: number;
}

export function buildGridMesh(x0: number, y0: number, x1: number, y1: number, step: number): GridMesh {
  const cols = Math.max(2, Math.round((x1 - x0) / step) + 1);
  const rows = Math.max(2, Math.round((y1 - y0) / step) + 1);
  const rest = new Float64Array(cols * rows * 2);
  let v = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      rest[v++] = x0 + (c * (x1 - x0)) / (cols - 1);
      rest[v++] = y0 + (r * (y1 - y0)) / (rows - 1);
    }
  }
  const tris = new Uint32Array((cols - 1) * (rows - 1) * 6);
  let t = 0;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      tris[t++] = a; tris[t++] = d; tris[t++] = b;
      tris[t++] = b; tris[t++] = d; tris[t++] = e;
    }
  }
  return { cols, rows, rest, tris };
}

function distToSegment(px: number, py: number, b: Bone): number {
  const vx = b.x1 - b.x0, vy = b.y1 - b.y0;
  const L2 = vx * vx + vy * vy || 1;
  let t = ((px - b.x0) * vx + (py - b.y0) * vy) / L2;
  t = Math.max(0, Math.min(1, t));
  const qx = b.x0 + t * vx, qy = b.y0 + t * vy;
  return Math.hypot(px - qx, py - qy);
}

/** Smooth (smoothstep) distance falloff weights, normalized per vertex. */
export function boneWeights(mesh: GridMesh, bones: Bone[], radius: number): Float64Array {
  const nV = mesh.rest.length / 2;
  const w = new Float64Array(nV * bones.length);
  for (let i = 0; i < nV; i++) {
    const px = mesh.rest[i * 2], py = mesh.rest[i * 2 + 1];
    let sum = 0;
    let nearest = 0, nd = Infinity;
    for (let bi = 0; bi < bones.length; bi++) {
      const d = distToSegment(px, py, bones[bi]);
      if (d < nd) { nd = d; nearest = bi; }
      const u = Math.max(0, Math.min(1, 1 - d / radius));
      const s = u * u * (3 - 2 * u); // smoothstep: gradual, C1
      w[i * bones.length + bi] = s;
      sum += s;
    }
    if (sum <= 1e-9) {
      w[i * bones.length + nearest] = 1;
      sum = 1;
    }
    for (let bi = 0; bi < bones.length; bi++) w[i * bones.length + bi] /= sum;
  }
  return w;
}

/** Linear-blend skinning: each bone rotates about its root then translates. */
export function skinVertices(
  mesh: GridMesh,
  bones: Bone[],
  weights: Float64Array,
  poses: BonePose[],
): Float64Array {
  const nV = mesh.rest.length / 2;
  const out = new Float64Array(nV * 2);
  const mats = bones.map((b, i) => {
    const r = (poses[i]?.rotDeg ?? 0) * Math.PI / 180;
    const c = Math.cos(r), s = Math.sin(r);
    return { c, s, dx: poses[i]?.dx ?? 0, dy: poses[i]?.dy ?? 0, x0: b.x0, y0: b.y0 };
  });
  for (let i = 0; i < nV; i++) {
    const px = mesh.rest[i * 2], py = mesh.rest[i * 2 + 1];
    let ax = 0, ay = 0;
    for (let bi = 0; bi < bones.length; bi++) {
      const w = weights[i * bones.length + bi];
      if (w <= 1e-6) continue;
      const m = mats[bi];
      const lx = px - m.x0, ly = py - m.y0;
      ax += w * (m.c * lx - m.s * ly + m.x0 + m.dx);
      ay += w * (m.s * lx + m.c * ly + m.y0 + m.dy);
    }
    out[i * 2] = ax;
    out[i * 2 + 1] = ay;
  }
  return out;
}
