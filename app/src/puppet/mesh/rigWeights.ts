/**
 * v0.6 rig definition: skeleton, weight painting (as functions of measured
 * manifest geometry), and pose mapping.
 *
 * Bones: root → torso → neck → head
 *                    ↘ clavL → upperL → foreL → handL
 *                    ↘ clavR → upperR → foreR → handR
 *
 * Sheet (head+neck+torso, one texture):
 *   neck columns : chain head→neck→torso→root by row bands (Stage 1)
 *   shoulders    : clavicle influence ramps from the neck edge to the weld line,
 *                  fading out below the armpit; branch-mixed with the neck chain
 *                  across the neck edge (c), so head tilt no longer drags the
 *                  shoulder line and a shrug lifts both layers identically.
 * Arm (deltoid→fingertips, one texture per side):
 *   weld feather (clavicle, = sheet beneath) → deltoid ramp to UpperArm →
 *   elbow band to Forearm (jacket front panel follows at `drape`) → wrist band
 *   to Hand.
 */
import type { BoneDef, BonePose, VW, WeightFn } from "./meshRender";
import type { RigV06 } from "../puppetRender";

export const BN = {
  root: 0, torso: 1, neck: 2, head: 3,
  clavL: 4, upperL: 5, foreL: 6, handL: 7,
  clavR: 8, upperR: 9, foreR: 10, handR: 11,
} as const;

export interface ArmPose { shrug: number; shoulder: number; elbow: number; wrist: number }
export const ARM_REST: ArmPose = { shrug: 0, shoulder: 0, elbow: 0, wrist: 0 };

const sm = (t: number): number => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

function segDist(x: number, y: number, a: number[], b: number[]): number {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(x - (a[0] + t * vx), y - (a[1] + t * vy));
}

/** x of a top→bottom polyline at row y (clamped at the ends). */
function polyX(pts: number[][], y: number): number {
  if (y <= pts[0][1]) return pts[0][0];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    if (y <= y1) return y1 === y0 ? x1 : x0 + ((y - y0) / (y1 - y0)) * (x1 - x0);
  }
  return pts[pts.length - 1][0];
}

export function skeletonDefs(rig: RigV06): BoneDef[] {
  const bn = rig.bones;
  const defs: BoneDef[] = [
    { name: "root", parent: -1, pivot: bn.root },
    { name: "torso", parent: BN.root, pivot: bn.torso },
    { name: "neck", parent: BN.torso, pivot: bn.neck },
    { name: "head", parent: BN.neck, pivot: bn.head },
  ];
  if (rig.arms) {
    for (const s of ["L", "R"] as const) {
      const p = rig.arms[s].pivots;
      const base = defs.length;
      defs.push({ name: "clav" + s, parent: BN.torso, pivot: p.clav });
      defs.push({ name: "upper" + s, parent: base, pivot: p.shoulder });
      defs.push({ name: "fore" + s, parent: base + 1, pivot: p.elbow });
      defs.push({ name: "hand" + s, parent: base + 2, pivot: p.wrist });
    }
  }
  return defs;
}

/** Row-band chain weights of the neck/torso column (Stage 1 bands, rotational blend). */
export function chainVW(y: number): { b: number; f: number } {
  if (y <= 190) return { b: BN.head, f: 1 };
  if (y <= 215) return { b: BN.head, f: 1 - sm((y - 190) / 25) };
  if (y <= 255) return { b: BN.neck, f: 1 - sm((y - 215) / 40) };
  if (y <= 336) return { b: BN.torso, f: 1 };
  return { b: BN.torso, f: 1 - sm((y - 336) / 48) };
}

export function sheetWeights(rig: RigV06): WeightFn {
  const cs = rig.clav_sheet, arms = rig.arms;
  return (x: number, y: number): VW => {
    const ch = chainVW(y);
    const only: VW = { b0: ch.b, f0: ch.f, b1: 0, f1: 1, c: 0 };
    if (!cs || !arms) return only;
    const [l0, l1, r0, r1] = cs.neck_cols;
    const colN = sm((x - l0) / (l1 - l0)) * sm((r1 - x) / (r1 - r0));
    const gate = y > cs.fall[1] ? 0 : sm((y - cs.row_gate[0]) / (cs.row_gate[1] - cs.row_gate[0]));
    const c = (1 - colN) * gate;
    if (c <= 0) return only;
    const side = x < (l1 + r0) / 2 ? "L" : "R";
    const wx = polyX(arms[side].weld, y);
    const ne = cs.neck_edge[side];
    const u = side === "L" ? (ne - x) / Math.max(1, ne - wx) : (x - ne) / Math.max(1, wx - ne);
    const fall = 1 - sm((y - cs.fall[0]) / (cs.fall[1] - cs.fall[0]));
    return { b0: ch.b, f0: ch.f, b1: side === "L" ? BN.clavL : BN.clavR, f1: sm(u) * fall, c };
  };
}

