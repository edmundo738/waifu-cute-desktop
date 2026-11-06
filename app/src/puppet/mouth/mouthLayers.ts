/**
 * Mouth Puppet v0.4 — layer organisation & asset loading.
 *
 * Draw order inside the head group (back → front), mirroring the eye rig:
 *   1. head_base_nm      face base with the mouth surgically removed
 *                        (original skin preserved everywhere else)
 *   2. mouth_jaw         lower-lip + chin-skin patch cut from the ORIGINAL art,
 *                        feathered alpha (no rectangle), translated by jawDy;
 *                        stops above the chin contour so no ghost line appears
 *   3. mouth_closed      original lips sprite (feathered) at alpha=closedA —
 *                        at rest the face is PIXEL-IDENTICAL to the canon art
 *   4. oral cavity       procedural vector shape (clip mask for everything
 *                        inside): dark interior gradient → teeth band →
 *                        tongue; teeth/tongue can never escape the cavity
 *   5. upper-lip stroke  soft anime seam line above the cavity while open
 *
 * Masks: cavity path = clip for interior; feathered alpha baked into the two
 * sprite cuts = seamless blend into surrounding skin.
 */
import type { MouthAnchors } from "./mouthMath";

export interface MouthAssets {
  closed: CanvasImageSource; closedW: number; closedH: number;
  jaw: CanvasImageSource; jawW: number; jawH: number;
}

export const MOUTH_URLS = {
  closed: "/rig/mouth_closed.png",
  jaw: "/rig/mouth_jaw.png",
};

export async function loadMouthAssets(load: (u: string) => Promise<HTMLImageElement>): Promise<MouthAssets> {
  const [closed, jaw] = await Promise.all([load(MOUTH_URLS.closed), load(MOUTH_URLS.jaw)]);
  return {
    closed, closedW: closed.width, closedH: closed.height,
    jaw, jawW: jaw.width, jawH: jaw.height,
  };
}

export interface MouthManifest {
  mouth: MouthAnchors;
}
