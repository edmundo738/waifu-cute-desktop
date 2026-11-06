import { CompanionRenderer } from "./types";

export const MODEL_URL = "/models/companion/model.model3.json";

/** True only when a rigged Cubism model has been dropped into app/public/models/companion/.
 *  Content-type is checked because Vite's SPA fallback answers unknown paths with
 *  index.html (200, text/html) in dev — a naive status check would false-positive. */
export async function detectModel(): Promise<boolean> {
  try {
    const r = await fetch(MODEL_URL, { method: "HEAD" });
    if (!r.ok) return false;
    return (r.headers.get("content-type") ?? "").includes("json");
  } catch {
    return false;
  }
}

/**
 * Live2D path. Deliberately lazy: pixi-live2d-display (MIT) and PixiJS are NOT
 * installed in this skeleton, and Live2D Cubism Core (proprietary) must be added
 * by the developer under the Live2D license terms (see live2d/LICENSE_REVIEW.md).
 * Until a real model exists this always resolves to null -> static fallback.
 */
export async function tryCreateLive2DRenderer(
  canvas: HTMLCanvasElement,
): Promise<CompanionRenderer | null> {
  if (!(await detectModel())) return null;
  try {
    const spec = "pixi-live2d-display";
    const mod = (await import(/* @vite-ignore */ spec)) as {
      Live2DModel: { from: (url: string) => Promise<unknown> };
    };
    const pixiSpec = "pixi.js";
    const PIXI = (await import(/* @vite-ignore */ pixiSpec)) as {
      Application: new (o: unknown) => { stage: { addChild: (c: unknown) => void } };
    };
    const app = new PIXI.Application({ view: canvas, backgroundAlpha: 0, antialias: true });
    const model = (await mod.Live2DModel.from(MODEL_URL)) as {
      focus: (x: number, y: number) => void;
      destroy?: () => void;
    };
    app.stage.addChild(model);
    // Minimal adapter; the full parameter mapping lives in live2d/LIVE2D_PREPARATION.md
    return {
      kind: "live2d",
      setPose: () => undefined, // poses become motions once .motion3.json exist
      setGaze: (x, y) => model.focus(x, y),
      dispose: () => model.destroy?.(),
    };
  } catch (err) {
    console.warn("[companion] Live2D renderer unavailable, using static fallback:", err);
    return null;
  }
}
