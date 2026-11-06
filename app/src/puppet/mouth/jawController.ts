/**
 * Mouth Puppet v0.4 — jaw controller.
 * Owns the two controls (opening 0..1 + shape) and their interpolation:
 * opening uses exponential smoothing (λ=14), shape parameters blend as a
 * vector (λ=12) so A→O never snaps. The jaw drop it produces moves the
 * lower-lip/chin-skin patch; it is NOT a rigid plate translation of the head.
 */
import { clamp, smoothDamp } from "../puppetMath";
import { lerpShape, mouthGeometry, type MouthAnchors, type MouthGeom, type ShapeParams } from "./mouthMath";
import { SHAPE_PARAMS, sampleTimeline, speechTimeline, timelineTotal, type MouthShape, type SpeechSegment } from "./mouthShapes";

export class JawController {
  private o = 0;
  private p: ShapeParams = { ...SHAPE_PARAMS.CLOSED };
  private targetO = 0;
  private targetShape: MouthShape = "CLOSED";
  private tl: SpeechSegment[] | null = null;
  private tlT0 = 0;

  /** direct control (e.g. manual sliders / future TTS viseme stream) */
  setTarget(open: number, shape: MouthShape): void {
    this.tl = null;
    this.targetO = clamp(open, 0, 1);
    this.targetShape = shape;
  }

  /** speech driver: text → understated vowel timeline */
  setSpeech(text: string, now: number): void {
    if (!text) {
      this.tl = null;
      this.targetO = 0;
      this.targetShape = "CLOSED";
      return;
    }
    this.tl = speechTimeline(text);
    this.tlT0 = now;
  }

  speechActive(now: number): boolean {
    return !!this.tl && now - this.tlT0 < timelineTotal(this.tl);
  }

  step(dt: number, now: number): void {
    if (this.tl) {
      const t = now - this.tlT0;
      if (t >= timelineTotal(this.tl)) {
        this.tl = null;
        this.targetO = 0;
        this.targetShape = "CLOSED";
      } else {
        const s = sampleTimeline(this.tl, t);
        this.targetO = s.open;
        this.targetShape = s.shape;
      }
    }
    this.o = smoothDamp(this.o, this.targetO, 14, dt);
    const tgt = SHAPE_PARAMS[this.targetShape];
    const a = 1 - Math.exp(-12 * dt);
    this.p = lerpShape(this.p, tgt, a);
  }

  get opening(): number {
    return this.o;
  }

  geom(anchors: MouthAnchors, smile = 0): MouthGeom {
    return mouthGeometry(this.o, this.p, anchors, smile);
  }
}
