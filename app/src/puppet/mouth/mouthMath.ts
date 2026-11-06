/**
 * Mouth Puppet v0.4 — pure math (no canvas, no assets).
 * Two independent controls, exactly as specified:
 *   • opening  o ∈ [0,1]          (6 perceptual states map onto it: closed,
 *     nearly-closed, half-closed, half-open, open, expressive-open)
 *   • shape    CLOSED|A|I|U|E|O   (articulation form; blended, never snapped)
 * The jaw is not a rigid plate: jawDy moves the lower-lip/chin-skin patch,
 * the oral cavity grows between a quasi-fixed upper lip and the descending
 * lower lip, teeth/tongue reveal is gradual and always clipped to the cavity.
 */
import { clamp, smoothDamp, type Vec2 } from "../puppetMath";

export interface MouthAnchors {
  cx: number;              // mouth centre x (pose px)
  seam_y: number;          // original lip seam line
  upper_lip_bottom_y: number; // cavity ceiling at rest
  lower_lip_top_y: number;    // original lower-lip top (descends with jaw)
  base_w: number;          // natural lip width
  jaw_dy: number;          // max jaw drop (pose px)
  closed_box: [number, number, number, number];
  jaw_box: [number, number, number, number];
}

export interface ShapeParams {
  width: number;  // lip-width factor vs base_w
  jaw: number;    // jaw-drop factor vs jaw_dy
  lift: number;   // upper-lip raise (px at o=1)
  tongue: number; // tongue visibility factor
  round: number;  // 0 = flat anime slit … 1 = full ellipse (O/U)
}

export interface MouthGeom {
  jawDy: number;
  cavityTop: number;
  cavityBot: number;
  cavityW: number;
  round: number;
  teethH: number;
  teethA: number;   // gradual teeth reveal 0..1
  tongueA: number;  // tongue only in adequate openings
  closedA: number;  // original-lips sprite alpha (rest = pixel-perfect)
  openA: number;    // procedural open-mouth alpha
  smile: number;    // -1..1: mouth-corner lift (procedural, open mouth only)
  cornerLift: number; // px the corners rise with smile
}

/** opening → perceptual state label (documentation/UI only; math stays continuous) */
export function openingState(o: number): string {
  if (o < 0.04) return "closed";
  if (o < 0.2) return "nearly-closed";
  if (o < 0.4) return "half-closed";
  if (o < 0.62) return "half-open";
  if (o < 0.85) return "open";
  return "expressive-open";
}

export function mouthGeometry(o: number, p: ShapeParams, a: MouthAnchors, smile = 0): MouthGeom {
  const oc = clamp(o, 0, 1);
  const sm = clamp(smile, -1, 1);
  const jawDy = oc * a.jaw_dy * p.jaw;
  const cavityTop = a.upper_lip_bottom_y - oc * p.lift;
  const cavityBot = a.lower_lip_top_y + jawDy - 0.4;
  const cavityH = Math.max(0, cavityBot - cavityTop);
  const cavityW = a.base_w * p.width * (0.55 + 0.45 * oc);
  return {
    jawDy,
    cavityTop,
    cavityBot,
    cavityW,
    round: p.round,
    teethH: Math.min(3.0, cavityH * 0.45),
    teethA: clamp((oc - 0.15) / 0.3, 0, 1) * clamp((cavityH - 1.5) / 2, 0, 1),
    tongueA: clamp((oc - 0.5) / 0.3, 0, 1) * p.tongue,
    closedA: clamp(1 - oc / 0.12, 0, 1),
    openA: clamp((oc - 0.06) / 0.12, 0, 1),
    smile: sm,
    cornerLift: sm * 1.8,
  };
}

/** jaw/opening smoothing lives here so renderer and tests share it */
export class MouthSmoother {
  o = 0;
  step(target: number, dt: number): number {
    this.o = smoothDamp(this.o, clamp(target, 0, 1), 14, dt);
    return this.o;
  }
}

/** blend helper for shape parameter vectors (smooth vowel→vowel transitions) */
export function lerpShape(a: ShapeParams, b: ShapeParams, t: number): ShapeParams {
  const L = (x: number, y: number): number => x + (y - x) * clamp(t, 0, 1);
  return {
    width: L(a.width, b.width),
    jaw: L(a.jaw, b.jaw),
    lift: L(a.lift, b.lift),
    tongue: L(a.tongue, b.tongue),
    round: L(a.round, b.round),
  };
}

export type MouthVec = Vec2; // reserved for future asymmetric mouth corner tweaks
