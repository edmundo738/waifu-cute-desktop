/**
 * Mouth Puppet v0.4 — articulation shapes.
 * Anime semi-realistic middle ground: vowels are recognisable but never
 * cartoonishly huge (widths ≤1.25×, jaw ≤5.5 pose px), matching the scale of
 * the eye component. Shapes are parameter vectors so they BLEND smoothly.
 */
import type { ShapeParams } from "./mouthMath";

export type MouthShape = "CLOSED" | "A" | "I" | "U" | "E" | "O";

export const MOUTH_SHAPES: MouthShape[] = ["CLOSED", "A", "I", "U", "E", "O"];

export const SHAPE_PARAMS: Record<MouthShape, ShapeParams> = {
  // width, jaw, lift, tongue, round
  CLOSED: { width: 1.0,  jaw: 0.0,  lift: 0.0, tongue: 0.0, round: 0.0 },
  A:      { width: 1.0,  jaw: 1.0,  lift: 1.2, tongue: 1.0, round: 0.55 },
  I:      { width: 1.25, jaw: 0.35, lift: 0.6, tongue: 0.15, round: 0.25 },
  U:      { width: 0.62, jaw: 0.55, lift: 0.6, tongue: 0.3, round: 0.9 },
  E:      { width: 1.12, jaw: 0.6,  lift: 0.6, tongue: 0.45, round: 0.35 },
  O:      { width: 0.72, jaw: 0.8,  lift: 1.2, tongue: 0.7, round: 0.95 },
};

export interface SpeechSegment {
  dur: number;        // seconds
  open: number;       // 0..1
  shape: MouthShape;
}

const VOWEL: Record<string, { shape: MouthShape; open: number }> = {
  a: { shape: "A", open: 0.75 }, á: { shape: "A", open: 0.75 }, à: { shape: "A", open: 0.7 }, â: { shape: "A", open: 0.7 },
  e: { shape: "E", open: 0.55 }, é: { shape: "E", open: 0.65 }, ê: { shape: "E", open: 0.5 },
  i: { shape: "I", open: 0.45 }, í: { shape: "I", open: 0.45 },
  o: { shape: "O", open: 0.6 }, ó: { shape: "O", open: 0.7 }, ô: { shape: "O", open: 0.6 }, õ: { shape: "O", open: 0.55 },
  u: { shape: "U", open: 0.5 }, ú: { shape: "U", open: 0.5 },
};

/**
 * Text → speech timeline (light PT/EN phonetic heuristic, no external TTS):
 * vowels drive shapes; m/b/p close briefly; s/z/x/j lean to I; open consonants
 * use a modest E; spaces/punctuation rest closed. Deliberately understated.
 */
export function speechTimeline(text: string): SpeechSegment[] {
  const tl: SpeechSegment[] = [];
  const chars = text.toLowerCase().split("");
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const v = VOWEL[c];
    if (v) {
      tl.push({ dur: 0.095, open: v.open, shape: v.shape });
    } else if ("mbp".includes(c)) {
      tl.push({ dur: 0.07, open: 0.05, shape: "CLOSED" });
    } else if ("szxjçc".includes(c)) {
      tl.push({ dur: 0.06, open: 0.3, shape: "I" });
    } else if (" ".includes(c)) {
      tl.push({ dur: 0.08, open: 0.05, shape: "CLOSED" });
    } else if (".!?;,".includes(c)) {
      tl.push({ dur: 0.14, open: 0.03, shape: "CLOSED" });
    } else if (c.match(/[a-z0-9]/)) {
      tl.push({ dur: 0.07, open: 0.35, shape: "E" });
    }
  }
  tl.push({ dur: 0.18, open: 0.02, shape: "CLOSED" });
  return tl;
}

export function timelineTotal(tl: SpeechSegment[]): number {
  return tl.reduce((s, x) => s + x.dur, 0);
}

/** sample a timeline at time t → (open, shape); after the end = CLOSED */
export function sampleTimeline(tl: SpeechSegment[], t: number): { open: number; shape: MouthShape } {
  let acc = 0;
  for (const seg of tl) {
    if (t < acc + seg.dur) return { open: seg.open, shape: seg.shape };
    acc += seg.dur;
  }
  return { open: 0, shape: "CLOSED" };
}
