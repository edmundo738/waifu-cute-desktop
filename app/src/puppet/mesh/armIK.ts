/**
 * Analytic two-bone IK (UpperArm + Forearm) for the v0.6 arm chains.
 * Solves in the clavicle frame (so shrug and torso lean are respected), picks
 * the elbow-out solution (natural for arms hanging beside the body), clamps
 * to manifest limits and verifies by forward kinematics.
 */
import { applyMat, invMat, solveSkeleton } from "./meshRender";
import { BN, buildPoses, clampArm, skeletonDefs, type ArmPose } from "./rigWeights";
import type { RigV06 } from "../puppetRender";

const norm = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export interface IKResult { pose: ArmPose; err: number; clamped: boolean }

export function solveArmIK(
  rig: RigV06, side: "L" | "R", target: [number, number],
  opts: { shrug?: number; wrist?: number; torsoRot?: number } = {},
): IKResult {
  const p = rig.arms![side].pivots;
  const defs = skeletonDefs(rig);
  const base: ArmPose = { shrug: opts.shrug ?? 0, shoulder: 0, elbow: 0, wrist: opts.wrist ?? 0 };
  const input = { torsoRot: opts.torsoRot ?? 0, headRot: 0, headDx: 0, headDy: 0, neckComp: 0.35 };
  const sk0 = solveSkeleton(defs, buildPoses(rig, { ...input, arms: { [side]: base } }));
  const clav = side === "L" ? BN.clavL : BN.clavR;
  const [tx, ty] = applyMat(invMat(sk0.world[clav]), target[0], target[1]);
  const S = p.shoulder, E0 = p.elbow, W0 = p.wrist;
  const L1 = Math.hypot(E0[0] - S[0], E0[1] - S[1]);
  const L2 = Math.hypot(W0[0] - E0[0], W0[1] - E0[1]);
  const Dx = tx - S[0], Dy = ty - S[1];
  const d = Math.max(Math.abs(L1 - L2) + 1e-3, Math.min(L1 + L2 - 1e-3, Math.hypot(Dx, Dy)));
  const baseAng = Math.atan2(Dy, Dx);
  const A = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  // elbow-out: farther from the body midline
  const cand = [baseAng + A, baseAng - A].map((th) => ({ th, ex: S[0] + L1 * Math.cos(th) }));
  const pick = side === "L" ? (cand[0].ex < cand[1].ex ? cand[0] : cand[1]) : (cand[0].ex > cand[1].ex ? cand[0] : cand[1]);
  const Ex = S[0] + L1 * Math.cos(pick.th), Ey = S[1] + L1 * Math.sin(pick.th);
  const Tx = S[0] + d * Math.cos(baseAng), Ty = S[1] + d * Math.sin(baseAng);
  const r1 = norm(pick.th - Math.atan2(E0[1] - S[1], E0[0] - S[0]));
  const r2 = norm(Math.atan2(Ty - Ey, Tx - Ex) - Math.atan2(W0[1] - E0[1], W0[0] - E0[0]) - r1);
  const deg = 180 / Math.PI;
  const sg = side === "L" ? 1 : -1;
  const raw: ArmPose = { ...base, shoulder: sg * r1 * deg, elbow: -sg * r2 * deg };
  const pose = clampArm(rig, raw);
  const clamped = Math.abs(pose.shoulder - raw.shoulder) > 1e-6 || Math.abs(pose.elbow - raw.elbow) > 1e-6;
  const sk = solveSkeleton(defs, buildPoses(rig, { ...input, arms: { [side]: pose } }));
  const hand = side === "L" ? BN.handL : BN.handR;
  const [wx, wy] = applyMat(sk.world[hand], W0[0], W0[1]);
  return { pose, err: Math.hypot(wx - target[0], wy - target[1]), clamped };
}
