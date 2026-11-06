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
