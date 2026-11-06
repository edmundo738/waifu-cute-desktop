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
import { solveSkeleton, drawSkinMesh, buildSkinMesh, skinMeshVertex, applyMat, type AlphaMap, type Skeleton, type SkinMesh } from "./mesh/meshRender";
import { BN, skeletonDefs, buildPoses, armWeights, ARM_REST, type ArmPose } from "./mesh/rigWeights";
import { solveArmIK } from "./mesh/armIK";

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

  // ---- v0.6 STAGE 1: continuous skinned sheet (Root→Torso→Neck→Head) ----
  const [sheetImg, lowerImg, armLImg, armRImg, panLImg, panRImg] = await Promise.all([
    load("body_sheet.png"), load("body_lower.png"), load("arm_L.png"), load("arm_R.png"),
    load("panel_L.png"), load("panel_R.png")]);
  const alphaOf = (img: Awaited<ReturnType<typeof loadImage>>): AlphaMap => {
    const c = createCanvas(img.width, img.height);
    const cx = c.getContext("2d");
    cx.drawImage(img, 0, 0);
    return { data: cx.getImageData(0, 0, img.width, img.height).data, w: img.width, h: img.height };
  };
  const assetsV6: RigAssets = {
    ...assets,
    sheet: sheetImg, sheetW: sheetImg.width, sheetH: sheetImg.height,
    lower: lowerImg, lowerW: lowerImg.width, lowerH: lowerImg.height,
    arm: { L: armLImg as never, R: armRImg as never },
    panel: { L: panLImg as never, R: panRImg as never },
    makeCanvas: (w: number, h: number) => createCanvas(w, h),
    alpha: { sheet: alphaOf(sheetImg), armL: alphaOf(armLImg), armR: alphaOf(armRImg), panelL: alphaOf(panLImg), panelR: alphaOf(panRImg) },
  };
  const frameV6 = (p: Partial<PuppetParams>, backdrop = "#171310") => {
    const canvas = createCanvas(CW, CH);
    const ctx = canvas.getContext("2d");
    renderPuppetFrame(ctx as never, assetsV6, man, {
      gaze: { x: 0, y: 0 }, blink: 0, browRaise: 0,
      headRot: 0, headDx: 0, headDy: 0, breathPhase: 0, mouth: geom0,
      wink: 0, smile: 0, hair: { puff: { x: 0, y: 0 }, tL: { x: 0, y: 0 }, tR: { x: 0, y: 0 } }, ...p,
    }, view, { w: CW, h: CH, backdrop });
    return canvas;
  };
  const px = (x: number) => Math.round(view.ox + x * view.scale);
  const py = (y: number) => Math.round(view.oy + y * view.scale);
  const win = { x0: px(470), x1: px(790), y0: py(0), y1: py(384) };
  const dataOf = (c: ReturnType<typeof createCanvas>) => c.getContext("2d").getImageData(0, 0, CW, CH).data;

  // geometry audits need TRANSPARENT backdrop (alpha = character only)
  const frameV6T = (p: Partial<PuppetParams>) => frameV6(p, "");
  // (a) rest parity v0.6 vs v0.5: same visible art (hidden reconstruction stays hidden)
  const r5 = dataOf(frame({}, view, CW, CH, ""));
  const r6 = dataOf(frameV6T({}));
  let dAcc = 0, dN = 0, xor = 0;
  for (let y = win.y0; y < win.y1; y++) {
    for (let x = win.x0; x < win.x1; x++) {
      const i = (y * CW + x) * 4;
      const a5 = r5[i + 3], a6 = r6[i + 3];
      if ((a5 > 200) !== (a6 > 200)) { xor++; continue; }
      if (a5 > 200) { dAcc += (Math.abs(r5[i] - r6[i]) + Math.abs(r5[i + 1] - r6[i + 1]) + Math.abs(r5[i + 2] - r6[i + 2])) / 3; dN++; }
    }
  }
  check("v0.6 stage1: rest pose matches v0.5 composition (hidden art stays hidden)",
    dAcc / dN <= 3 && xor <= 300, `mean|ΔRGB|=${(dAcc / dN).toFixed(2)} alphaXor=${xor} px`);

  // (b) posed frames: no enclosed transparent holes (no tears/separation) in upper body
  const holesIn = (d: Uint8Array): number => {
    const w = win.x1 - win.x0, h = win.y1 - win.y0;
    const open = new Uint8Array(w * h);   // transparent
    const seen = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
      open[y * w + x] = d[((y + win.y0) * CW + (x + win.x0)) * 4 + 3] <= 8 ? 1 : 0;
    const stack: number[] = [];
    const push = (x: number, y: number) => {
      const i = y * w + x;
      if (open[i] && !seen[i]) { seen[i] = 1; stack.push(i); }
    };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w, y = (i / w) | 0;
      if (x > 0) push(x - 1, y);
      if (x < w - 1) push(x + 1, y);
      if (y > 0) push(x, y - 1);
      if (y < h - 1) push(x, y + 1);
    }
    let holes = 0;
    for (let i = 0; i < open.length; i++) if (open[i] && !seen[i]) holes++;
    return holes;
  };
  const lean6T = frameV6T({ torsoRot: 6 });
  const tilt8T = frameV6T({ headRot: 8 });
  const combT = frameV6T({
    torsoRot: 6, headRot: 8, headDx: 3, gaze: { x: 0.6, y: 0.2 }, smile: 0.5,
    mouth: mouthGeometry(0.5, SHAPE_PARAMS.A, man.mouth, 0.5),
  });
  // baseline: rest already contains tiny enclosed pockets (eye-socket feather
  // ring between iris clip and nm opening) — deformation must not ADD holes
  const hR = holesIn(r6);
  const hL = holesIn(dataOf(lean6T)), hT = holesIn(dataOf(tilt8T)), hC = holesIn(dataOf(combT));
  check("v0.6 stage1: torso lean 6°, head tilt 8°, combined → no NEW tears/holes vs rest",
    hL - hR <= 50 && hT - hR <= 50 && hC - hR <= 50,
    `holes rest=${hR} lean=${hL} tilt=${hT} combo=${hC} (Δ≤50 px)`);

  // (c) neck continuity: every row of the neck column band stays covered
  const neckRows = (d: Uint8Array): number => {
    let bad = 0;
    for (let y = py(150); y < py(240); y++) {
      let any = false;
      for (let x = px(600); x < px(662); x++) if (d[(y * CW + x) * 4 + 3] > 8) { any = true; break; }
      if (!any) bad++;
    }
    return bad;
  };
  const nT = neckRows(dataOf(tilt8T)), nC = neckRows(dataOf(combT));
  check("v0.6 stage1: head tilt keeps neck connected (no head/neck separation)",
    nT === 0 && nC === 0, `empty neck rows: tilt=${nT} combo=${nC}`);

  // (d) the tilt actually moves the head (not a no-op): centroid of the whole
  // head block (rows 0..190 pose), in pose px
  const headCentroid = (d: Uint8Array): number => {
    let sx = 0, n = 0;
    for (let y = win.y0; y < py(190); y++)
      for (let x = win.x0; x < win.x1; x++) if (d[(y * CW + x) * 4 + 3] > 200) { sx += x; n++; }
    return sx / Math.max(1, n) / view.scale;
  };
  const shift = Math.abs(headCentroid(dataOf(tilt8T)) - headCentroid(r6));
  check("v0.6 stage1: head tilt 8° moves the skull (deformation is real)", shift >= 10,
    `head-block centroid Δ=${shift.toFixed(1)} pose px`);

  // (e) performance proxy: posed skinned frames in node-canvas (software raster).
  // FORCED RASTER: @napi-rs/canvas defers drawing until pixels are read — before
  // v0.6 stage 2 this check timed command RECORDING only (under-reported). Each
  // frame now reads 1 px back; the v0.5 flat frame is timed the same way.
  const rasterMs = (mk: (i: number) => ReturnType<typeof createCanvas>, n = 30) => {
    const t0r = performance.now();
    for (let i = 0; i < n; i++) mk(i).getContext("2d").getImageData(0, 0, 1, 1);
    return (performance.now() - t0r) / n;
  };
  const ms05 = rasterMs((i) => frame({ headRot: 8 * Math.sin(i / 5), headDx: 2, mouth: mouthGeometry(0.4, SHAPE_PARAMS.E, man.mouth, 0.4) }, view, CW, CH, "#171310"));
  const ms = rasterMs((i) => frameV6({ torsoRot: 6, headRot: 8 * Math.sin(i / 5), headDx: 2, mouth: mouthGeometry(0.4, SHAPE_PARAMS.E, man.mouth, 0.4) }));
  check("v0.6 stage1: posed skinned frame cost (node-canvas software raster, forced) ≤ 33 ms", ms <= 33,
    `mean ${ms.toFixed(2)} ms/frame rasterized (v0.5 flat frame, same method: ${ms05.toFixed(2)} ms)`);

  // evidence strip: rest | lean | tilt | combined on dark stage
  const s1 = createCanvas(CW * 4, CH);
  const s1c = s1.getContext("2d");
  [frameV6({}), frameV6({ torsoRot: 6 }), frameV6({ headRot: 8 }), frameV6({
    torsoRot: 6, headRot: 8, headDx: 3, gaze: { x: 0.6, y: 0.2 }, smile: 0.5,
    mouth: mouthGeometry(0.5, SHAPE_PARAMS.A, man.mouth, 0.5),
  })].forEach((c, i) => s1c.drawImage(c, i * CW, 0));
  writeFileSync(OUT + "stage1_poses.png", s1.toBuffer("image/png"));

  // ---- v0.6 STAGE 2: arm chains Clavicle→UpperArm→Forearm→Hand (L/R) ----
  const rig = man.rigv06!;
  const A0 = { ...ARM_REST };
  const arms = (L: Partial<ArmPose>, R: Partial<ArmPose>) => ({ L: { ...A0, ...L }, R: { ...A0, ...R } });
  const winA = { x0: px(440), x1: px(820), y0: py(0), y1: py(560) };
  // (a) full-figure rest parity incl. arms + hands
  const r5f = dataOf(frame({}, view, CW, CH, ""));
  {
    let acc = 0, n = 0, xr = 0;
    for (let y = winA.y0; y < winA.y1; y++) for (let x = winA.x0; x < winA.x1; x++) {
      const i = (y * CW + x) * 4, a5 = r5f[i + 3], a6 = r6[i + 3];
      if ((a5 > 200) !== (a6 > 200)) { xr++; continue; }
      if (a5 > 200) { acc += (Math.abs(r5f[i] - r6[i]) + Math.abs(r5f[i + 1] - r6[i + 1]) + Math.abs(r5f[i + 2] - r6[i + 2])) / 3; n++; }
    }
    check("v0.6 stage2: rest pose with separate arm meshes matches v0.5 (arms+hands window)",
      acc / n <= 3 && xr <= 400, `mean|ΔRGB|=${(acc / n).toFixed(2)} alphaXor=${xr} px over ${n} px`);
  }

  // (b) no echo: base layers (arms hidden) hold no arm content beyond the hidden band
  const inPoly = (pts: number[][], x: number, y: number, farX: number): boolean => {
    const poly = [...pts, [farX, pts[pts.length - 1][1]], [farX, pts[0][1]]];
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const distPoly = (pts: number[][], x: number, y: number): number => {
    let d = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const vx = bx - ax, vy = by - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
      d = Math.min(d, Math.hypot(x - ax - t * vx, y - ay - t * vy));
    }
    return d;
  };
  {
    const baseOnly = createCanvas(CW, CH);
    renderPuppetFrame(baseOnly.getContext("2d") as never, { ...assetsV6, arm: undefined, panel: undefined }, man, {
      gaze: { x: 0, y: 0 }, blink: 0, browRaise: 0, headRot: 0, headDx: 0, headDy: 0, breathPhase: 0,
      mouth: geom0, wink: 0, smile: 0, hair: null }, view, { w: CW, h: CH, backdrop: "" });
    const bd = dataOf(baseOnly);
    const band = rig.arms!.hidden.mirror_px + rig.arms!.hidden.lining_px + 4;
    let echo = 0, tested = 0;
    for (const sd of ["L", "R"] as const) {
      const B = rig.arms![sd].boundary, far = sd === "L" ? 430 : 840;
      for (let y = winA.y0; y < winA.y1; y++) for (let x = winA.x0; x < winA.x1; x++) {
        const X = (x - view.ox) / view.scale, Y = (y - view.oy) / view.scale;
        if (!inPoly(B, X, Y, far)) continue;
        tested++;
        if (distPoly(B, X, Y) > band && bd[(y * CW + x) * 4 + 3] > 8) echo++;
      }
    }
    check("v0.6 stage2: no echo — base layers keep no arm art beyond the hidden band",
      echo === 0, `echo=${echo} px of ${tested} canvas px inside arm polygons (band ${band} pose px)`);
  }

  // (c) weld stays welded: shoulder abduction leaves the weld zone unchanged
  const sh14 = dataOf(frameV6T({ arms: arms({ shoulder: 14 }, { shoulder: 14 }) }));
  {
    let acc = 0, n = 0;
    for (const sd of ["L", "R"] as const) {
      const W = rig.arms![sd].weld;
      for (let y = py(200); y < py(262); y++) for (let x = winA.x0; x < winA.x1; x++) {
        const X = (x - view.ox) / view.scale, Y = (y - view.oy) / view.scale;
        const i = (y * CW + x) * 4;
        if (distPoly(W, X, Y) > 5 || r6[i + 3] < 250) continue;
        acc += (Math.abs(r6[i] - sh14[i]) + Math.abs(r6[i + 1] - sh14[i + 1]) + Math.abs(r6[i + 2] - sh14[i + 2])) / 3; n++;
      }
    }
    check("v0.6 stage2: shoulder weld invisible — weld zone unchanged under 14° abduction",
      acc / n <= 4, `mean|ΔRGB| ${(acc / n).toFixed(2)} over ${n} px within 5 px of the weld`);
  }

  // (d) no new enclosed holes under every arm test pose
  const holesA = (d: Uint8Array): number => {
    const w = winA.x1 - winA.x0, h = winA.y1 - winA.y0;
    const open = new Uint8Array(w * h), seen = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) open[y * w + x] = d[((y + winA.y0) * CW + x + winA.x0) * 4 + 3] <= 8 ? 1 : 0;
    const st: number[] = [];
    const push = (x: number, y: number) => { const i = y * w + x; if (open[i] && !seen[i]) { seen[i] = 1; st.push(i); } };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (st.length) { const i = st.pop()!, x = i % w, y = (i / w) | 0; if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1); }
    let n = 0; for (let i = 0; i < open.length; i++) if (open[i] && !seen[i]) n++;
    return n;
  };
  const ikL = solveArmIK(rig, "L", [528, 440]), ikR = solveArmIK(rig, "R", [732, 440]);
  const armPoses: [string, Partial<PuppetParams>][] = [
    ["shoulder14", { arms: arms({ shoulder: 14 }, { shoulder: 14 }) }],
    ["elbow40", { arms: arms({ elbow: 40 }, { elbow: 40 }) }],
    ["wrist±25", { arms: arms({ wrist: 25 }, { wrist: -25 }) }],
    ["shrug5", { arms: arms({ shrug: 5 }, { shrug: 5 }) }],
    ["ik", { arms: { L: ikL.pose, R: ikR.pose } }],
    ["combined", { torsoRot: 5, headRot: 6, arms: arms({ shrug: 3, shoulder: 10, elbow: 30, wrist: 15 }, { shrug: 2, shoulder: 6, elbow: 45, wrist: -15 }) }],
  ];
  const hRA = holesA(r6);
  // inter-layer seams can only open where layers meet: the shoulder welds. A gap
  // between arm and flank below the armpit is real space when the arm opens.
  const holesWin = (d: Uint8Array, y0p: number, y1p: number): number => {
    const x0 = winA.x0, w = winA.x1 - winA.x0, y0 = py(y0p), h = py(y1p) - y0;
    const open = new Uint8Array(w * h), seen = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) open[y * w + x] = d[((y + y0) * CW + x + x0) * 4 + 3] <= 8 ? 1 : 0;
    const st: number[] = [];
    const push = (x: number, y: number) => { const i = y * w + x; if (open[i] && !seen[i]) { seen[i] = 1; st.push(i); } };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (st.length) { const i = st.pop()!, x = i % w, y = (i / w) | 0; if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1); }
    let n = 0; for (let i = 0; i < open.length; i++) if (open[i] && !seen[i]) n++;
    return n;
  };
  const shRest = holesWin(r6, 150, 300);
  const comp6 = armPoses.map(([nm, pp]) => { const d = dataOf(frameV6T(pp)); return [nm, holesWin(d, 150, 300), holesA(d)] as const; });
  check("v0.6 stage2: no seam at the shoulder welds — composite holes in the weld window, all 6 poses",
    comp6.every(([, h]) => h - shRest <= 20),
    `weld window rest=${shRest} ` + comp6.map(([n, h]) => `${n}=${h}`).join(" ") +
    ` | full-window (info; hand↔body contact encloses background): rest=${hRA} ` + comp6.map(([n, , f]) => `${n}=${f}`).join(" "));
  // arm-only renders for geometric checks
  const defs = skeletonDefs(rig);
  const skOf = (L: Partial<ArmPose>, R: Partial<ArmPose>, torsoRot = 0): Skeleton => solveSkeleton(defs, buildPoses(rig,
    { torsoRot, headRot: 0, headDx: 0, headDy: 0, neckComp: rig.neck_comp, arms: arms(L, R) }));
  const armOnly = (sk: Skeleton) => {
    const c = createCanvas(CW, CH);
    const cx = c.getContext("2d");
    for (const sd of ["L", "R"] as const) drawSkinMesh(cx as never, { img: sd === "L" ? armLImg : armRImg }, assetsV6.armMesh![sd]!, sk, view);
    return dataOf(c);
  };
  const regionStat = (d: Uint8Array, x0: number, x1: number, y0: number, y1: number) => {
    let sa = 0, sx = 0, sy = 0;
    for (let y = py(y0); y < py(y1); y++) for (let x = px(x0); x < px(x1); x++) {
      const a = d[(y * CW + x) * 4 + 3] / 255; sa += a; sx += a * x; sy += a * y;
    }
    return { area: sa, cx: sx / Math.max(1e-9, sa) / view.scale, cy: sy / Math.max(1e-9, sa) / view.scale };
  };
  const aRest = armOnly(skOf({}, {}));
  // (d2) tears are intra-layer: every layer alone, every pose (incl. contact poses)
  {
    const skFrom = (pp: Partial<PuppetParams>): Skeleton => solveSkeleton(defs, buildPoses(rig, {
      torsoRot: pp.torsoRot ?? 0, headRot: pp.headRot ?? 0, headDx: 0, headDy: 0, neckComp: rig.neck_comp,
      arms: { L: pp.arms?.L ?? A0, R: pp.arms?.R ?? A0 } }));
    const baseT = (pp: Partial<PuppetParams>) => {
      const c = createCanvas(CW, CH);
      renderPuppetFrame(c.getContext("2d") as never, { ...assetsV6, arm: undefined, panel: undefined }, man, {
        gaze: { x: 0, y: 0 }, blink: 0, browRaise: 0, headRot: 0, headDx: 0, headDy: 0, breathPhase: 0, mouth: geom0,
        wink: 0, smile: 0, hair: { puff: { x: 0, y: 0 }, tL: { x: 0, y: 0 }, tR: { x: 0, y: 0 } }, ...pp }, view, { w: CW, h: CH, backdrop: "" });
      return dataOf(c);
    };
    const panelOnly = (sk: Skeleton) => {
      const c = createCanvas(CW, CH);
      const cx = c.getContext("2d");
      for (const sd of ["L", "R"] as const) drawSkinMesh(cx as never, { img: sd === "L" ? panLImg : panRImg }, assetsV6.panelMesh![sd]!, sk, view);
      return dataOf(c);
    };
    const hArm0 = holesA(aRest), hBase0 = holesA(baseT({})), hPan0 = holesA(panelOnly(skOf({}, {})));
    const per = armPoses.map(([nm, pp]) => [nm, holesA(armOnly(skFrom(pp))) - hArm0, holesA(panelOnly(skFrom(pp))) - hPan0, holesA(baseT(pp)) - hBase0] as const);
    check("v0.6 stage2: no tears inside any layer (sleeves, panels, base — each alone) in all 6 arm poses",
      per.every(([, a, q, b]) => a <= 20 && q <= 20 && b <= 20),
      `Δholes sleeve/panel/base: ` + per.map(([n, a, q, b]) => `${n}=${a}/${q}/${b}`).join(" ") + ` (rest ${hArm0}/${hPan0}/${hBase0})`);
  }
  // (l) seam-proof skinning (Canvas2D clips are anti-aliased: abutting triangles
  // leave conflation seams, overlapping ones double-draw semi-transparent texels).
  // Pass 1 offsets only edges over uniform texture; pass 2 refills band-crossing
  // edges with the solid (binarised-alpha) texture. Gate both failure modes.
  {
    const interiorPartial = (d: Uint8Array, below = 230): number => {
      let n = 0;
      const nb = [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, 2], [-2, 2], [2, -2]];
      for (let y = 2; y < CH - 2; y++) {
        for (let x = 2; x < CW - 2; x++) {
          const a = d[(y * CW + x) * 4 + 3];
          if (a === 0 || a >= below) continue;
          let inside = true;
          for (const [dx, dy] of nb) if (d[((y + dy) * CW + x + dx) * 4 + 3] < 250) { inside = false; break; }
          if (inside) n++;
        }
      }
      return n;
    };
    const armOnlyWith = (sk: Skeleton, pass2: boolean) => {
      const c = createCanvas(CW, CH);
      const cx = c.getContext("2d");
      for (const sd of ["L", "R"] as const) {
        const m = assetsV6.armMesh![sd]!;
        const mm: SkinMesh = pass2 ? m : { ...m, solid: undefined, scr: undefined };
        drawSkinMesh(cx as never, { img: sd === "L" ? armLImg : armRImg }, mm, sk, view);
      }
      return dataOf(c);
    };
    const sp: [string, Skeleton][] = [
      ["rest", skOf({}, {})],
      ["elbow60", skOf({ elbow: 60 }, { elbow: 60 })],
      ["combined", skOf({ shrug: 3, shoulder: 10, elbow: 30, wrist: 15 }, { shrug: 2, shoulder: 6, elbow: 45, wrist: -15 }, 5)],
    ];
    // visible seam = interior px ≥10% see-through (α<230). Skia quantises AA
    // coverage (~1/16): complementary coverages sum to 94–100 % → a 2–6 % residual
    // (α 240–249) is the measured floor of exact clips; it is reported, not gated.
    const seamRes = sp.map(([nm, sk]) => {
      const d = armOnlyWith(sk, true);
      return [nm, interiorPartial(d, 230), interiorPartial(d, 250)] as const;
    });
    check("v0.6 stage2: seam-free skinning — no visible seam inside the sleeves (rest, elbow 60°, combined)",
      seamRes.every(([, a]) => a <= 4),
      seamRes.map(([n, a]) => `${n}=${a}`).join(" ") + " interior px with α<230 (enclosed by opaque px at 2 px) | quantisation residual α<250: " +
      seamRes.map(([n, , b]) => `${n}=${b}`).join(" "));
    // silhouette anti-aliasing reproduced at rest (no double-drawn beads): skinned
    // rest render vs a plain blit of the same textures
    const plain = createCanvas(CW, CH);
    const pcx = plain.getContext("2d");
    for (const sd of ["L", "R"] as const) {
      const bx = rig.arms![sd].box, im = sd === "L" ? armLImg : armRImg;
      pcx.drawImage(im, view.ox + view.scale * bx[0], view.oy + view.scale * bx[1], im.width * view.scale, im.height * view.scale);
    }
    const pd = dataOf(plain), sd0 = armOnlyWith(skOf({}, {}), true);
    let n = 0, acc = 0, big = 0, mx = 0;
    for (let i = 3; i < pd.length; i += 4) {
      const a = pd[i], b = sd0[i];
      if ((a > 0 && a < 255) || (b > 0 && b < 255) || a !== b) {
        const dd = Math.abs(a - b); n++; acc += dd; if (dd > 24) big++; if (dd > mx) mx = dd;
      }
    }
    check("v0.6 stage2: silhouette anti-aliasing preserved at rest (no double-drawn alpha beads)", big <= 30 && acc / Math.max(n, 1) <= 4,
      `mean|Δα| ${(acc / Math.max(n, 1)).toFixed(2)} over ${n} edge px, ${big} px with |Δα|>24, max ${mx}`);
    // the isolated layer path accumulates ADDITIVELY ('lighter'): exact only if a
    // layer never overlaps ITSELF on screen. Uniform α=64 texture → any px > 72 is
    // self-overlap (double exposure). Each layer alone, at the joint limits.
    const uniformOf = (im: Awaited<ReturnType<typeof loadImage>>) => {
      const c = createCanvas(im.width, im.height);
      const x = c.getContext("2d");
      x.drawImage(im, 0, 0);
      const d = x.getImageData(0, 0, im.width, im.height);
      for (let q = 3; q < d.data.length; q += 4) d.data[q] = d.data[q] > 0 ? 64 : 0;
      x.putImageData(d, 0, 0);
      return c;
    };
    const uL = uniformOf(armLImg), uR = uniformOf(armRImg), uS = uniformOf(sheetImg);
    const over = (draw: (cx: never) => void) => {
      const c = createCanvas(CW, CH);
      draw(c.getContext("2d") as never);
      const d = dataOf(c);
      let nOver = 0;
      for (let q = 3; q < d.length; q += 4) if (d[q] > 72) nOver++;
      return nOver;
    };
    const skHead = solveSkeleton(defs, buildPoses(rig, { torsoRot: 6, headRot: 8, headDx: 0, headDy: 0, neckComp: rig.neck_comp, arms: arms({}, {}) }));
    const ovRes: [string, number][] = [];
    for (const [nm, skx] of [
      ["elbow60", skOf({ elbow: 60 }, { elbow: 60 })], ["wrist±30", skOf({ wrist: 30 }, { wrist: -30 })],
      ["shoulder18", skOf({ shoulder: 18 }, { shoulder: 18 })], ["shrug6", skOf({ shrug: 6 }, { shrug: 6 })],
      ["combined", skOf({ shrug: 3, shoulder: 10, elbow: 30, wrist: 15 }, { shrug: 2, shoulder: 6, elbow: 45, wrist: -15 }, 5)],
    ] as [string, Skeleton][]) {
      ovRes.push([nm + ".L", over((cx) => drawSkinMesh(cx, { img: uL }, assetsV6.armMesh!.L!, skx, view))]);
      ovRes.push([nm + ".R", over((cx) => drawSkinMesh(cx, { img: uR }, assetsV6.armMesh!.R!, skx, view))]);
    }
    ovRes.push(["sheet lean6+tilt8", over((cx) => drawSkinMesh(cx, { img: uS }, assetsV6.mesh!, skHead, view))]);
    check("v0.6 stage2: additive layer path valid — no skinned layer overlaps itself (joint limits, head tilt)",
      ovRes.every(([, v]) => v <= 20) && !!assetsV6.armMesh!.L!.surface,
      `px with α>72 (uniform α=64 texture): ` + ovRes.map(([n, v]) => `${n}=${v}`).join(" ") + ` | isolated path active: ${!!assetsV6.armMesh!.L!.surface}`);
  }
  // (e) no collapse / no folds: signed area of the deforming (blended) triangles
  {
    const triArea = (q: (i: number) => [number, number], t: Uint32Array, k: number) => {
      const [ax, ay] = q(t[k]), [bx, by] = q(t[k + 1]), [cx2, cy2] = q(t[k + 2]);
      return ((bx - ax) * (cy2 - ay) - (cx2 - ax) * (by - ay)) / 2;
    };
    const res: string[] = [];
    let ok = true;
    for (const [nm, a] of [["shoulder18", { shoulder: 18 }], ["shoulder-4", { shoulder: -4 }], ["elbow40", { elbow: 40 }], ["elbow60", { elbow: 60 }], ["wrist30", { wrist: 30 }], ["wrist-30", { wrist: -30 }], ["shrug6", { shrug: 6 }]] as const) {
      const sk = skOf(a, a);
      for (const [sd, m] of [["L", assetsV6.armMesh!.L!], ["R", assetsV6.armMesh!.R!], ["pL", assetsV6.panelMesh!.L!], ["pR", assetsV6.panelMesh!.R!]] as const) {
        if (m.blend.length === 0) continue;
        const rest = (i: number): [number, number] => [m.rest[i * 2], m.rest[i * 2 + 1]];
        const posed = (i: number): [number, number] => skinMeshVertex(m, i, sk);
        let A0s = 0, A1s = 0, flips = 0, minR = Infinity;
        for (let k = 0; k < m.blend.length; k += 3) {
          const a0 = triArea(rest, m.blend, k), a1 = triArea(posed, m.blend, k);
          A0s += Math.abs(a0); A1s += Math.abs(a1);
          if (Math.sign(a0) !== Math.sign(a1)) flips++;
          minR = Math.min(minR, a1 / a0);
        }
        const r = A1s / A0s;
        // bending bound: integrating det J = 1 + θ·f'(ψ) over the inner side of the
        // bend loses at most θ/π of its area (outer side gains the same)
        const th = Math.abs(Object.values(a)[0] as number) * Math.PI / 180;
        const bound = Math.max(0.03, th / Math.PI);
        ok = ok && Math.abs(r - 1) <= bound && flips === 0;
        res.push(`${nm}${sd}=${r.toFixed(3)}(≤±${bound.toFixed(2)})/min${minR.toFixed(2)}/flip${flips}`);
      }
    }
    check("v0.6 stage2: ZERO folded triangles at every joint limit; area change within the bending bound θ/π", ok, res.join(" "));
  }
  // (f) wrist independence: hand rotates, cuff stays
  {
    const aW = armOnly(skOf({ wrist: 25 }, {}));
    const hand0 = regionStat(aRest, 470, 545, 462, 530), hand1 = regionStat(aW, 450, 600, 450, 545);
    const cuff0 = regionStat(aRest, 470, 545, 425, 445), cuff1 = regionStat(aW, 470, 545, 425, 445);
    const dh = Math.hypot(hand1.cx - hand0.cx, hand1.cy - hand0.cy), dc = Math.hypot(cuff1.cx - cuff0.cx, cuff1.cy - cuff0.cy);
    check("v0.6 stage2: wrist 25° moves the hand, cuff/forearm stays (independent joint)",
      dh >= 8 && dc <= 1, `hand centroid Δ=${dh.toFixed(1)} px, cuff Δ=${dc.toFixed(2)} px (pose)`);
  }
  // (g) elbow independence: forearm swings, upper arm/deltoid stays
  {
    const aE = armOnly(skOf({ elbow: 40 }, {}));
    const up0 = regionStat(aRest, 500, 562, 215, 290), up1 = regionStat(aE, 500, 562, 215, 290);
    const fa0 = regionStat(aRest, 465, 545, 395, 450), fa1 = regionStat(aE, 440, 640, 340, 470);
    const du = Math.hypot(up1.cx - up0.cx, up1.cy - up0.cy), df = Math.hypot(fa1.cx - fa0.cx, fa1.cy - fa0.cy);
    check("v0.6 stage2: elbow 40° swings the forearm, deltoid/upper arm stays",
      df >= 15 && du <= 1, `forearm centroid Δ=${df.toFixed(1)} px, upper-arm Δ=${du.toFixed(2)} px (pose)`);
  }
  // (h) joint volume: rotational blending keeps elbow-band vertices at constant
  // distance from the elbow pivot; report the linear-blend (LBS) equivalent
  {
    const mesh = assetsV6.armMesh!.L!;
    const sk = skOf({ elbow: 40 }, {});
    const el = rig.arms!.L.pivots.elbow;
    let rb = 0, lbs = 0, n = 0;
    const foreL = BN.foreL;
    for (let i = 0; i < mesh.rest.length / 2; i++) {
      if (mesh.b0[i] !== foreL || mesh.f0[i] <= 0.2 || mesh.f0[i] >= 0.8) continue;
      const X = mesh.rest[i * 2] + mesh.origin[0], Y = mesh.rest[i * 2 + 1] + mesh.origin[1];
      const r0 = Math.hypot(X - el[0], Y - el[1]);
      if (r0 < 20 || r0 > 70) continue;
      const [qx, qy] = skinMeshVertex(mesh, i, sk);
      const f = mesh.f0[i];
      const [ax, ay] = applyMat(sk.world[BN.upperL], X, Y), [bx, by] = applyMat(sk.world[foreL], X, Y);
      rb += Math.hypot(qx - el[0], qy - el[1]) / r0;
      lbs += Math.hypot(ax * (1 - f) + bx * f - el[0], ay * (1 - f) + by * f - el[1]) / r0;
      n++;
    }
    check("v0.6 stage2: elbow corrective — band vertices keep their distance to the joint at 40°",
      n > 10 && rb / n > 0.995, `rotational-blend ratio ${(rb / n).toFixed(4)} vs linear-blend ${(lbs / n).toFixed(4)} (${n} band verts)`);
  }
  // (i) IK: targets generated by FK from in-limit poses must be reached ≤1 px;
  //     out-of-limit target → clamped; unreachable → finite
  {
    const fkWrist = (sd: "L" | "R", a: Partial<ArmPose>, torsoRot = 0): [number, number] => {
      const sk = sd === "L" ? skOf(a, {}, torsoRot) : skOf({}, a, torsoRot);
      const w = rig.arms![sd].pivots.wrist;
      const [x, y] = applyMat(sk.world[sd === "L" ? BN.handL : BN.handR], w[0], w[1]);
      return [x, y];
    };
    const cases: [string, "L" | "R", Partial<ArmPose>, number][] = [
      ["L(5,20)", "L", { shoulder: 5, elbow: 20 }, 0], ["L(12,45)", "L", { shoulder: 12, elbow: 45 }, 0],
      ["L(-3,10)", "L", { shoulder: -3, elbow: 10 }, 0], ["L(16,55)+shrug4+lean3", "L", { shoulder: 16, elbow: 55, shrug: 4 }, 3],
      ["R(5,20)", "R", { shoulder: 5, elbow: 20 }, 0], ["R(12,45)", "R", { shoulder: 12, elbow: 45 }, 0],
      ["R(-3,10)", "R", { shoulder: -3, elbow: 10 }, 0], ["R(16,55)+shrug4+lean3", "R", { shoulder: 16, elbow: 55, shrug: 4 }, 3],
    ];
    const res = cases.map(([n, sd, a, tr]) => [n, solveArmIK(rig, sd, fkWrist(sd, a, tr), { shrug: a.shrug ?? 0, torsoRot: tr })] as const);
    // needs ~90° elbow flexion (> 60° limit): solver must clamp, stay finite, report the miss
    const lim = solveArmIK(rig, "L", [560, 330]);
    const far = solveArmIK(rig, "L", [300, 700]);
    const finite = [far.pose.shoulder, far.pose.elbow, far.err, lim.err].every(Number.isFinite);
    check("v0.6 stage2: 2-bone IK reaches FK-generated targets ≤1 px; out-of-limit target clamped; unreachable finite",
      res.every(([, r]) => r.err <= 1 && !r.clamped) && lim.clamped && lim.pose.elbow <= 60 && lim.err > 1 && finite,
      res.map(([n, r]) => `${n}:${r.err.toFixed(3)}px`).join(" ") + ` | limit-case clamped=${lim.clamped} el=${lim.pose.elbow.toFixed(1)} miss=${lim.err.toFixed(1)}px | far err=${far.err.toFixed(0)}`);
  }

  // (j) breathing: overlays locked to the skinned head (Stage-1 bug fixed in stage 2)
  {
    const rec = createCanvas(CW, CH);
    const real = rec.getContext("2d");
    const calls: { img: unknown; args: number[]; m: { a: number; b: number; c: number; d: number; e: number; f: number } }[] = [];
    // records drawImage + the device-space matrix on ANY context it wraps: the main
    // canvas (iris overlay) and the sheet mesh's isolated layer surface (head run),
    // whose transform is set to the main context's current one → both device space
    const recorder = <T extends object>(target: T): T => new Proxy(target, {
      get(t, prop) {
        if (prop === "drawImage") return (img: unknown, ...args: number[]) => {
          const m = (t as unknown as { getTransform(): DOMMatrix }).getTransform();
          calls.push({ img, args, m: { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f } });
          ((t as unknown as { drawImage: (...x: unknown[]) => void }).drawImage)(img, ...args);
        };
        const v = Reflect.get(t, prop, t);
        return typeof v === "function" ? v.bind(t) : v;
      },
      set(t, prop, value) { return Reflect.set(t, prop, value, t); },
    });
    const proxy = recorder(real);
    const surfS = assetsV6.mesh!.surface;
    const realSurfCtx = surfS?.ctx;
    if (surfS && realSurfCtx) surfS.ctx = recorder(realSurfCtx as object) as typeof realSurfCtx;
    const errAt = (phase: number): number => {
      calls.length = 0;
      renderPuppetFrame(proxy as never, assetsV6, man, {
        gaze: { x: 0, y: 0 }, blink: 0, browRaise: 0, headRot: 5, headDx: 2, headDy: 0, breathPhase: phase,
        mouth: geom0, wink: 0, smile: 0, hair: null, torsoRot: 3 }, view, { w: CW, h: CH, backdrop: "" });
      const headRun = assetsV6.mesh!.runs.findIndex((r) => r.bone === BN.head);
      const sheetCall = calls.filter((c) => c.img === sheetImg)[headRun];
      const irisCall = calls.find((c) => c.img === assetsV6.iris.L)!;
      const e = man.eyes.L, [iw, ih] = assetsV6.sizes.iris_L;
      const Px = e.open_c[0] - iw / 2, Py = e.open_c[1] - ih / 2;
      const ap = (m: typeof sheetCall.m, x: number, y: number) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
      const [sx, sy] = ap(sheetCall.m, Px - rig.sheet_box[0], Py - rig.sheet_box[1]);
      const [ix, iy] = ap(irisCall.m, irisCall.args[0], irisCall.args[1]);
      return Math.hypot(sx - ix, sy - iy);
    };
    const e0 = errAt(0), ePeak = errAt(0.8);
    if (surfS && realSurfCtx) surfS.ctx = realSurfCtx;
    check("v0.6 stage2: eye overlay stays locked to the skinned head through the breath cycle",
      e0 <= 0.05 && ePeak <= 0.05, `iris↔head-mesh mismatch: phase0 ${e0.toFixed(4)} px, breath peak ${ePeak.toFixed(4)} px (canvas)`);
  }

  // (k) performance: everything moving at once
  {
    const ms = rasterMs((i) => {
      const s = Math.sin(i / 4);
      return frameV6({ torsoRot: 4 * s, headRot: 6 * s, arms: arms({ shrug: 3 * s, shoulder: 8 + 6 * s, elbow: 20 + 20 * s, wrist: 20 * s }, { shrug: -2 * s, shoulder: 8 - 6 * s, elbow: 20 - 15 * s, wrist: -20 * s }) });
    });
    const st = (m?: { stats: { rigid: number; blended: number; skipped: number } }) => m ? `${m.stats.rigid}r/${m.stats.blended}b/${m.stats.skipped}s` : "-";
    check("v0.6 stage2: full skeleton posed frame cost (node-canvas software raster, forced) ≤ 33 ms", ms <= 33,
      `mean ${ms.toFixed(2)} ms/frame rasterized (v0.5 flat ${ms05.toFixed(2)} ms); cells sheet ${st(assetsV6.mesh)} armL ${st(assetsV6.armMesh?.L)} armR ${st(assetsV6.armMesh?.R)} (rigid/blended/skipped)`);
  }

  // ---- evidence: upper-body framing so the arms are readable
  const UB: [number, number, number, number] = [430, 170, 830, 560];
  const EW = 480, EH = 470;
  const vUB = computeView(EW, EH, UB);
  const frameUB = (pp: Partial<PuppetParams>, backdrop = "#171310") => {
    const c = createCanvas(EW, EH);
    renderPuppetFrame(c.getContext("2d") as never, assetsV6, man, {
      gaze: { x: 0, y: 0 }, blink: 0, browRaise: 0, headRot: 0, headDx: 0, headDy: 0, breathPhase: 0, mouth: geom0,
      wink: 0, smile: 0, hair: { puff: { x: 0, y: 0 }, tL: { x: 0, y: 0 }, tR: { x: 0, y: 0 } }, ...pp }, vUB, { w: EW, h: EH, backdrop });
    return c;
  };
  const panels: Partial<PuppetParams>[] = [
    {}, armPoses[0][1], armPoses[1][1], armPoses[2][1],
    { arms: { L: { ...ikL.pose, shrug: 4 }, R: { ...ikR.pose, shrug: 4 } } },
    { ...armPoses[5][1], smile: 0.5, mouth: mouthGeometry(0.5, SHAPE_PARAMS.A, man.mouth, 0.5), gaze: { x: 0.5, y: 0.1 } },
  ];
  const s2 = createCanvas(EW * panels.length, EH);
  const s2c = s2.getContext("2d");
  panels.forEach((pp, i) => s2c.drawImage(frameUB(pp), i * EW, 0));
  writeFileSync(OUT + "stage2_arms.png", s2.toBuffer("image/png"));

  // weight painting + skeleton visualisation
  {
    const c = createCanvas(EW * 2, EH);
    const cx = c.getContext("2d");
    cx.drawImage(frameUB({}), 0, 0);
    cx.drawImage(frameUB({}), EW, 0);
    cx.fillStyle = "rgba(10,8,8,0.55)";
    cx.fillRect(EW, 0, EW, EH);
    const COL: Record<number, string> = { 1: "#7f8c8d", 2: "#f1c40f", 3: "#e67e22", 4: "#9b59b6", 5: "#3498db", 6: "#2ecc71", 7: "#e74c3c", 8: "#9b59b6", 9: "#3498db", 10: "#2ecc71", 11: "#e74c3c", 0: "#555" };
    const meshes = [assetsV6.mesh!, assetsV6.armMesh!.L!, assetsV6.armMesh!.R!];
    for (const m of meshes) {
      for (let i = 0; i < m.rest.length / 2; i++) {
        const X = m.rest[i * 2] + m.origin[0], Y = m.rest[i * 2 + 1] + m.origin[1];
        if (Y < 150) continue;
        const useB1 = m.c[i] >= 0.5;
        const b = useB1 ? m.b1[i] : m.b0[i], f = useB1 ? m.f1[i] : m.f0[i];
        cx.globalAlpha = 0.35 + 0.65 * f;
        cx.fillStyle = COL[b] ?? "#fff";
        cx.fillRect(EW + vUB.ox + X * vUB.scale - 2, vUB.oy + Y * vUB.scale - 2, 4, 4);
      }
    }
    cx.globalAlpha = 1;
    const sk0 = skOf({}, {});
    cx.strokeStyle = "#ffffff";
    cx.lineWidth = 2;
    for (let b = 1; b < defs.length; b++) {
      const par = defs[b].parent;
      if (par < 1) continue;
      const [ax, ay] = defs[par].pivot, [bx, by] = defs[b].pivot;
      cx.beginPath();
      cx.moveTo(EW + vUB.ox + ax * vUB.scale, vUB.oy + ay * vUB.scale);
      cx.lineTo(EW + vUB.ox + bx * vUB.scale, vUB.oy + by * vUB.scale);
      cx.stroke();
    }
    void sk0;
    for (const d of defs.slice(1)) {
      cx.fillStyle = "#ffffff";
      cx.beginPath();
      cx.ellipse(EW + vUB.ox + d.pivot[0] * vUB.scale, vUB.oy + d.pivot[1] * vUB.scale, 4, 4, 0, 0, Math.PI * 2);
      cx.fill();
    }
    writeFileSync(OUT + "stage2_weights.png", c.toBuffer("image/png"));
  }
  // hidden-art honesty panel: base layers without arms | full rest composite
  {
    const c = createCanvas(EW * 2, EH);
    const cx = c.getContext("2d");
    const base = createCanvas(EW, EH);
    renderPuppetFrame(base.getContext("2d") as never, { ...assetsV6, arm: undefined, panel: undefined }, man, {
      gaze: { x: 0, y: 0 }, blink: 0, browRaise: 0, headRot: 0, headDx: 0, headDy: 0, breathPhase: 0, mouth: geom0,
      wink: 0, smile: 0, hair: { puff: { x: 0, y: 0 }, tL: { x: 0, y: 0 }, tR: { x: 0, y: 0 } } }, vUB, { w: EW, h: EH, backdrop: "#171310" });
    cx.drawImage(base, 0, 0);
    cx.drawImage(frameUB({}), EW, 0);
    writeFileSync(OUT + "stage2_hidden_art.png", c.toBuffer("image/png"));
  }
  void buildSkinMesh; void armWeights;

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
