/**
 * Shared Canvas2D renderer for the component puppet. Runs unchanged in the
 * browser and in node (@napi-rs/canvas) — the self-test renders evidence frames
 * with exactly this code.
 *
 * Draw order (back → front), head group transformed as one unit:
 *   body_base → neck_patch → [ head_base (empty openings, no brows)
 *     → iris L/R (clipped to opening ellipse, translated by clamped gaze)
 *     → lid L/R  (clipped to opening, stretched downward by blink)
 *     → brow L/R (independent translation) ]
 */
import { Vec2, gazeOffset, headTarget, lidBottomY, browOffset, clamp, RigLimits } from "./puppetMath";
import type { MouthAnchors, MouthGeom } from "./mouth/mouthMath";
import type { MouthAssets } from "./mouth/mouthLayers";
import { drawMouth } from "./mouth/MouthRenderer";
import { buildSkinMesh, drawSkinnedSheet, rotMat, mulMat, ID_MAT, Mat, SkinMesh } from "./mesh/meshRender";

/**
 * Structural 2D context: satisfied by both the browser CanvasRenderingContext2D and
 * @napi-rs/canvas' SKRSContext2D (their own types are not mutually assignable), so the
 * exact same renderer code runs in the app and in the headless self-test.
 */
export interface Ctx2D {
  canvas: { width: number; height: number };
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineCap: string;
  globalAlpha: number;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): { addColorStop(o: number, c: string): void };
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(rad: number): void;
  scale(x: number, y: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  closePath(): void;
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, sa: number, ea: number, ccw?: boolean): void;
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clip(): void;
  stroke(): void;
  fill(): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  drawImage(img: any, ...args: number[]): void;
}

export interface EyeRig {
  open_c: [number, number];
  open_r: [number, number];
  iris_box: [number, number, number, number];
  lid_box: [number, number, number, number];
  brow_box: [number, number, number, number];
}

export interface HairRig {
  puff_box: [number, number, number, number];
  tendril_L: [number, number, number, number];
  tendril_R: [number, number, number, number];
  limits: { dx: number; dy: number };
  lag: { puff: number; tendril: number };
}

export interface RigV06 {
  sheet_box: [number, number, number, number];
  waist_y: number;
  step: number;
  bones: { root: [number, number]; torso: [number, number]; neck: [number, number]; head: [number, number] };
  neck_comp: number;
}

export interface RigManifest {
  head_box: [number, number, number, number];
  neck_box: [number, number, number, number];
  neck_pivot: [number, number];
  eyes: { L: EyeRig; R: EyeRig };
  limits: RigLimits;
  mouth: MouthAnchors;
  hair: HairRig;
  rigv06?: RigV06;
}

export interface RigAssets {
  body: CanvasImageSource; bodyW: number; bodyH: number;
  neck: CanvasImageSource;
  headBase: CanvasImageSource; // mouthless face base (v0.4+)
  /** v0.6 stage 1: continuous head+neck+upper-torso sheet + lower body sprite */
  sheet?: CanvasImageSource; sheetW?: number; sheetH?: number;
  lower?: CanvasImageSource; lowerW?: number; lowerH?: number;
  mesh?: SkinMesh;
  iris: { L: CanvasImageSource; R: CanvasImageSource };
  lid: { L: CanvasImageSource; R: CanvasImageSource };
  brow: { L: CanvasImageSource; R: CanvasImageSource };
  mouth: MouthAssets | null;
  hair: { puff: CanvasImageSource; tL: CanvasImageSource; tR: CanvasImageSource } | null;
  sizes: Record<string, [number, number]>;
}

export interface PuppetParams {
  gaze: Vec2;          // smoothed, -1..1
  blink: number;       // 0..1 (partial allowed)
  browRaise: number;   // -1..1
  headRot: number;     // deg
  headDx: number; headDy: number;
  breathPhase: number; // seconds
  mouth: MouthGeom | null; // computed mouth geometry (null = no mouth rig)
  wink: number;          // 0..1 right-eye wink (per-eye lid control)
  smile: number;         // -1..1 expression: corner lift + lid squint
  hair: { puff: Vec2; tL: Vec2; tR: Vec2 } | null; // secondary-motion offsets
  torsoRot?: number;     // v0.6: upper-body lean in deg about the waist pivot
}

