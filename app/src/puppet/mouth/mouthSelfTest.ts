/**
 * Mouth Puppet v0.4 — automatic tests (environment-free: the node selftest
 * drives it via callbacks; a browser QA page could reuse it later).
 * Covers the quality criteria checkable without eyes:
 *  1 rest = original lips sprite at full alpha, cavity invisible, jaw at 0
 *  3/4 teeth & tongue gradual and geometrically inside the cavity
 *  5 jaw drop bounded + monotonic (chin patch never detaches)
 *  6 vowels recognisable but understated (anime semi-realistic middle ground)
 *  7 transitions smooth (opening smoother + shape-vector blend converge)
 * Visual criteria (2 no rectangles, 6 look, 8 eyes/head intact) are verified
 * on the evidence frames: app/test_out/mouth_shapes.png + mouth_ramp.png.
 */
import { mouthGeometry, MouthSmoother, lerpShape, type MouthAnchors, type MouthGeom } from "./mouthMath";
import { JawController } from "./jawController";
import { SHAPE_PARAMS, MOUTH_SHAPES, speechTimeline, sampleTimeline, timelineTotal, type MouthShape } from "./mouthShapes";
import type { PuppetParams, RigManifest, View } from "../puppetRender";

export interface MouthTestCanvas {
  width: number;
  height: number;
  toBuffer(mime: "image/png"): Uint8Array;
}

export interface MouthGridSpec {
  cols: number;
  rows: number;
  cw: number;
  ch: number;
  cells: Partial<PuppetParams>[];
}

export interface MouthTestDeps {
  check: (name: string, cond: boolean, detail: string) => void;
  man: RigManifest;
  /** render one frame, or a stitched grid of frames (node canvas stitches) */
  render: (p: Partial<PuppetParams>, view?: View, grid?: MouthGridSpec) => MouthTestCanvas;
  save: (name: string, buf: Uint8Array) => void;
}

const geomAt = (o: number, s: MouthShape, a: MouthAnchors): MouthGeom =>
  mouthGeometry(o, SHAPE_PARAMS[s], a);

