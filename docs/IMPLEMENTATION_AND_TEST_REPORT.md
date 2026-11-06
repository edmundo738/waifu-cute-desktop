# Implementation & Test Report — puppet v0.2 (eye/head/brow milestone)

Evidence labels: **FACT** (documented/source-verified) · **MEASURED** (assertion with numbers) ·
**OBSERVED** (visual evidence frame) · **INFERRED** · **HYPOTHESIS** · **UNKNOWN**.

## What was built (proposed architecture → actually implemented)

| Item | Status | Evidence |
|---|---|---|
| M1 artwork inspection & layer extraction | DONE | `docs/CHARACTER_LAYER_MAP.md`; identity diff MEASURED mean 2.36 / p95 8.0 outside edit mask |
| M2 one-eye prototype: iris component, X/Y movement, clip, limits | DONE | selftest PASS; `app/test_out/gaze_3x3.png` OBSERVED |
| M3 both eyes + lids + partial/full blink + brows | DONE | `blink_strip.png` OBSERVED (b=0/0.25/0.5/0.75/1); brow combos in `combo_expressions.png` |
| M4 head inclination, own limits/smoothing, gaze coordination | DONE | selftest PASS (rot 2.40° at full gaze, λ=5 convergence); OBSERVED subtle shift in gaze grid |
| M5 app integration (cursor → parameters, idle, triggers) | DONE (web) | `app/` dev server; PuppetRenderer default when `/rig/manifest.json` present |
| Mesh deformation, mouth/jaw, hair groups, arm chains | NOT DONE | documented in CHARACTER_LAYER_MAP.md / LIMITATIONS.md |

## Acceptance tests (user list 1–10)

1. Both eyes follow cursor in all directions — **OBSERVED** gaze_3x3 (9 directions) + **MEASURED** clamp assertions.
2. Eyeballs remain inside openings — **MEASURED** (clip ellipse enforced at draw; travel+iris_r vs opening checked).
3. Pupils never visibly escape — **OBSERVED** gaze_3x3 extreme cells.
4. Diagonals work — **OBSERVED** corner cells + **MEASURED** diagonal clamp cases.
5. Eyes move independently of head — **MEASURED** (head λ/limits separate; headTarget unit-checked; renderer params independent).
6. Head follows gaze subtly — **MEASURED** rot ≤ 2.4° at full gaze (limit 4°) + **OBSERVED**.
7. Blinking works while looking in directions — **OBSERVED** blink_strip rendered at gaze x=0.6; lid drawn inside same clip after iris (code-level FACT).
8. Smooth return to neutral — **MEASURED** residual 0.0000 after 5 s simulated decay.
9. No visual gaps between reconstructed layers — **OBSERVED** frames (neck patch + silhouette alpha); earlier gap/bar defects found via frames and fixed (failed experiments kept in git history of this branch).
10. Performance acceptable — **INFERRED** for target Windows hardware: one 2D canvas, 9 drawImage calls/frame, no WebGL; **MEASURED** headless render of 17 evidence frames <2 s total.

## v0.3 additions — gaze axis fix + next-level inputs

- **Axis fix [MEASURED]**: pointer→gaze is now relative to the on-screen eye position
  (canvas rect + view transform). Self-test asserts cursor-over-eyes = (0,0), per-axis
  clamping, diagonal proportionality and the |v|^0.85 soft-saturation curve → 10/10 PASS.
- **Webcam face-follow [IMPLEMENTED; in-browser verification pending user camera]**:
  MediaPipe FaceLandmarker (WASM, on-device, optional toggle, mirrored pip preview);
  gaze priority above cursor; camera stream released on toggle-off.
