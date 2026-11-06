import { CompanionRenderer, PoseName, SPRITE_URL } from "../companion/types";
import { RigManifest, RigAssets, computeView, renderPuppetFrame } from "./puppetRender";
import type { AlphaMap } from "./mesh/meshRender";
import { ARM_REST, type ArmPose } from "./mesh/rigWeights";
import { solveArmIK } from "./mesh/armIK";
import { headTarget, smoothDamp, idleGaze, blinkValue, pointerToGaze, SecondaryMotion, clamp } from "./puppetMath";
import { JawController } from "./mouth/jawController";
import { loadMouthAssets } from "./mouth/mouthLayers";
import type { MouthShape } from "./mouth/mouthShapes";

export const RIG_MANIFEST_URL = "/rig/manifest.json";
const FIG_BOX: [number, number, number, number] = [470, 7, 789, 842];

export interface FaceParams {
  browRaise?: number;      // -1..1 target
  gazeBias?: { x: number; y: number }; // additive gaze target (expressions)
}

/**
 * Component puppet renderer — the custom lightweight 2D engine instance
 * (layered sprites + clip masks + parameter-driven transforms + interpolation).
 * The eye component is the reference implementation; torso/arm components reuse
 * the same primitives in later milestones. NOT a Live2D/Inochi2D model.
 */
export class PuppetRenderer implements CompanionRenderer {
  readonly kind = "puppet" as const;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private assets!: RigAssets;
  private man!: RigManifest;
  private sprites = new Map<PoseName, HTMLImageElement>();
  private pose: PoseName = "neutral";

  private gazeTarget = { x: 0, y: 0 };
  private gaze = { x: 0, y: 0 };
  private head = { rot: 0, dx: 0, dy: 0 };
  private browTarget = 0;
  private brow = 0;
  private gazeBias = { x: 0, y: 0 };
  private blinkStart = -1;
  private nextBlink = 2.0;
  private blink = 0;
  private breath = 0;
  private torsoNow = 0;
  private armsNow: { L: ArmPose; R: ArmPose } = { L: { ...ARM_REST }, R: { ...ARM_REST } };
  private armTest = false;
  /** ?perf=1 — console-only frame timing (the node selftest is a software-raster proxy) */
  private perf = { on: false, drawMs: 0, frames: 0, since: 0 };
  private lastPointer = -10;
  private faceFollow = false;
  private external = { x: 0, y: 0 };
  private lastExternal = -10;
  private jaw = new JawController();
  // secondary motion: hair layers lag behind the head (spring drag-behind)
  private puffX = new SecondaryMotion(); private puffY = new SecondaryMotion();
  private tLX = new SecondaryMotion(); private tLY = new SecondaryMotion();
  private tRX = new SecondaryMotion(); private tRY = new SecondaryMotion();
  private smile = 0;
  private smileTarget = 0;
  private winkStart = -10;

