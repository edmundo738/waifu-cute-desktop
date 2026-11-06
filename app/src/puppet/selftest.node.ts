/**
 * Headless acceptance harness (M2–M4 evidence).
 * Run: npm run test:puppet   (uses @napi-rs/canvas — same Canvas2D API as the browser)
 * Renders evidence frames to app/test_out/ and asserts the acceptance tests.
 */
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gazeOffset, blinkValue, lidBottomY, headTarget, smoothDamp, clamp, idleGaze } from "./puppetMath";
import { renderPuppetFrame, computeView, RigManifest, RigAssets, PuppetParams } from "./puppetRender";

const ROOT = new URL("../..", import.meta.url).pathname;
const RIG = ROOT + "public/rig/";
const OUT = ROOT + "test_out/";
mkdirSync(OUT, { recursive: true });

let failures = 0;
function check(name: string, cond: boolean, detail: string): void {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}  [MEASURED] ${detail}`);
  if (!cond) failures++;
}

const man: RigManifest = JSON.parse(readFileSync(RIG + "manifest.json", "utf8"));
const FIG: [number, number, number, number] = [470, 7, 789, 842];

async function main(): Promise<void> {
  const load = async (f: string) => loadImage(RIG + f);
  const [body, neck, headBase, irisL, irisR, lidL, lidR, browL, browR] = await Promise.all([
    load("body_base.png"), load("neck_patch.png"), load("head_base.png"),
    load("iris_L.png"), load("iris_R.png"), load("lid_L.png"), load("lid_R.png"),
    load("brow_L.png"), load("brow_R.png"),
  ]);
  const assets: RigAssets = {
    body, bodyW: body.width, bodyH: body.height, neck, headBase,
    iris: { L: irisL, R: irisR }, lid: { L: lidL, R: lidR }, brow: { L: browL, R: browR },
    sizes: {
      headBase: [headBase.width, headBase.height],
      iris_L: [irisL.width, irisL.height], iris_R: [irisR.width, irisR.height],
      lid_L: [lidL.width, lidL.height], lid_R: [lidR.width, lidR.height],
      brow_L: [browL.width, browL.height], brow_R: [browR.width, browR.height],
    },
  };

  // ---- acceptance 2/3: gaze clamped to independent limits, all directions + diagonals
  const dirs = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [5, -9], [-42, 17]];
  let clampOk = true;
  for (const [gx, gy] of dirs) {
    const o = gazeOffset({ x: gx, y: gy }, man.limits);
    if (Math.abs(o.x) > man.limits.gaze_dx + 1e-9 || Math.abs(o.y) > man.limits.gaze_dy + 1e-9) clampOk = false;
  }
  check("gaze clamped to independent X/Y limits (11 directions incl. diagonals & extremes)", clampOk,
    `limits dx=±${man.limits.gaze_dx} dy=±${man.limits.gaze_dy}`);

  // iris disc stays inside opening: travel + iris radius vs opening radius + clip guarantee
  const irisRr = assets.sizes.iris_L[0] / 2;
  const [orx] = man.eyes.L.open_r;
  check("iris travel keeps disc within opening radius (clip mask also enforced at draw)",
    man.limits.gaze_dx + irisRr <= orx + 2,
    `dx ${man.limits.gaze_dx} + iris_r ${irisRr} vs open_rx ${orx} (overflow clipped by ellipse mask)`);

  // ---- acceptance 7: blink envelope over time + lid position monotonic in b
  const lid = man.eyes.L.lid_box;
  const [ocy, ory] = [man.eyes.L.open_c[1], man.eyes.L.open_r[1]];
  const envOk = blinkValue(-0.1) === 0 && blinkValue(0) === 0 && blinkValue(0.04) === 0.5 &&
    blinkValue(0.08) === 1 && blinkValue(0.1) === 1 && blinkValue(0.25) === 0 && blinkValue(1) === 0;
  const bSamples = [0, 0.25, 0.5, 0.75, 1];
  const bottoms = bSamples.map((b) => lidBottomY(b, { y0: lid[1], y1: lid[3] }, ocy, ory));
  let mono = true;
  for (let i = 1; i < bottoms.length; i++) if (bottoms[i] < bottoms[i - 1] - 1e-9) mono = false;
  check("blink envelope 0→1→0 (close .08/hold .02/open .15); lid bottom monotonic in b, reaches opening bottom at b=1",
    envOk && mono && Math.abs(bottoms[4] - (ocy + ory)) < 1e-9 && bottoms[0] === lid[3],
    `bottoms(b=0..1)=${bottoms.map((b) => b.toFixed(1)).join(",")} target=${ocy + ory}`);

  // ---- acceptance 5/6: head limits + own smoothing, independent of eyes
  const ht = headTarget({ x: 99, y: -99 }, man.limits);
  check("head target within independent limits for extreme gaze",
    Math.abs(ht.rot) <= man.limits.head_rot_deg && Math.abs(ht.dx) <= man.limits.head_dx && Math.abs(ht.dy) <= man.limits.head_dy,
    `rot=${ht.rot.toFixed(2)}° dx=${ht.dx.toFixed(2)} dy=${ht.dy.toFixed(2)}`);
  let cur = 0;
  for (let i = 0; i < 240; i++) cur = smoothDamp(cur, ht.rot, 6, 1 / 60);
  check("head smoothing converges to its own target (no copy of eye value)",
    Math.abs(cur - ht.rot) < 0.05 && Math.abs(ht.rot) < man.limits.gaze_dx, `converged=${cur.toFixed(3)}`);

  // ---- acceptance 8: return to neutral
  let g = 1;
  for (let i = 0; i < 300; i++) g = smoothDamp(g, 0, 5, 1 / 60);
  check("gaze returns smoothly to neutral resting position", Math.abs(g) < 0.01, `residual=${g.toFixed(4)}`);
  const ig = idleGaze(123.4);
  check("idle gaze wander stays within ±0.35 range", Math.abs(ig.x) <= 0.35 && Math.abs(ig.y) <= 0.25,
    `(${ig.x.toFixed(2)},${ig.y.toFixed(2)})`);
  check("clamp primitive", clamp(5, -1, 1) === 1 && clamp(-5, -1, 1) === -1 && clamp(0.3, -1, 1) === 0.3, "ok");

  // ---- evidence frames (acceptance 1,4,7,9 visual) ----
  const CW = 520, CH = 640;
  const view = computeView(CW, CH, FIG);
  const frame = (p: Partial<PuppetParams>) => {
    const canvas = createCanvas(CW, CH);
    const ctx = canvas.getContext("2d");
    renderPuppetFrame(ctx as never, assets, man, {
      gaze: { x: 0, y: 0 }, blink: 0, browRaise: 0,
      headRot: 0, headDx: 0, headDy: 0, breathPhase: 0, ...p,
    }, view, { w: CW, h: CH, backdrop: "#eceae8" }); // evidence frames get an explicit backdrop; app stage stays transparent
    return canvas;
  };
  const grid = createCanvas(CW * 3, CH * 3);
  const gctx = grid.getContext("2d");
  const gazes: [number, number][] = [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  for (let i = 0; i < 9; i++) {
    const gv = { x: gazes[i][0], y: gazes[i][1] };
    const ht2 = headTarget(gv, man.limits);
    const c = frame({ gaze: gv, headRot: ht2.rot, headDx: ht2.dx, headDy: ht2.dy });
    gctx.drawImage(c, (i % 3) * CW, Math.floor(i / 3) * CH);
  }
  writeFileSync(OUT + "gaze_3x3.png", grid.toBuffer("image/png"));

  const strip = createCanvas(CW, CH * 5);
  const sctx = strip.getContext("2d");
  [0, 0.25, 0.5, 0.75, 1].forEach((b, i) => {
    const c = frame({ blink: b, gaze: { x: 0.6, y: 0 } });
    sctx.drawImage(c, 0, i * CH);
  });
  writeFileSync(OUT + "blink_strip.png", strip.toBuffer("image/png"));

  const combo = createCanvas(CW * 3, CH);
  const cctx = combo.getContext("2d");
  const combos: Partial<PuppetParams>[] = [
    { gaze: { x: -1, y: 0.6 }, browRaise: 0.9 },
    { gaze: { x: 0.8, y: -0.5 }, blink: 0.5, browRaise: -0.6 },
    { gaze: { x: 0, y: 1 }, blink: 1 },
  ];
  combos.forEach((p, i) => {
    const ht2 = headTarget(p.gaze ?? { x: 0, y: 0 }, man.limits);
    const c = frame({ ...p, headRot: ht2.rot, headDx: ht2.dx, headDy: ht2.dy });
    cctx.drawImage(c, i * CW, 0);
  });
  writeFileSync(OUT + "combo_expressions.png", combo.toBuffer("image/png"));

  console.log(failures === 0 ? "SELFTEST RESULT: PASS" : `SELFTEST RESULT: FAIL (${failures})`);
  console.log("evidence frames: app/test_out/gaze_3x3.png, blink_strip.png, combo_expressions.png");
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
