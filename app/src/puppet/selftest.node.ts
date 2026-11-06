/**
 * Headless acceptance harness (M2–M4 evidence).
 * Run: npm run test:puppet   (uses @napi-rs/canvas — same Canvas2D API as the browser)
 * Renders evidence frames to app/test_out/ and asserts the acceptance tests.
 */
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gazeOffset, blinkValue, lidBottomY, headTarget, smoothDamp, clamp, idleGaze, pointerToGaze, SecondaryMotion } from "./puppetMath";
import { mouthGeometry } from "./mouth/mouthMath";
import { SHAPE_PARAMS } from "./mouth/mouthShapes";
import { runMouthSelfTest, type MouthGridSpec } from "./mouth/mouthSelfTest";
import { buildGridMesh, boneWeights, skinVertices, type Bone } from "./mesh/meshMath";
import { renderPuppetFrame, computeView, RigManifest, RigAssets, PuppetParams, View } from "./puppetRender";

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
  const [body, neck, headBase, irisL, irisR, lidL, lidR, browL, browR, mouthClosed, mouthJaw, hairPuff, hairTL, hairTR] = await Promise.all([
    load("body_base.png"), load("neck_patch.png"), load("head_base_nm.png"),
    load("iris_L.png"), load("iris_R.png"), load("lid_L.png"), load("lid_R.png"),
    load("brow_L.png"), load("brow_R.png"), load("mouth_closed.png"), load("mouth_jaw.png"),
    load("hair_puff.png"), load("hair_tendril_L.png"), load("hair_tendril_R.png"),
  ]);
  const assets: RigAssets = {
    body, bodyW: body.width, bodyH: body.height, neck, headBase,
    iris: { L: irisL, R: irisR }, lid: { L: lidL, R: lidR }, brow: { L: browL, R: browR },
    mouth: {
      closed: mouthClosed, closedW: mouthClosed.width, closedH: mouthClosed.height,
      jaw: mouthJaw, jawW: mouthJaw.width, jawH: mouthJaw.height,
    },
    hair: { puff: hairPuff, tL: hairTL, tR: hairTR },
    sizes: {
      headBase: [headBase.width, headBase.height],
      iris_L: [irisL.width, irisL.height], iris_R: [irisR.width, irisR.height],
      lid_L: [lidL.width, lidL.height], lid_R: [lidR.width, lidR.height],
      brow_L: [browL.width, browL.height], brow_R: [browR.width, browR.height],
      hair_puff: [hairPuff.width, hairPuff.height],
      hair_tendril_L: [hairTL.width, hairTL.height], hair_tendril_R: [hairTR.width, hairTR.height],
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

  // ---- gaze axis: pointer→gaze is relative to the eyes' screen position
  const pm = { eyeX: 500, eyeY: 300, sensX: 200, sensY: 150 };
  const zc = pointerToGaze(500, 300, pm);
  const rgt = pointerToGaze(900, 300, pm);
  const up = pointerToGaze(500, 0, pm);
  const diag = pointerToGaze(600, 375, pm);
  const mid = pointerToGaze(600, 300, pm);
  check("pointer→gaze: cursor over the eyes = neutral (0,0); extremes clamp per axis",
    zc.x === 0 && zc.y === 0 && rgt.x === 1 && rgt.y === 0 && up.x === 0 && up.y === -1,
    `center=(${zc.x},${zc.y}) right=(${rgt.x},${rgt.y}) up=(${up.x},${up.y})`);
  check("pointer→gaze: diagonal proportional + soft saturation (mid-range responsive)",
    Math.abs(diag.x - Math.pow(0.5, 0.85)) < 1e-9 && Math.abs(diag.y - Math.pow(0.5, 0.85)) < 1e-9 && mid.x > 0.5,
    `diag=(${diag.x.toFixed(3)},${diag.y.toFixed(3)}) mid=${mid.x.toFixed(3)} (>raw 0.5)`);

  // ---- evidence frames (acceptance 1,4,7,9 visual) ----
  const CW = 520, CH = 640;
  const view = computeView(CW, CH, FIG);
  const geom0 = mouthGeometry(0, SHAPE_PARAMS.CLOSED, man.mouth);
  const frame = (p: Partial<PuppetParams>, v: View = view, cw = CW, ch = CH, backdrop = "#eceae8") => {
    const canvas = createCanvas(cw, ch);
    const ctx = canvas.getContext("2d");
    renderPuppetFrame(ctx as never, assets, man, {
      gaze: { x: 0, y: 0 }, blink: 0, browRaise: 0,
      headRot: 0, headDx: 0, headDy: 0, breathPhase: 0, mouth: geom0,
      wink: 0, smile: 0, hair: { puff: { x: 0, y: 0 }, tL: { x: 0, y: 0 }, tR: { x: 0, y: 0 } }, ...p,
    }, v, { w: cw, h: ch, backdrop }); // evidence frames get an explicit backdrop; app stage stays transparent
    return canvas;
  };
  const renderDep = (p: Partial<PuppetParams>, v?: View, grid?: MouthGridSpec) => {
    if (!grid) return frame(p, v ?? view);
    const out = createCanvas(grid.cw * grid.cols, grid.ch * grid.rows);
    const gctx = out.getContext("2d");
    grid.cells.forEach((cp, i) => {
      const c = frame({ ...p, ...cp }, v ?? view, grid.cw, grid.ch);
      gctx.drawImage(c, (i % grid.cols) * grid.cw, Math.floor(i / grid.cols) * grid.ch);
    });
    return out;
  };

  // ---- Mouth Puppet v0.4 tests + evidence frames ----
  runMouthSelfTest({
    check, man,
    render: renderDep,
    save: (n, b) => writeFileSync(OUT + n, Buffer.from(b)),
  });

  // criterion 1 (pixel): rest composition vs ORIGINAL canon art in mouth zone
  const pose = await loadImage(ROOT + "../poses/pose_01_neutral.png");
  const pc = createCanvas(pose.width, pose.height);
  pc.getContext("2d").drawImage(pose, 0, 0);
  const pd = pc.getContext("2d").getImageData(0, 0, pose.width, pose.height).data;
  const restC = frame({}, { scale: 1, ox: -512, oy: 0 }, 240, 212);
  const rd = restC.getContext("2d").getImageData(0, 0, 240, 212).data;
  let acc = 0, npx = 0;
  for (let y = 158; y < 178; y++) {
    for (let x = 612; x < 650; x++) {
      const pi = (y * pose.width + x) * 4;
      if (pd[pi + 3] < 250) continue;
      const ri = (y * 240 + (x - 512)) * 4;
      acc += (Math.abs(rd[ri] - pd[pi]) + Math.abs(rd[ri + 1] - pd[pi + 1]) + Math.abs(rd[ri + 2] - pd[pi + 2])) / 3;
      npx++;
    }
  }
  check("mouth criterion 1: rest mouth pixels match the ORIGINAL canon art", acc / npx < 7,
    `mean|Δ|=${(acc / npx).toFixed(2)} over ${npx}px of the mouth zone (k=1 composite vs pose)`);

  // v0.5.1 regression (white-slab bug): every cut sprite's alpha must stay
  // inside the proven head silhouette (opaque edit background inside a mask
  // leaked as a white slab on dark stages). Asset-level + composed (above
  // shoulders, where only head/hair contribute).
  const hbImg = await loadImage(RIG + "head_base.png");
  const hbc = createCanvas(240, 212);
  hbc.getContext("2d").drawImage(hbImg, 0, 0);
  const hba2 = hbc.getContext("2d").getImageData(0, 0, 240, 212).data;
  const silRaw = (px: number, py: number): number =>
    px < 0 || py < 0 || px > 239 || py > 211 ? 0 : hba2[(py * 240 + px) * 4 + 3];
  // 1px dilation: feather/bilinear half-pixel rings at the silhouette edge are ok
  const silAt = (px: number, py: number): number => {
    let m = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) m = Math.max(m, silRaw(px + dx, py + dy));
    return m;
  };
  const KCUT = 1104 / 240;
  let assetLeak = 0;
  const cutBoxes: { box: [number, number, number, number]; img: typeof hbImg }[] = [
    { box: man.hair.puff_box, img: assets.hair!.puff as typeof hbImg },
    { box: man.hair.tendril_L, img: assets.hair!.tL as typeof hbImg },
    { box: man.hair.tendril_R, img: assets.hair!.tR as typeof hbImg },
    { box: man.mouth.closed_box, img: assets.mouth!.closed as typeof hbImg },
    { box: man.mouth.jaw_box, img: assets.mouth!.jaw as typeof hbImg },
  ];
  for (const cb of cutBoxes) {
    const cc = createCanvas(cb.img.width, cb.img.height);
    cc.getContext("2d").drawImage(cb.img, 0, 0);
    const cd = cc.getContext("2d").getImageData(0, 0, cb.img.width, cb.img.height).data;
    for (let v = 0; v < cb.img.height; v += 2) {
      for (let u = 0; u < cb.img.width; u += 2) {
        if (cd[(v * cb.img.width + u) * 4 + 3] <= 8) continue;
        const px = Math.round(cb.box[0] + u / KCUT - 512);
        const py = Math.round(cb.box[1] + v / KCUT);
        if (silAt(px, py) <= 8) assetLeak++;
      }
    }
  }
  const restA = frame({}, { scale: 1, ox: -512, oy: 0 }, 240, 212, ""); // transparent backdrop for alpha audit
  const fa = restA.getContext("2d").getImageData(0, 0, 240, 212).data;
  let leak = 0, missing = 0;
  for (let y = 0; y < 160; y++) {
    for (let x = 0; x < 240; x++) {
      const i = (y * 240 + x) * 4 + 3;
      if (fa[i] > 8 && silAt(x, y) <= 8) leak++;
      if (hba2[i] > 200 && fa[i] <= 8) missing++;
    }
  }
  check("no alpha leaks: cuts stay inside proven silhouette; composed head clean above shoulders",
    assetLeak <= 32 && leak <= 64 && missing <= 64,
    `assetLeak=${assetLeak} composedLeak=${leak} missing=${missing}`);
  writeFileSync(OUT + "stage_dark.png",
    frame({ gaze: { x: 0.35, y: 0.1 }, smile: 0.4, mouth: mouthGeometry(0.3, SHAPE_PARAMS.E, man.mouth, 0.4) }, view, CW, CH, "#171310").toBuffer("image/png"));

  // ---- v0.6 prototype: mesh + skeletal skinning math (continuous anatomy base)
  const bar = buildGridMesh(0, 0, 100, 20, 5);
  const bones: Bone[] = [
    { name: "upper", x0: 0, y0: 10, x1: 50, y1: 10, parent: -1 },
    { name: "fore", x0: 50, y0: 10, x1: 100, y1: 10, parent: 0 },
  ];
  const W = boneWeights(bar, bones, 30);
  const nV = bar.rest.length / 2;
  let wsumOk = true;
  for (let i = 0; i < nV; i++) {
    let s = 0;
    for (let bi = 0; bi < bones.length; bi++) s += W[i * bones.length + bi];
    if (Math.abs(s - 1) > 1e-9) wsumOk = false;
  }
  check("mesh skinning: weights normalized (smoothstep falloff, no hard switches)", wsumOk, `${nV} verts × ${bones.length} bones`);
  const rest2 = skinVertices(bar, bones, W, [{ rotDeg: 0, dx: 0, dy: 0 }, { rotDeg: 0, dx: 0, dy: 0 }]);
  let restOk = true;
  for (let i = 0; i < rest2.length; i++) if (Math.abs(rest2[i] - bar.rest[i]) > 1e-9) restOk = false;
  check("mesh skinning: rest pose is exact identity (no drift)", restOk, "max|Δ|=0");
  const bent = skinVertices(bar, bones, W, [{ rotDeg: 0, dx: 0, dy: 0 }, { rotDeg: 40, dx: 0, dy: 0 }]);
  let maxEdge = 0;
  const REST_EDGE = Math.hypot(bar.rest[2] - bar.rest[0], 0) + 6; // grid step + tolerance growth
  for (let r = 0; r < bar.rows; r++) {
    for (let c = 0; c < bar.cols - 1; c++) {
      const i0 = (r * bar.cols + c) * 2, i1 = i0 + 2;
      maxEdge = Math.max(maxEdge, Math.hypot(bent[i1] - bent[i0], bent[i1 + 1] - bent[i0 + 1]));
    }
  }
  const tipX = bent[(nV - 1) * 2], tipY = bent[(nV - 1) * 2 + 1];
  const tipMoved = Math.hypot(tipX - 100, tipY - 20) > 20; // forearm zone followed the bone
  check("mesh skinning: 40° elbow bend keeps mesh continuous (no tears) and moves the limb",
    maxEdge <= REST_EDGE && tipMoved, `maxEdge=${maxEdge.toFixed(1)} (rest step 5) tipΔ=${Math.hypot(tipX - 100, tipY - 20).toFixed(1)}`);

  // ---- v0.5: secondary motion, wink, smile ----
  const sm2 = new SecondaryMotion();
  let offMin = 0, off = 0;
  for (let i = 0; i < 30; i++) off = sm2.step(1, 4, 1 / 60);
  for (let i = 0; i < 240; i++) off = sm2.step(1, 4, 1 / 60);
  const offEnd = off;
  const sm3 = new SecondaryMotion();
  for (let i = 0; i < 30; i++) offMin = Math.min(offMin, sm3.step(1, 4, 1 / 60));
  check("secondary motion: drag-behind lag while head moves, decays to 0 at rest",
    offMin < -0.3 && Math.abs(offEnd) < 0.05, `minLag=${offMin.toFixed(2)} end=${offEnd.toFixed(4)}`);

  const cl = (s: number): number => mouthGeometry(0.5, SHAPE_PARAMS.A, man.mouth, s).cornerLift;
  check("smile parameter lifts mouth corners monotonically over -1..1",
    cl(-1) < 0 && cl(0) === 0 && cl(0.5) > 0 && cl(1) > cl(0.5),
    `cornerLift: ${[-1, 0, 0.5, 1].map(cl).map((v) => v.toFixed(1)).join(", ")}`);

  // wink independence: right lid closes, left untouched (pixel diff per half)
  const eyeView: View = { scale: 2, ox: -590 * 2, oy: -115 * 2 };
  const fw0 = frame({ wink: 0 }, eyeView, 160, 60);
  const fw1 = frame({ wink: 1 }, eyeView, 160, 60);
  const w0 = fw0.getContext("2d").getImageData(0, 0, 160, 60).data;
  const w1 = fw1.getContext("2d").getImageData(0, 0, 160, 60).data;
  let dL = 0, dR = 0, nL = 0, nR = 0;
  for (let i = 0; i < w0.length; i += 4) {
    const px = (i / 4) % 160;
    const d = Math.abs(w0[i] - w1[i]) + Math.abs(w0[i + 1] - w1[i + 1]) + Math.abs(w0[i + 2] - w1[i + 2]);
    if (px < 80) { dL += d; nL++; } else { dR += d; nR++; }
  }
  check("wink is per-eye: right lid closes, left eye untouched",
    dR / nR > 3 * Math.max(0.01, dL / nL), `mean|Δ| L=${(dL / nL).toFixed(2)} R=${(dR / nR).toFixed(2)}`);

  // evidence: hair secondary motion + wink/smile combos
  const headView: View = { scale: 2, ox: -512 * 2, oy: 0 };
  const hw2 = 240 * 2, hh2 = 212 * 2;
  const hairCells = [
    frame({ headRot: 2.4, headDx: 3, hair: { puff: { x: -1.6, y: -0.9 }, tL: { x: -2.2, y: -1.2 }, tR: { x: -2.2, y: -1.2 } } }, headView, hw2, hh2),
    frame({ headRot: 2.4, headDx: 3 }, headView, hw2, hh2),
    frame({ headRot: -2.4, headDx: -3, hair: { puff: { x: 1.6, y: -0.9 }, tL: { x: 2.2, y: -1.2 }, tR: { x: 2.2, y: -1.2 } } }, headView, hw2, hh2),
  ];
  const hairGrid = createCanvas(hw2 * 3, hh2);
  const hg = hairGrid.getContext("2d");
  hairCells.forEach((c, i) => hg.drawImage(c, i * hw2, 0));
  writeFileSync(OUT + "hair_sway.png", hairGrid.toBuffer("image/png"));

  const faceView: View = { scale: 3, ox: -580 * 3, oy: -95 * 3 };
  const fw = 100 * 3, fh = 95 * 3;
  const faceCells = [
    frame({}, faceView, fw, fh),
    frame({ wink: 1 }, faceView, fw, fh),
    frame({ smile: 0.9, mouth: mouthGeometry(0.35, SHAPE_PARAMS.A, man.mouth, 0.9) }, faceView, fw, fh),
    frame({ wink: 1, smile: 0.9, mouth: mouthGeometry(0.35, SHAPE_PARAMS.A, man.mouth, 0.9) }, faceView, fw, fh),
  ];
  const faceGrid = createCanvas(fw * 4, fh);
  const fg = faceGrid.getContext("2d");
  faceCells.forEach((c, i) => fg.drawImage(c, i * fw, 0));
  writeFileSync(OUT + "wink_smile.png", faceGrid.toBuffer("image/png"));
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
