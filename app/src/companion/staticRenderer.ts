import { CompanionRenderer, PoseName, SPRITE_URL } from "./types";

/**
 * PLACEHOLDER renderer — honest by design.
 * Draws the flat, transparent full-body sprites with transform-only idle motion
 * (breathing scale, micro sway, cursor lean). This is NOT a Live2D rig: no mesh,
 * no parameters, no mouth/eye movement. It exists so the event pipeline, state
 * machine and UI can run today and be swapped 1:1 when model.moc3 exists.
 */
export class StaticSpriteRenderer implements CompanionRenderer {
  readonly kind = "static" as const;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sprites = new Map<PoseName, HTMLImageElement>();
  private pose: PoseName = "neutral";
  private gaze = { x: 0, y: 0 };
  private smooth = { x: 0, y: 0 };
  private raf = 0;
  private t0 = performance.now();
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    this.ctx = ctx;
  }

  async init(): Promise<void> {
    await Promise.all(
      (Object.keys(SPRITE_URL) as PoseName[]).map(
        (p) =>
          new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              this.sprites.set(p, img);
              resolve();
            };
            img.onerror = () => reject(new Error(`sprite load failed: ${p}`));
            img.src = SPRITE_URL[p];
          }),
      ),
    );
    this.resize();
    window.addEventListener("resize", this.resize);
    this.loop();
  }

  setPose(pose: PoseName): void {
    this.pose = pose;
  }

  setGaze(x: number, y: number): void {
    // placeholder lean keeps the old window-centred normalization (it has no face)
    this.gaze = {
      x: Math.max(-1, Math.min(1, (x / window.innerWidth) * 2 - 1)),
      y: Math.max(-1, Math.min(1, (y / window.innerHeight) * 2 - 1)),
    };
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
  }

  private resize = (): void => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
  };

  private loop = (): void => {
    if (this.disposed) return;
    this.draw((performance.now() - this.t0) / 1000);
    this.raf = requestAnimationFrame(this.loop);
  };

  private draw(t: number): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const img = this.sprites.get(this.pose);
    if (!img) return;

    // critically-damped gaze follow (placeholder lean, see ANIMATION_SPEC #4 ranges/10)
    this.smooth.x += (this.gaze.x - this.smooth.x) * 0.08;
    this.smooth.y += (this.gaze.y - this.smooth.y) * 0.08;

    const breathe = 1 + 0.012 * Math.sin((t * 2 * Math.PI) / 3.2); // spec #1
    const sway = (0.6 * Math.PI / 180) * Math.sin((t * 2 * Math.PI) / 4.5); // spec #5
    const leanX = this.smooth.x * 6 * (canvas.width / 800);
    const leanY = this.smooth.y * 3 * (canvas.height / 560);
    const leanRot = this.smooth.x * (1.2 * Math.PI / 180);

    const targetH = canvas.height * 0.94;
    const scale = (targetH / img.height) * breathe;
    const w = img.width * scale;
    const h = img.height * scale;
    const cx = canvas.width / 2 + leanX;
    const cy = canvas.height / 2 + leanY;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(sway + leanRot);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}