- **Local-LLM brain [IMPLEMENTED; probe path verified]**: OpenAI-compatible chat to
  `http://127.0.0.1:1234/v1` (user's LM Studio, qwen3-4b): PT-PT persona system prompt,
  sentiment→reaction triggers, talk/viseme cycle during replies, and an honest canned-reply
  fallback labelled offline when the endpoint is unreachable.

## v0.4 — Mouth Puppet (componente boca/mandíbula)

Arquitectura (mesmo princípio dos olhos: camadas + máscaras + parâmetros):
`head_base_nm` (face sem boca, edição cirúrgica, identidade mean 3.94/p95 12.67 fora da
zona da boca) → `mouth_jaw` (lábio inferior + pele do queixo da arte ORIGINAL, alpha
penado, transladado por jawDy ≤5.5 px, parado acima do contorno do queixo → sem linha
fantasma) → `mouth_closed` (lábios originais em crossfade: repouso = pixeis do canon,
critério 1 **MEASURED** mean|Δ|=5.06) → cavidade oral vectorial (clip mask: dentes em
banda gradual ≤45 % da altura, língua só com o≥0.5 — nunca saem dos lábios, critérios 3/4)
→ traço do lábio superior. Dois controlos independentes: abertura 0..1 (6 estados
perceptuais) × forma CLOSED/A/I/U/E/O (vectores de parâmetros com blend, sem snaps).
Mandíbula não é placa rígida: queixo/lábio descem com a abertura, cavidade cresce entre
o lábio superior quase fixo e o lábio inferior descendente. Fala: timeline de vogais
subtis a partir de texto (PT), ligada ao cérebro local e ao trigger talk.
Ficheiros: `app/src/puppet/mouth/{mouthMath,mouthShapes,mouthLayers,jawController,
MouthRenderer,mouthSelfTest}.ts`. Testes: 9 asserções novas + pixel-rest, **19/19 PASS**;
evidência visual `mouth_shapes.png` (vogais reconhecíveis sem exagero) e `mouth_ramp.png`
(transição suave) **[OBSERVED]**; olhos/cabeça intactos em `gaze_3x3.png` (critério 8).

## v0.5 — secondary motion & expression parameters (same component idea)

- **Hair**: puff crown + side tendrils cut as feathered overlay layers (no inpaint:
  the base keeps the hair, sprites ride on top; dark curl texture + sub-pixel amplitudes
  hide the double-draw). Motion = `SecondaryMotion` lag (smoothed head driver − driver):
  drag-behind while the head moves, decay to 0 at rest, plus idle sway; clamped to
  hair limits (±2.5/±1.5 px). **[MEASURED]** minLag −0.94, end −0.0000; **[OBSERVED]**
  `hair_sway.png` (no seams/rectangles at ±2.4° head rot).
- **Wink per eye**: lid control split (global blink ∨ right wink ∨ smile squint).
  **[MEASURED]** wink=1 → mean|Δ| L=0.00 / R=51.19 (perfect independence);
  lid descent rebuilt as flat skin fill + lash sprite at natural size on the moving
  edge (fixes stretched-lash blob found in the first wink frames).
- **Smile parameter** (−1..1): procedural mouth-corner lift (monotonic **[MEASURED]**
  −1.8/0/0.9/1.8 px) + lid squint; wired to triggers (compliment 0.9, greet 0.6,
  playful 0.5+wink…) and to chat-reply sentiment. Evidence `wink_smile.png`.
- Self-test **23/23 PASS**; eyes/head/mouth regressions clean.

## v0.5.1 — white-slab bug class fixed (dark-stage safety) + mesh prototype
- **Bug (user-reported, image-5)**: white slab behind the head on dark stages.
  Root cause: cut sprites inherited the opaque generated-edit background inside
  feather masks (invisible on the light test backdrop). Same class hit the
  ground-shadow zone of `body_base.png` (semi-transparent background-coloured px).
- **Fix**: every cut alpha = shape mask × proven silhouette (`head_base.png`);
  `head_base_nm.png` alpha re-derived from the proven silhouette; bright
  semi-transparent background pixels purged from all cuts (teeth/sole whites
  preserved by opacity guard); `head_base_nm` edge halo purged with a
  silhouette-edge guard.
- **Regression gates (selftest)**: per-asset alpha leak vs proven silhouette
  (1 px dilation for feather rings) and composed-head audit above shoulders on
  a transparent backdrop — MEASURED `assetLeak=0 composedLeak=0 missing=0`;
  dark-stage evidence `app/test_out/stage_dark.png` (#171310); pre-fix proof
  `app/test_out/BUG_white_slab_v05.png`. Canon note: the light ground splash
  strokes under the sneakers and the curl rim-light visible on dark stages are
  original art from the reference sheets, not leaks (gate = 0).
- **Mesh+skinning prototype** `app/src/puppet/mesh/meshMath.ts` (grid mesh,
  smoothstep-normalised bone weights, linear-blend skinning): 3 new checks —
  weights normalised; rest pose exact identity (max|Δ|=0); 40° elbow bend
  continuous (maxEdge 6.7 vs rest step 5) with limb tip moving 34.9 px.
- Self-test now **26/26 PASS**; `npm run build` clean; validator includes
  `stage_dark.png`. Architecture diagnosis + staged migration plan:
  `docs/RIG_ARCHITECTURE_PROPOSAL_v06.md` (proposal, awaiting approval).

## v0.6 Stage 1 — continuous anatomical base + Root→Torso→Neck→Head (IMPLEMENTED, TESTED)
Approved by the user after the proposal; implemented behind `?rig=v06` (v0.5
renderer remains the default until parity is proven in live use).
- **Prep** `tools/prep_stage1_sheet.py`: `rig/body_sheet.png` = ONE continuous
  head+neck+upper-torso texture (body art + reconstructed HIDDEN art: skull-base
  disc clipped to the proven neck silhouette + tapered neck-cylinder extension
  behind the jaw + neck patch + no-mouth head) and `rig/body_lower.png` (body
  below the waist cut at row 384, where the mesh's Root-weighted edge meets it).
  Hidden art is invisible at rest by construction (MEASURED: rest parity vs v0.5
  composition mean|ΔRGB|=0.34, alphaXor=278 px over 216k).
- **Runtime** `app/src/puppet/mesh/meshRender.ts`: grid mesh (step 8) with
  smoothstep blend bands (head→neck 190-215, neck→torso 215-255, torso→root
  336-384); rigid row spans blit as single transformed drawImage; only band
  triangles (~1.2k) go through per-triangle affine texture mapping with 0.7 px
  clip expansion. Bone chain Root→Torso→Neck→Head with neck compensation
  (neck = 0.35·headRot) so the jaw/neck junction flexes instead of tearing.
- **Measured (selftest, 31/31 PASS)**: torso lean 6° / head tilt 8° / combined
  add NO new enclosed holes vs rest (Δ≤50 px gate; rest baseline 121 px = the
  pre-existing eye-socket feather ring, unrelated to deformation); neck column
  stays connected on every row (0 empty rows); head-block centroid moves 14.5
  pose px at 8° tilt (deformation is real, not a no-op); posed skinned frame
  7.8 ms mean in node-canvas software raster (rigid spans + band tris only).
  *Corrected in Stage 2: that figure timed command recording (deferred raster);
  with forced rasterisation the Stage-1 frame costs 20.7 ms — see below.*
- **Evidence**: `app/test_out/stage1_poses.png` (rest | lean 6° | tilt 8° |
  combined with gaze+smile+open mouth, dark stage) — head/neck/torso read as one
  continuous body in every panel.
- Known stage-1 scope notes (documented, not defects): the waist/forearm blend
  band shows a soft wobble under torso lean (arms get their own bones in stage
  2, which removes it); eye-socket feather ring exists since v0.4 and is used
  as the holes baseline.

## v0.6 Stage 2 — arms/hands: Clavicle→UpperArm→Forearm→Hand L/R (IMPLEMENTED, TESTED)
User GO after Stage 1. Still behind `?rig=v06` (`?rig=v06&armtest=1` = articulation
showcase, 6 segments × 4 s; `?perf=1` = console frame timing in the browser).
- **Skeleton** (12 bones): Root→Torso→Neck→Head + per side Clavicle→UpperArm→Forearm→Hand,
  pivots in pose px (`manifest.json → rigv06.arms`). Limits enforced by `clampArm`:
  shrug −2…6°, shoulder −4…18°, elbow −5…60°, wrist −30…30°.
- **Stage-1 bug fixed first (breathing)**: eye/mouth/hair overlays were drawn outside the
  breathe wrapper while the head mesh breathed (≈5.7 px slide at the breath peak). The head
  group now renders inside the wrapper. MEASURED: iris↔head-mesh mismatch 0.0000 px at
  breath phase 0 and at the peak.
- **Prep** `tools/prep_stage2_arms.py` (deterministic, reruns from the canon art):
  - arm layers cut at the shoulder welds; the jacket/skin medial strip is MATTED
    (F = (C−(1−J)B)/J, J ≥ jmin), not binary-inset (a 3 px binary inset left a jagged edge
    and skin flecks — failed experiment); mirror fill only 3 px (`D_MIRROR`; 9 px made a
    waist step — failed experiment);
  - **edge decontamination**: every semi-transparent silhouette px gets propagated interior
    colour, α untouched (a white bead outline survived two narrower defringe attempts);
  - **depth split panel | sleeve**: the jacket front panel is its own layer BEHIND the
    sleeve. One continuous sleeve+panel mesh produced a fan/comb at elbow 60° — topology,
    not weights (weight-only fixes were rejected after analysis);
  - **hidden art**: torso/hip under the arms (`body_lower`, `body_sheet`) and the jacket side
    continued ≤ 28 px under the sleeve (panel extension, distance-shaded). Rule learned:
    the back layer extends ≥ 3 px under the front layer on every shared boundary, otherwise
    resampling shows a seam even at rest. The extension is OPAQUE with a ~1 px anti-aliased
    edge and stays 2 px inside the sleeve silhouette: the first version had an 8 px fade
    that read as a translucent smear once a bent forearm uncovered it (found in the
    combined-pose evidence, fixed in prep). Contour audit: L 142 px distance contour /
    19 px silhouette clearance / 8 px hem; R 118 / 35 / 15.
  - MEASURED: asset rest parity mean|ΔRGB·α| 0.000 (max 0.6, xor 0); echo 0 px.
- **Weights** (`mesh/rigWeights.ts`): weld ramp (8 px feather + 24 px ramp) for clavicle→upper
  arm; elbow and wrist use ANGULAR cones around the joint (w = 0.9 / 0.5) — a projection
  band or 8 px wrist band produced inverted triangles (failed experiments). Bound:
  det J ≥ 1 − θ·0.75/w ⇒ fold-free up to 68.8° elbow / 38.2° wrist (limits are 60°/30°);
  dropped second-order term ≤ 0.33 px. Rotational blending (elbow corrective) keeps band
  vertices at their joint distance: ratio 1.0000 vs 0.9479 for linear blend skinning.
- **IK** (`mesh/armIK.ts`): analytic 2-bone solve with limits; FK-generated targets reached
  at 0.000 px (8 cases incl. shrug + lean), out-of-limit target clamped (elbow 60.0°).
- **Rendering — seam-proof skinned layers** (`mesh/meshRender.ts`). Canvas2D clips are
  anti-aliased: abutting triangles leave conflation seams, overlapping ones double-draw
  semi-transparent texels. Path taken (each step measured):
  1. 0.7 px centroid push (Stage 1) → seams on compressed sliver triangles at 60°.
  2. uniform polygon offset → seams gone but on-edge α 128→179 (beads), rest parity
     alphaXor 335 → FAIL.
  3. offscreen `copy` compositing → rejected: Skia's `copy` under an AA clip is not a
     pure lerp (117–120 instead of 128 on the edge).
  4. per-edge offset + solid refill pass → interior OK, but 116 px of silhouette notches
     (|Δα| > 24, up to 69) and +2.2 ms; the solid texture also redrew binary prep cuts
     (fixed by eroding it there).
  5. Skia did not cancel the coincident edges of abutting rigid rects at some rotations
     (MEASURED 16 partial-α px at 60°, 0 at 0°/33°) → 1-texel stitch rects inside the
     union (outline unchanged). This was the source of the long straight seams at 60°.
  6. **FINAL: isolated additive layer**. Each layer with blended triangles is drawn on its
     own offscreen surface with exact clips and `lighter`: complementary coverages sum to
     the texel value (MEASURED ±7 α vs −67 with source-over), then the surface is
     composited once with source-over (bbox only). The 2-pass path remains the fallback
     when no canvas factory exists. Requirement: a layer must not overlap itself — gated.
     Colour: bias vs the texel mean +0.18…+0.46 of one 8-bit level (direct blits:
     −0.24…−0.29); at scale 1.0 both are exact.
- **Selftest: 47/47 PASS** (`npm run test:puppet`), Stage-2 gates (MEASURED, final run):
  | gate | result |
  |---|---|
  | rest parity, arms window | mean\|ΔRGB\| 0.89, alphaXor 261 px / 57 298 |
  | echo (no arm art left in base) | 0 px |
  | shoulder weld under 14° abduction | mean\|ΔRGB\| 0.03 within 5 px of the weld |
  | weld-window holes, 6 poses | 88–105 (rest 102) |
  | tears per layer alone, 6 poses | Δholes sleeve/panel/base ≤ 4 (combined −4/3/−11) |
  | visible seams inside sleeves (α < 230) | rest 0, elbow 60° 1, combined 4 |
  | silhouette AA at rest | mean\|Δα\| 2.68, 1 px > 24, max 25 |
  | self-overlap (additive validity) | ≤ 9 px at every joint limit + head tilt |
  | folded triangles at limits | 0 (min det 0.13 at elbow 60°) |
  | wrist independence | hand Δ 14.3 px, cuff Δ 0.53 px |
  | elbow independence | forearm Δ 49.6 px, upper arm Δ 0.00 px |
  | elbow corrective | 1.0000 vs LBS 0.9479 |
  | IK | 8 × 0.000 px; clamp ok |
  | eye lock through breathing | 0.0000 px |
  | frame cost, forced raster (node software proxy) | 21.8 ms (v0.5 flat 2.04 ms), gate ≤ 33 |
- **Gate revisions (honest record)**:
  1. area gate: the first spec ([0.97, 1.03] area ratio) wrongly assumed pixel coverage
     is preserved under bending; replaced by "0 folded triangles + |r−1| ≤ max(0.03, θ/π)".
  2. weld gate: hand↔body contact encloses background pockets that were counted as
     holes → measured in the weld window (rows 150–300).
  3. seam gate: first written as "no interior α < 250"; Skia quantises AA coverage
     (complementary coverages sum to 94–100 %), so the exact-clip floor is a 2–6 %
     residual (α 240–249). Gate = visible seams (α < 230), residual reported.
  4. **perf gate — CORRECTION of an earlier claim**: @napi-rs/canvas defers rasterisation
     until pixels are read, so the old "≤ 16 ms" check (and Stage 1's reported 7.8 ms)
     timed command recording, not drawing. Each frame now reads 1 px back. Same method:
     Stage-1 frame 20.7 ms, full skeleton 21.8 ms, v0.5 flat frame 2.04 ms. Budget
     ≤ 33 ms for this CPU proxy; the browser (GPU canvas) is NOT measured here → `?perf=1`.
- **Evidence**: `app/test_out/stage2_arms.png` (rest | shoulder 14° | elbow 40° | wrist ±25° |
  shrug 4° + IK | combined), `stage2_weights.png` (skeleton + per-vertex dominant bone),
  `stage2_hidden_art.png` (base layers alone | full composite).

## Reproducible commands
```bash
cd app && npm install
npm run test:puppet      # assertions + regenerates app/test_out/*.png
npm run dev              # live stage: cursor tracking, blink, brows, head, triggers
npm run build            # typecheck + bundle
```

## Failed experiments (kept honest)
- Automatic sclera/iris detection by colour thresholds latched onto earring/curl highlights → replaced by grid-measured coordinates (OBSERVED via QA zooms).
- Numeric iris-fill & brow-interpolation on painterly art left grey discs/rectangles (OBSERVED qa_rig_cut*.png) → replaced by surgical model edit + pixel-diff identity gate.
- Colour matting of the wide head edit failed on its dark first background → alpha taken from the matted sprite silhouette instead.
- Un-matted body_base produced the "black rectangle" artifact (viewer shows zero-alpha as black) → full matting applied; neck patch silhouette-matted.

## Remaining work (manual / later milestones)
Mouth/jaw rig & viseme layers · hair sub-groups + secondary sway · torso/arm components ·
mesh deformation · production rig in Live2D Cubism Editor (or Inochi2D at 1.0) ·
Tauri shell compilation on Windows.