/**
 * Arm weights. Shoulder: distance ramp from the weld (clavicle → UpperArm).
 * Elbow and wrist: ANGULAR weights about the joint pivot,
 *   f(ψ) = smoothstep((cos ψ + w) / 2w),  ψ = angle between (p − pivot) and the joint axis.
 * In polar coordinates the skin map is (ρ, φ) → (ρ, φ + θ·f), so
 *   det J = 1 + θ·∂f/∂φ ≥ 1 − θ·0.75/w  → no triangle can fold while θ < w/0.75 rad.
 * (A projection band or a lateral "drape" gradient has unbounded ∂f/∂φ far from the
 * pivot and folds — measured: 27 inverted triangles at 40°, 68 at 60°.)
 * A vertex carries one partial joint on top of its full parents; the analysis in the
 * stage-2 report shows the dropped term is ≤ 0.33 px where two would overlap.
 */
export function armWeights(rig: RigV06, side: "L" | "R"): WeightFn {
  const A = rig.arms!;
  const p = A[side].pivots;
  const ib = side === "L" ? BN.clavL : BN.clavR;
  const unit = (x: number, y: number): [number, number] => { const l = Math.hypot(x, y); return [x / l, y / l]; };
  const uf = unit(p.wrist[0] - p.elbow[0], p.wrist[1] - p.elbow[1]);
  const uu = unit(p.shoulder[0] - p.elbow[0], p.shoulder[1] - p.elbow[1]);
  const axE = unit(uf[0] - uu[0], uf[1] - uu[1]); // bisected elbow axis (upper → fore)
  const cone = (x: number, y: number, piv: number[], ax: [number, number], w: number): number => {
    const rx = x - piv[0], ry = y - piv[1], r = Math.hypot(rx, ry);
    if (r < 1e-6) return 0.5;
    return sm(((rx * ax[0] + ry * ax[1]) / r + w) / (2 * w));
  };
  const weld = A[side].weld;
  return (x: number, y: number): VW => {
    let dw = Infinity;
    for (let i = 0; i < weld.length - 1; i++) dw = Math.min(dw, segDist(x, y, weld[i], weld[i + 1]));
    const fu = sm((dw - A.feather) / A.upper_ramp);
    if (fu < 0.999) return fu > 0 ? { b0: ib + 1, f0: fu, b1: 0, f1: 1, c: 0 } : { b0: ib, f0: 1, b1: 0, f1: 1, c: 0 };
    const ff = cone(x, y, p.elbow, axE, A.elbow_cone_w);
    if (ff < 0.999) return ff > 0 ? { b0: ib + 2, f0: ff, b1: 0, f1: 1, c: 0 } : { b0: ib + 1, f0: 1, b1: 0, f1: 1, c: 0 };
    const fh = cone(x, y, p.wrist, uf, A.wrist_cone_w);
    return fh > 0 ? { b0: ib + 3, f0: fh, b1: 0, f1: 1, c: 0 } : { b0: ib + 2, f0: 1, b1: 0, f1: 1, c: 0 };
  };
}

/**
 * Jacket front panel (collar strip + zipper + turned-out facing): hangs from the
 * collar that sits on the upper arm (off-shoulder jacket), so it follows clavicle →
 * UpperArm exactly like the sleeve near the weld, but NOT the forearm/hand — the
 * sleeve slides over it (depth layer) instead of dragging it into a compressed fan.
 */
export function panelWeights(rig: RigV06, side: "L" | "R"): WeightFn {
  const A = rig.arms!;
  const ib = side === "L" ? BN.clavL : BN.clavR;
  const weld = A[side].weld;
  return (x: number, y: number): VW => {
    let dw = Infinity;
    for (let i = 0; i < weld.length - 1; i++) dw = Math.min(dw, segDist(x, y, weld[i], weld[i + 1]));
    const fu = sm((dw - A.feather) / A.upper_ramp);
    return fu > 0 ? { b0: ib + 1, f0: fu, b1: 0, f1: 1, c: 0 } : { b0: ib, f0: 1, b1: 0, f1: 1, c: 0 };
  };
}

export function clampArm(rig: RigV06, a: ArmPose): ArmPose {
  const L = rig.arms?.limits;
  if (!L) return a;
  const c = (v: number, r: [number, number]) => Math.max(r[0], Math.min(r[1], v));
  return { shrug: c(a.shrug, L.shrug), shoulder: c(a.shoulder, L.shoulder), elbow: c(a.elbow, L.elbow), wrist: c(a.wrist, L.wrist) };
}

export interface RigPoseInput {
  torsoRot: number; headRot: number; headDx: number; headDy: number; neckComp: number;
  arms?: { L?: ArmPose; R?: ArmPose };
}

/**
 * Bone poses. User-facing arm angles (deg): shrug + = shoulder up, shoulder + =
 * arm out (abduction), elbow + = flexion toward the midline, wrist + = fingers
 * toward the midline. Sides are mirrored here.
 */
export function buildPoses(rig: RigV06, p: RigPoseInput): BonePose[] {
  const poses: BonePose[] = [
    { rot: 0 },
    { rot: p.torsoRot },
    { rot: p.neckComp * p.headRot },
    { rot: (1 - p.neckComp) * p.headRot, dx: p.headDx, dy: p.headDy },
  ];
  if (rig.arms) {
    for (const s of ["L", "R"] as const) {
      const a = clampArm(rig, p.arms?.[s] ?? ARM_REST);
      const sg = s === "L" ? 1 : -1;
      poses.push({ rot: sg * a.shrug }, { rot: sg * a.shoulder }, { rot: -sg * a.elbow }, { rot: -sg * a.wrist });
    }
  }
  return poses;
}
