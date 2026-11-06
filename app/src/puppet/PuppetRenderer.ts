import { CompanionRenderer, PoseName, SPRITE_URL } from "../companion/types";
import { RigManifest, RigAssets, computeView, renderPuppetFrame } from "./puppetRender";
import { headTarget, smoothDamp, idleGaze, blinkValue } from "./puppetMath";

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
  private lastPointer = -10;
  private t = 0;
  private last = 0;
  private raf = 0;
  private disposed = false;

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
      load("/rig/body_base.png"), load("/rig/neck_patch.png"), load("/rig/head_base.png"),
      load("/rig/iris_L.png"), load("/rig/iris_R.png"), load("/rig/lid_L.png"),
      load("/rig/lid_R.png"), load("/rig/brow_L.png"), load("/rig/brow_R.png"),
    ]);
    this.assets = {
      body, bodyW: body.width, bodyH: body.height, neck, headBase,
      iris: { L: irisL, R: irisR }, lid: { L: lidL, R: lidR }, brow: { L: browL, R: browR },
      sizes: {
        headBase: [headBase.width, headBase.height],
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

  setGaze(x: number, y: number): void {
    this.gazeTarget = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
    this.lastPointer = this.t;
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
    this.draw();
    this.raf = requestAnimationFrame(this.loop);
  };

  private step(dt: number): void {
    // gaze: cursor while active, idle wander otherwise, plus expression bias
    const cursorActive = this.t - this.lastPointer < 3;
    const idle = idleGaze(this.t);
    const tx = (cursorActive ? this.gazeTarget.x : idle.x) + this.gazeBias.x;
    const ty = (cursorActive ? this.gazeTarget.y : idle.y) + this.gazeBias.y;
    this.gaze.x = smoothDamp(this.gaze.x, tx, 10, dt); // eyes: fast, own smoothing
    this.gaze.y = smoothDamp(this.gaze.y, ty, 10, dt);

    // head: same direction reference, smaller limits, slower smoothing (never a copy)
    const ht = headTarget(this.gaze, this.man.limits);
    this.head.rot = smoothDamp(this.head.rot, ht.rot, 5, dt);
    this.head.dx = smoothDamp(this.head.dx, ht.dx, 5, dt);
    this.head.dy = smoothDamp(this.head.dy, ht.dy, 5, dt);

    this.brow = smoothDamp(this.brow, this.browTarget, 8, dt);

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
    }, view, { w: canvas.width, h: canvas.height });
  }
}
