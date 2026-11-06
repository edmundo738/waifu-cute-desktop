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