  /** Expression parameters (v0.5): smile -1..1 and a one-shot right-eye wink. */
  setExpression(e: { smile?: number; wink?: boolean }): void {
    if (e.smile !== undefined) this.smileTarget = clamp(e.smile, -1, 1);
    if (e.wink) this.winkStart = this.t;
  }
  private t = 0;
  private last = 0;
  private raf = 0;
  private disposed = false;
  private hairNow: { puff: { x: number; y: number }; tL: { x: number; y: number }; tR: { x: number; y: number } } =
    { puff: { x: 0, y: 0 }, tL: { x: 0, y: 0 }, tR: { x: 0, y: 0 } };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    this.ctx = ctx;
  }

  async init(): Promise<void> {
    const res = await fetch(RIG_MANIFEST_URL);
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) {
      throw new Error("rig manifest unavailable");
    }
    this.man = (await res.json()) as RigManifest;
    const load = (u: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("load failed " + u));
        img.src = u;
      });
    const [body, neck, headBase, irisL, irisR, lidL, lidR, browL, browR] = await Promise.all([
      load("/rig/body_base.png"), load("/rig/neck_patch.png"), load("/rig/head_base_nm.png"),
      load("/rig/iris_L.png"), load("/rig/iris_R.png"), load("/rig/lid_L.png"),
      load("/rig/lid_R.png"), load("/rig/brow_L.png"), load("/rig/brow_R.png"),
    ]);
    const mouth = await loadMouthAssets(load);
    const [hairPuff, hairTL, hairTR] = await Promise.all([
      load("/rig/hair_puff.png"), load("/rig/hair_tendril_L.png"), load("/rig/hair_tendril_R.png"),
    ]);
    // v0.6 stage-1 rig (continuous skinned sheet) behind ?rig=v06 until parity proven
    const useV06 = new URLSearchParams(window.location.search).get("rig") === "v06";
    let sheet: HTMLImageElement | undefined, lower: HTMLImageElement | undefined;
    let armL: HTMLImageElement | undefined, armR: HTMLImageElement | undefined;
    let panelL: HTMLImageElement | undefined, panelR: HTMLImageElement | undefined;
    if (useV06) {
      [sheet, lower, armL, armR, panelL, panelR] = await Promise.all([
        load("/rig/body_sheet.png"), load("/rig/body_lower.png"),
        load("/rig/arm_L.png"), load("/rig/arm_R.png"),
        load("/rig/panel_L.png"), load("/rig/panel_R.png"),
      ]);
    }
    this.armTest = useV06 && new URLSearchParams(window.location.search).get("armtest") === "1";
    this.perf.on = new URLSearchParams(window.location.search).get("perf") === "1";
    // one-off RGBA readback so the mesh builder can skip empty cells
    const alphaOf = (img?: HTMLImageElement): AlphaMap | undefined => {
      if (!img) return undefined;
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const cx = c.getContext("2d");
      if (!cx) return undefined;
      cx.drawImage(img, 0, 0);
      return { data: cx.getImageData(0, 0, img.width, img.height).data, w: img.width, h: img.height };
    };
    this.assets = {
      body, bodyW: body.width, bodyH: body.height, neck, headBase,
      sheet, sheetW: sheet?.width, sheetH: sheet?.height,
      lower, lowerW: lower?.width, lowerH: lower?.height,
      arm: armL && armR ? { L: armL, R: armR } : undefined,
      panel: panelL && panelR ? { L: panelL, R: panelR } : undefined,
      makeCanvas: (w: number, h: number) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; },
      alpha: useV06 ? {
        sheet: alphaOf(sheet), armL: alphaOf(armL), armR: alphaOf(armR), panelL: alphaOf(panelL), panelR: alphaOf(panelR),
      } : undefined,
      iris: { L: irisL, R: irisR }, lid: { L: lidL, R: lidR }, brow: { L: browL, R: browR },
      mouth,
      hair: { puff: hairPuff, tL: hairTL, tR: hairTR },
      sizes: {
        headBase: [headBase.width, headBase.height],
        hair_puff: [hairPuff.width, hairPuff.height],
        hair_tendril_L: [hairTL.width, hairTL.height],
        hair_tendril_R: [hairTR.width, hairTR.height],
        iris_L: [irisL.width, irisL.height], iris_R: [irisR.width, irisR.height],
        lid_L: [lidL.width, lidL.height], lid_R: [lidR.width, lidR.height],
        brow_L: [browL.width, browL.height], brow_R: [browR.width, browR.height],
      },
    };
    await Promise.all(
      (Object.keys(SPRITE_URL) as PoseName[]).map(async (p) => {
        this.sprites.set(p, await load(SPRITE_URL[p]));
      }),
    );
    this.resize();
    window.addEventListener("resize", this.resize);
    this.last = performance.now();
    this.loop(this.last);
  }

  setPose(pose: PoseName): void {
    this.pose = pose;
  }

  /** Raw viewport cursor coords → gaze relative to HER eyes' on-screen position
   *  (canvas rect + view transform). Fixes the off-axis feel of window-centred
   *  normalization: cursor exactly over her face = neutral (0,0). */
  setGaze(x: number, y: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = this.canvas.width / Math.max(1, rect.width);
    const view = computeView(this.canvas.width, this.canvas.height, FIG_BOX);
    const ex = this.man ? (this.man.eyes.L.open_c[0] + this.man.eyes.R.open_c[0]) / 2 : 632;
    const ey = this.man ? (this.man.eyes.L.open_c[1] + this.man.eyes.R.open_c[1]) / 2 : 134;
    const eyeX = rect.left + (view.ox + ex * view.scale) / dpr;
    const eyeY = rect.top + (view.oy + ey * view.scale) / dpr;
    this.gazeTarget = pointerToGaze(x, y, {
      eyeX, eyeY,
      sensX: Math.max(160, window.innerWidth * 0.36),
      sensY: Math.max(120, window.innerHeight * 0.4),
    });
    this.lastPointer = this.t;
  }

  /** Webcam face-follow source (MediaPipe, on-device): normalized -1..1. */
  setExternalGaze(x: number, y: number): void {
    this.external = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
    this.lastExternal = this.t;
  }

  setFaceFollow(on: boolean): void {
    this.faceFollow = on;
    if (!on) this.lastExternal = -10;
  }

  /** Mouth v0.4: speech driver (text → understated vowel timeline). */
  setSpeech(text: string): void {
    this.jaw.setSpeech(text, this.t);
  }

  /** Mouth v0.4: direct control (opening 0..1 + articulation shape). */
  setMouthTarget(open: number, shape: MouthShape): void {
    this.jaw.setTarget(open, shape);
  }

  setFaceParams(p: FaceParams): void {
    if (p.browRaise !== undefined) this.browTarget = Math.max(-1, Math.min(1, p.browRaise));
    if (p.gazeBias) this.gazeBias = p.gazeBias;
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
  }

  private resize = (): void => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
  };

  private loop = (now: number): void => {
    if (this.disposed) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    this.step(dt);
    if (this.perf.on) {
      const t0 = performance.now();
      this.draw();
      const p = this.perf;
      p.drawMs += performance.now() - t0;
      p.frames++;
      if (p.since === 0) p.since = now;
      if (now - p.since >= 2000) {
        // draw = CPU time issuing canvas commands; fps = real presentation rate
        console.info(`[perf] draw ${(p.drawMs / p.frames).toFixed(2)} ms/frame (CPU), ${(p.frames * 1000 / (now - p.since)).toFixed(1)} fps, canvas ${this.canvas.width}x${this.canvas.height}`);
        p.drawMs = 0; p.frames = 0; p.since = now;
      }
    } else {
      this.draw();
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  private step(dt: number): void {
    // gaze source priority: webcam face > cursor (fresh) > idle wander; + bias
    const faceActive = this.faceFollow && this.t - this.lastExternal < 0.6;
    const cursorActive = !faceActive && this.t - this.lastPointer < 3;
    const src = faceActive ? this.external : cursorActive ? this.gazeTarget : idleGaze(this.t);
    const tx = src.x + this.gazeBias.x;
    const ty = src.y + this.gazeBias.y;
    this.gaze.x = smoothDamp(this.gaze.x, tx, 10, dt); // eyes: fast, own smoothing
    this.gaze.y = smoothDamp(this.gaze.y, ty, 10, dt);

    // head: same direction reference, smaller limits, slower smoothing (never a copy)
    const ht = headTarget(this.gaze, this.man.limits);
    // while speaking: tiny rhythmic nod so the talk reads even at full-body scale
    const nod = this.jaw.speechActive(this.t) ? 0.5 * Math.sin(this.t * 7) : 0;
    this.head.rot = smoothDamp(this.head.rot, ht.rot, 5, dt);
    this.head.dx = smoothDamp(this.head.dx, ht.dx, 5, dt);
    this.head.dy = smoothDamp(this.head.dy, ht.dy + nod, 5, dt);

    this.brow = smoothDamp(this.brow, this.browTarget, 8, dt);

    // mouth: jaw controller (opening smoothing + shape blend + speech timeline)
    this.jaw.step(dt, this.t);
    this.smile = smoothDamp(this.smile, this.smileTarget, 6, dt);

    // hair secondary motion: lag = smoothed(head driver) - head driver, clamped
    const hlim = this.man.hair.limits;
    const drvX = this.head.dx + this.head.rot * 0.8;
    const drvY = this.head.dy;
    const sway = (ph: number, amp: number): number => amp * Math.sin(this.t * 1.3 + ph);
    // amplitudes kept sub-pixel-ish at the silhouette: the overlay technique
    // (base keeps the hair, sprite rides on top) would echo at large offsets
    const lag = (m: SecondaryMotion, drv: number, lam: number, lim: number): number =>
      clamp(m.step(drv, lam, dt), -lim, lim);
    const hair = {
      puff: {
        x: lag(this.puffX, drvX, 4, hlim.dx) * this.man.hair.lag.puff + sway(0.5, 0.2),
        y: lag(this.puffY, drvY, 4, hlim.dy) * this.man.hair.lag.puff,
      },
      tL: {
        x: lag(this.tLX, drvX, 3, hlim.dx) * this.man.hair.lag.tendril + sway(0, 0.35),
        y: lag(this.tLY, drvY, 3, hlim.dy) * this.man.hair.lag.tendril,
      },
      tR: {
        x: lag(this.tRX, drvX, 3, hlim.dx) * this.man.hair.lag.tendril + sway(2.1, 0.35),
        y: lag(this.tRY, drvY, 3, hlim.dy) * this.man.hair.lag.tendril,
      },
    };
    this.hairNow = hair;

    // v0.6: subtle continuous upper-body lean (the skinned sheet deforms it;
    // sprite-seam v0.5 rig ignores torsoRot entirely)
    this.torsoNow = 0.9 * Math.sin(this.t * 0.45);
    this.armsNow = this.armTest ? this.armTestPose(this.t) : {
      // idle life: slow, small, out of phase L/R (arms hang naturally; v06 only)
      L: { shrug: 0.4 * Math.sin(this.t * 0.45 + 0.3), shoulder: 1.2 + 0.8 * Math.sin(this.t * 0.5),
        elbow: 3 + 2 * Math.sin(this.t * 0.6 + 1.1), wrist: 2 * Math.sin(this.t * 0.8 + 0.4) },
      R: { shrug: 0.4 * Math.sin(this.t * 0.45 + 1.9), shoulder: 1.2 + 0.8 * Math.sin(this.t * 0.5 + 2.2),
        elbow: 3 + 2 * Math.sin(this.t * 0.6 + 2.9), wrist: 2 * Math.sin(this.t * 0.8 + 2.0) },
    };

    // blink scheduler (ANIMATION_SPEC #2 intervals)
    if (this.blinkStart < 0 && this.t > this.nextBlink) this.blinkStart = this.t;
    if (this.blinkStart >= 0) {
      this.blink = blinkValue(this.t - this.blinkStart);
      if (this.t - this.blinkStart > 0.25) {
        this.blinkStart = -1;
        this.blink = 0;
        this.nextBlink = this.t + 2.8 + Math.random() * 2.4;
      }
    }
    this.breath += dt;
  }

  private draw(): void {
    const { ctx, canvas } = this;
    const view = computeView(canvas.width, canvas.height, FIG_BOX);
    if (this.pose !== "neutral") {
      const img = this.sprites.get(this.pose);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (img) {
        const k = Math.min(canvas.width / img.width, canvas.height / img.height) * 0.94;
        ctx.drawImage(img, (canvas.width - img.width * k) / 2, (canvas.height - img.height * k) / 2, img.width * k, img.height * k);
      }
      return;
    }
    renderPuppetFrame(ctx, this.assets, this.man, {
      gaze: this.gaze,
      blink: this.blink,
      browRaise: this.brow,
      headRot: this.head.rot,
      headDx: this.head.dx,
      headDy: this.head.dy,
      breathPhase: this.breath,
      mouth: this.jaw.geom(this.man.mouth, this.smile * 0.6),
      wink: blinkValue(this.t - this.winkStart, 0.45),
      smile: this.smile,
      hair: this.hairNow,
      torsoRot: this.torsoNow,
      arms: this.armsNow,
    }, view, { w: canvas.width, h: canvas.height });
  }

  /**
   * ?rig=v06&armtest=1 — articulation showcase cycling 6 segments of 4 s:
   * shoulders, elbows, wrists, shrug, IK hand-to-hip circle, combined.
   */
  private armTestPose(t: number): { L: ArmPose; R: ArmPose } {
    const seg = Math.floor(t / 4) % 6;
    const w = Math.sin(((t % 4) / 4) * Math.PI * 2);   // -1..1..-1 per segment
    const up = 0.5 - 0.5 * Math.cos(((t % 4) / 4) * Math.PI * 2); // 0..1..0
    const r = { ...ARM_REST };
    switch (seg) {
      case 0: return { L: { ...r, shoulder: 14 * up }, R: { ...r, shoulder: 14 * up } };
      case 1: return { L: { ...r, elbow: 40 * up }, R: { ...r, elbow: 40 * up } };
      case 2: return { L: { ...r, wrist: 25 * w }, R: { ...r, wrist: -25 * w } };
      case 3: return { L: { ...r, shrug: 5 * up }, R: { ...r, shrug: 5 * up } };
      case 4: {
        const a = (t % 4) / 4 * Math.PI * 2;
        const rig = this.man.rigv06!;
        const L = solveArmIK(rig, "L", [530 + 14 * Math.cos(a), 420 + 14 * Math.sin(a)]).pose;
        const R = solveArmIK(rig, "R", [730 - 14 * Math.cos(a), 420 + 14 * Math.sin(a)]).pose;
        return { L, R };
      }
      default: return {
        L: { shrug: 3 * up, shoulder: 10 * up, elbow: 30 * up, wrist: 15 * w },
        R: { shrug: 2 * up, shoulder: 6 * up, elbow: 45 * up, wrist: -15 * w },
      };
    }
  }
}