export interface View { scale: number; ox: number; oy: number }

export function computeView(canvasW: number, canvasH: number, figBox: [number, number, number, number]): View {
  const fw = figBox[2] - figBox[0], fh = figBox[3] - figBox[1];
  const scale = Math.min(canvasW / fw, canvasH / fh) * 0.96;
  return {
    scale,
    ox: canvasW / 2 - (figBox[0] + fw / 2) * scale,
    oy: canvasH / 2 - (figBox[1] + fh / 2) * scale,
  };
}

const deg = Math.PI / 180;

export function renderPuppetFrame(
  ctx: Ctx2D,
  assets: RigAssets,
  man: RigManifest,
  p: PuppetParams,
  view: View,
  clear: { w: number; h: number; backdrop?: string },
): void {
  const { scale: k, ox, oy } = view;
  const S = (x: number) => ox + x * k;
  const T = (y: number) => oy + y * k;
  ctx.clearRect(0, 0, clear.w, clear.h);
  if (clear.backdrop) {
    ctx.fillStyle = clear.backdrop;
    ctx.fillRect(0, 0, clear.w, clear.h);
  }

  // breathing: whole-figure micro scale anchored at the feet
  const breathe = 1 + 0.008 * Math.sin((p.breathPhase * 2 * Math.PI) / 3.2);
  const breathDy = 0.8 * Math.sin((p.breathPhase * 2 * Math.PI) / 3.2);
  const v06 = !!(assets.sheet && assets.lower && man.rigv06);
  const tRot = p.torsoRot ?? 0;
  const comp = man.rigv06?.neck_comp ?? 0.35;
  ctx.save();
  ctx.translate(S(630), T(842));
  ctx.scale(breathe, breathe);
  ctx.translate(-S(630), -T(842));
  if (v06 && man.rigv06) {
    // continuous anatomical sheet, skinned by the bone chain (no sprite seams)
    ctx.drawImage(assets.lower!, S(0), T(0), assets.lowerW! * k, assets.lowerH! * k);
    const bn = man.rigv06.bones;
    const mT = rotMat(bn.torso[0], bn.torso[1], tRot);
    const mN = mulMat(mT, rotMat(bn.neck[0], bn.neck[1], comp * p.headRot));
    const mH = mulMat(mN, mulMat(rotMat(bn.head[0], bn.head[1], (1 - comp) * p.headRot),
      [1, 0, 0, 1, p.headDx, p.headDy + breathDy]));
    const mats: Mat[] = [ID_MAT, mT, mN, mH];
    if (!assets.mesh) assets.mesh = buildSkinMesh(assets.sheetW!, assets.sheetH!, man.rigv06.step);
    drawSkinnedSheet(ctx, { img: assets.sheet, w: assets.sheetW!, h: assets.sheetH! },
      assets.mesh, mats, view, [man.rigv06.sheet_box[0], man.rigv06.sheet_box[1]]);
  } else {
    ctx.drawImage(assets.body, S(0), T(0), assets.bodyW * k, assets.bodyH * k);
    ctx.drawImage(assets.neck, S(man.neck_box[0]), T(man.neck_box[1]),
      (man.neck_box[2] - man.neck_box[0]) * k, (man.neck_box[3] - man.neck_box[1]) * k);
  }
  ctx.restore();

  // ---- head group ----
  const [px, py] = man.neck_pivot;
  ctx.save();
  if (v06 && man.rigv06) {
    // overlay transform = Head bone global matrix (matches the skinned mesh head)
    const bn = man.rigv06.bones;
    ctx.translate(S(bn.torso[0]), T(bn.torso[1])); ctx.rotate(tRot * deg); ctx.translate(-S(bn.torso[0]), -T(bn.torso[1]));
    ctx.translate(S(bn.neck[0]), T(bn.neck[1])); ctx.rotate(comp * p.headRot * deg); ctx.translate(-S(bn.neck[0]), -T(bn.neck[1]));
    ctx.translate(S(bn.head[0]), T(bn.head[1])); ctx.rotate((1 - comp) * p.headRot * deg); ctx.translate(-S(bn.head[0]), -T(bn.head[1]));
    ctx.translate(p.headDx * k, (p.headDy + breathDy) * k);
  } else {
    ctx.translate(S(px) + p.headDx * k, T(py) + (p.headDy + breathDy) * k);
    ctx.rotate(p.headRot * deg);
    ctx.translate(-S(px), -T(py));
  }

  if (!v06) {
    const [hx0, hy0] = man.head_box;
    const [hw, hh] = assets.sizes.headBase;
    ctx.drawImage(assets.headBase, S(hx0), T(hy0), hw * k, hh * k);
  }

  // hair puff overlay (secondary motion; overlap+feather hides the double-draw)
  if (p.hair && assets.hair) {
    const hb = man.hair.puff_box;
    ctx.drawImage(assets.hair.puff, S(hb[0] + p.hair.puff.x), T(hb[1] + p.hair.puff.y),
      (hb[2] - hb[0]) * k, (hb[3] - hb[1]) * k);
  }

  const off = gazeOffset(p.gaze, man.limits);
  (["L", "R"] as const).forEach((side) => {
    const e = man.eyes[side];
    const [cx, cy] = e.open_c;
    const [rx, ry] = e.open_r;

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(S(cx), T(cy), rx * k, ry * k, 0, 0, Math.PI * 2);
    ctx.clip();

    // eyeball/iris assembly behind the lids, clamped translation
    const [iw, ih] = assets.sizes["iris_" + side];
    ctx.drawImage(assets.iris[side],
      S(cx + off.x - iw / 2), T(cy + off.y - ih / 2), iw * k, ih * k);

    // upper lid: stretched skin+lash band sliding down inside the opening
    // (per-eye: global blink, right-eye wink, smile squint)
    const squint = clamp(p.smile, 0, 1) * 0.18;
    const b = Math.max(p.blink, side === "R" ? p.wink : 0, squint);
    if (b > 0.001) {
      const [lx0, ly0, lx1, ly1] = e.lid_box;
      const bottom = lidBottomY(b, { y0: ly0, y1: ly1 }, cy, ry);
      const [lw, lh] = assets.sizes["lid_" + side];
      // descending lid = flat skin fill (sampled per side) + the lash-line sprite
      // at NATURAL size riding the moving edge (never stretched -> no blob)
      ctx.fillStyle = side === "L" ? "#51281c" : "#582d1f";
      ctx.fillRect(S(lx0 - 1), T(cy - ry), (lx1 - lx0 + 2) * k, (bottom - (cy - ry)) * k);
      ctx.drawImage(assets.lid[side], S(lx0), T(bottom - lh), lw * k, lh * k);
    }
    ctx.restore();

    // independent brow component
    const [bw, bh] = assets.sizes["brow_" + side];
    const [bx0, by0] = e.brow_box;
    const broy = browOffset(p.browRaise, man.limits).y;
    ctx.drawImage(assets.brow[side], S(bx0), T(by0 + broy), bw * k, bh * k);
  });

  // mouth component (v0.4): jaw patch → closed-lips crossfade → clipped cavity
  if (p.mouth && assets.mouth) {
    drawMouth(ctx, { S, T, k }, man.mouth, p.mouth, assets.mouth);
  }

  // side tendrils in front of the face edge (secondary motion, feathered)
  if (p.hair && assets.hair) {
    (["L", "R"] as const).forEach((side) => {
      const box = side === "L" ? man.hair.tendril_L : man.hair.tendril_R;
      const off = side === "L" ? p.hair!.tL : p.hair!.tR;
      ctx.drawImage(side === "L" ? assets.hair!.tL : assets.hair!.tR,
        S(box[0] + off.x), T(box[1] + off.y), (box[2] - box[0]) * k, (box[3] - box[1]) * k);
    });
  }

  ctx.restore();
}

export { headTarget };