export function runMouthSelfTest(d: MouthTestDeps): void {
  const a = d.man.mouth;

  // criterion 1: rest state = original face (closed sprite opaque, cavity hidden)
  const g0 = geomAt(0, "CLOSED", a);
  d.check("mouth rest: original-lips sprite alpha 1, cavity/teeth/tongue hidden, jaw 0",
    g0.closedA === 1 && g0.openA === 0 && g0.teethA === 0 && g0.tongueA === 0 && g0.jawDy === 0,
    `closedA=${g0.closedA} openA=${g0.openA} jawDy=${g0.jawDy}`);

  // criterion 5: jaw bounded + monotonic in opening, every shape
  let mono = true, bounded = true;
  for (const s of MOUTH_SHAPES) {
    let prev = -1;
    for (let o = 0; o <= 1.001; o += 0.1) {
      const g = geomAt(o, s, a);
      if (g.jawDy < prev - 1e-9) mono = false;
      if (g.jawDy > a.jaw_dy + 1e-9) bounded = false;
      prev = g.jawDy;
    }
  }
  d.check("jaw drop monotonic in opening and bounded by jaw_dy for all shapes", mono && bounded,
    `jaw_dy limit=${a.jaw_dy} pose px`);

  // criteria 3/4: teeth gradual & inside cavity; tongue only in adequate openings
  let teethOk = true, tongueOk = true;
  for (const s of MOUTH_SHAPES) {
    for (let o = 0; o <= 1.001; o += 0.05) {
      const g = geomAt(o, s, a);
      const h = g.cavityBot - g.cavityTop;
      if (g.teethH > h * 0.45 + 1e-9 || g.teethH < 0) teethOk = false;
      if (o < 0.15 && g.teethA > 1e-9) teethOk = false;
      if (o < 0.5 && g.tongueA > 1e-9) tongueOk = false;
      if (g.cavityBot > a.lower_lip_top_y + g.jawDy + 1e-9) teethOk = false; // never past lower lip
    }
  }
  d.check("teeth band gradual (none before o=0.15), never deeper than 45% of cavity",
    teethOk, "teethH ≤ 0.45·cavityH; interior clipped to cavity path at draw");
  d.check("tongue only in adequate openings (o ≥ 0.5), shape-gated",
    tongueOk, "tongueA=0 below o=0.5; factors A1 O.7 E.45 U.3 I.15");

  // criterion 6: vowels recognisable but understated
  const w = (s: MouthShape): number => geomAt(0.85, s, a).cavityW;
  const r = (s: MouthShape): number => geomAt(0.85, s, a).round;
  d.check("vowel widths ordered I>E>A>O>U at o=0.85, all ≤1.3× natural lip width",
    w("I") > w("E") && w("E") > w("A") && w("A") > w("O") && w("O") > w("U") && w("I") <= a.base_w * 1.3,
    `px: I=${w("I").toFixed(1)} E=${w("E").toFixed(1)} A=${w("A").toFixed(1)} O=${w("O").toFixed(1)} U=${w("U").toFixed(1)} (base ${a.base_w})`);
  d.check("roundness ordered O≈U (pursed) > A > E > I (slit)",
    r("O") > 0.9 && r("U") > 0.85 && r("A") > r("E") && r("E") > r("I"),
    `round: O=${r("O")} U=${r("U")} A=${r("A")} E=${r("E")} I=${r("I")}`);

  // criterion 7: smooth transitions
  const sm = new MouthSmoother();
  let o = 0;
  for (let i = 0; i < 60; i++) o = sm.step(1, 1 / 60);
  let p = { ...SHAPE_PARAMS.A };
  for (let i = 0; i < 60; i++) p = lerpShape(p, SHAPE_PARAMS.O, 1 - Math.exp(-12 / 60));
  d.check("opening smoother + shape-vector blend converge (no snapping)",
    Math.abs(o - 1) < 0.02 && Math.abs(p.round - SHAPE_PARAMS.O.round) < 0.02 && Math.abs(p.width - SHAPE_PARAMS.O.width) < 0.02,
    `o(1s)=${o.toFixed(3)}; A→O(1s) round=${p.round.toFixed(2)} width=${p.width.toFixed(2)}`);

  // speech timeline sanity
  const tl = speechTimeline("Olá, tudo bem? Eu falo mesmo!");
  const total = timelineTotal(tl);
  const mid = sampleTimeline(tl, total * 0.5);
  d.check("speech timeline finite, rests closed after the end, vowels mid-phrase",
    total > 0.5 && total < 8 && sampleTimeline(tl, total + 1).shape === "CLOSED" && mid.open > 0.2,
    `dur=${total.toFixed(2)}s segs=${tl.length} mid=${mid.shape}@${mid.open}`);

  // regression: the controller itself must turn a speech timeline into real
  // opening motion over time and return to rest (bug class: trigger wired to
  // a callback that never fires for pose-less triggers)
  const jc = new JawController();
  jc.setSpeech("Olá! Eu falo mesmo contigo.", 0);
  let maxO = 0;
  let tSim = 0;
  const opens: number[] = [];
  while (jc.speechActive(tSim) && tSim < 10) {
    tSim += 1 / 60;
    jc.step(1 / 60, tSim);
    maxO = Math.max(maxO, jc.opening);
    opens.push(jc.opening);
  }
  for (let i = 0; i < 90; i++) { tSim += 1 / 60; jc.step(1 / 60, tSim); }
  const moved = opens.filter((x) => x > 0.15).length;
  d.check("JawController: speech timeline produces real opening motion over time, then rests",
    maxO > 0.5 && moved > 20 && jc.opening < 0.05,
    `maxOpen=${maxO.toFixed(2)} frames>0.15=${moved}/${opens.length} end=${jc.opening.toFixed(3)}`);

  // ---- evidence frames (visual criteria 2, 6, 7, 8) ----
  const cell = { x0: 596, y0: 138, x1: 664, y1: 198 };
  const kk = 3;
  const view: View = { scale: kk, ox: -cell.x0 * kk, oy: -cell.y0 * kk };
  const cw = (cell.x1 - cell.x0) * kk, ch = (cell.y1 - cell.y0) * kk;

  const shapeCells: { s: MouthShape; o: number }[] = [
    { s: "CLOSED", o: 0 }, { s: "A", o: 0.85 }, { s: "I", o: 0.85 },
    { s: "U", o: 0.85 }, { s: "E", o: 0.85 }, { s: "O", o: 0.85 },
  ];
  d.save("mouth_shapes.png", d.render({}, view, {
    cols: 3, rows: 2, cw, ch,
    cells: shapeCells.map((c) => ({ mouth: geomAt(c.o, c.s, a) })),
  }).toBuffer("image/png"));

  d.save("mouth_ramp.png", d.render({}, view, {
    cols: 3, rows: 2, cw, ch,
    cells: [0, 0.2, 0.4, 0.6, 0.8, 1].map((o2) => ({ mouth: geomAt(o2, "A", a) })),
  }).toBuffer("image/png"));
}
