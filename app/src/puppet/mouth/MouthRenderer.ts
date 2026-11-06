/**
 * Mouth Puppet v0.4 — canvas renderer (pure draw calls, no state).
 * Anime semi-realistic middle ground: vector cavity with gradient depth,
 * gradual teeth band, tongue only in adequate openings, original-art lower
 * lip carried by the jaw patch. Everything interior is clipped to the cavity
 * path, so teeth/tongue can never cross the lips (quality criteria 3 & 4).
 */
import type { Ctx2D } from "../puppetRender";
import type { MouthAnchors, MouthGeom } from "./mouthMath";
import type { MouthAssets } from "./mouthLayers";

const CAVE_TOP = "#4a1a1e";
const CAVE_BOT = "#200a0c";
const TEETH = "#f3ede5";
const TONGUE = "#bf5b64";
const TONGUE_DK = "#8e3a44";
const LIP_LINE = "#5f2f2b";

export interface MouthView {
  S: (x: number) => number; // pose→device px x
  T: (y: number) => number; // pose→device px y
  k: number;                // scale
}

function cavityPath(ctx: Ctx2D, v: MouthView, a: MouthAnchors, g: MouthGeom): void {
  const hw = (g.cavityW / 2) * v.k;
  const top = v.T(g.cavityTop);
  const bot = v.T(g.cavityBot);
  const cx = v.S(a.cx);
  const mid = (top + bot) / 2;
  ctx.beginPath();
  if (g.round > 0.8) {
    ctx.ellipse(cx, mid, hw, Math.max(0.6, (bot - top) / 2), 0, 0, Math.PI * 2);
    return;
  }
  // superellipse-ish anime mouth: soft cupid-bow top, rounded bottom corners
  const bow = (top - mid) * 0.25 * (1 - g.round);
  ctx.moveTo(cx - hw, mid);
  ctx.quadraticCurveTo(cx - hw * 0.45, top + bow, cx, top + (1 - g.round) * (mid - top) * 0.35);
  ctx.quadraticCurveTo(cx + hw * 0.45, top + bow, cx + hw, mid);
  ctx.quadraticCurveTo(cx + hw * 0.55, bot, cx, bot);
  ctx.quadraticCurveTo(cx - hw * 0.55, bot, cx - hw, mid);
  ctx.closePath();
}

export function drawMouth(
  ctx: Ctx2D,
  v: MouthView,
  a: MouthAnchors,
  g: MouthGeom,
  assets: MouthAssets,
): void {
  const { S, T, k } = v;

  // 2. jaw patch (original lower lip + chin skin) rides the jaw drop
  ctx.drawImage(assets.jaw, S(a.jaw_box[0]), T(a.jaw_box[1] + g.jawDy),
    (a.jaw_box[2] - a.jaw_box[0]) * k, (a.jaw_box[3] - a.jaw_box[1]) * k);

  // 3. original closed lips crossfade (rest = pixel-perfect canon face)
  if (g.closedA > 0.003) {
    ctx.save();
    ctx.globalAlpha = g.closedA;
    ctx.drawImage(assets.closed, S(a.closed_box[0]), T(a.closed_box[1]),
      (a.closed_box[2] - a.closed_box[0]) * k, (a.closed_box[3] - a.closed_box[1]) * k);
    ctx.restore();
  }

  // 4. open mouth assembly, faded in and clipped to the cavity
  if (g.openA > 0.003) {
    ctx.save();
    ctx.globalAlpha = g.openA;
    cavityPath(ctx, v, a, g);
    ctx.save();
    ctx.clip();
    const top = T(g.cavityTop);
    const bot = T(g.cavityBot);
    const grad = ctx.createLinearGradient(0, top, 0, bot);
    grad.addColorStop(0, CAVE_TOP);
    grad.addColorStop(1, CAVE_BOT);
    ctx.fillStyle = grad;
    ctx.fillRect(S(a.cx - a.base_w), top, a.base_w * 2 * k, bot - top);

    // teeth: gradual band hanging from the upper lip, arched bottom
    if (g.teethA > 0.01 && g.teethH > 0.4) {
      const hw = (g.cavityW / 2) * 0.86 * k;
      const th = g.teethH * k;
      ctx.save();
      ctx.globalAlpha = g.openA * g.teethA;
      ctx.fillStyle = TEETH;
      ctx.beginPath();
      ctx.moveTo(S(a.cx) - hw, top - 1);
      ctx.lineTo(S(a.cx) + hw, top - 1);
      ctx.quadraticCurveTo(S(a.cx) + hw * 0.8, top + th, S(a.cx), top + th);
      ctx.quadraticCurveTo(S(a.cx) - hw * 0.8, top + th, S(a.cx) - hw, top - 1);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // tongue: low in the cavity, only when the opening is adequate
    if (g.tongueA > 0.01) {
      const ch = bot - top;
      ctx.save();
      ctx.globalAlpha = g.openA * g.tongueA;
      const tg = ctx.createLinearGradient(0, bot - ch * 0.55, 0, bot);
      tg.addColorStop(0, TONGUE);
      tg.addColorStop(1, TONGUE_DK);
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.ellipse(S(a.cx), bot - ch * 0.18, g.cavityW * 0.32 * k, ch * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore(); // unclip

    // 5. upper-lip seam stroke (anime line, traces the cavity ceiling)
    ctx.save();
    ctx.globalAlpha = g.openA * 0.85;
    ctx.strokeStyle = LIP_LINE;
    ctx.lineWidth = Math.max(1, 1.4 * k);
    ctx.lineCap = "round";
    const hw = (g.cavityW / 2) * k;
    const cx = S(a.cx);
    const midY = (top + bot) / 2;
    ctx.beginPath();
    if (g.round > 0.8) {
      ctx.ellipse(cx, midY, hw, Math.max(0.6, (bot - top) / 2), 0, Math.PI, Math.PI * 2);
    } else {
      const bow = (top - midY) * 0.25 * (1 - g.round);
      ctx.moveTo(cx - hw, midY);
      ctx.quadraticCurveTo(cx - hw * 0.45, top + bow, cx, top + (midY - top) * 0.35 * (1 - g.round));
      ctx.quadraticCurveTo(cx + hw * 0.45, top + bow, cx + hw, midY);
    }
    ctx.stroke();
    ctx.restore();

    ctx.restore(); // alpha
  }
}
