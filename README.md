# Waifu Cute Desktop — Character Design & Animation Package v1

Production package for the **Waifu Cute Desktop** companion character: the approved
visual canon, six animation reference poses, expression references, Live2D preparation
assets and the technical documentation needed to take her from static art to a rigged,
animated desktop companion on Windows 11 (Tauri 2 + React + TypeScript + Live2D Cubism).

> **Read this first:** the six poses design her *personality*. The Live2D rig is what
> will make her *move*. Both jobs exist in this package, and they are kept separate on
> purpose. Nothing in this repository is animated or rigged yet — see
> [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md) for exactly what is complete and what
> still requires manual work.

## Folder structure

| Folder | Contents | Status |
|---|---|---|
| `references/` | The three approved original reference images (+ small QA crops) | ✅ complete (canon) |
| `poses/` | Six full-body pose illustrations + combined `pose_reference_sheet.png` | ✅ complete |
| `expressions/` | 6 canon expression crops, 4 generated high-res close-ups (incl. wink), 5 viseme mouth-shape references, combined sheets | ✅ complete |
| `layers/` | 14 part crops, `parts_manifest.json`, sampled `color_palette.json`, layered `waifu_companion_scaffold.psd` | ⚠️ scaffold only — not cut/matted art |
| `animations/` | `ANIMATION_SPEC.md` + machine-readable `animations.json` (12 animations) | ✅ spec complete (no motion files — by design, see limitations) |
| `live2d/` | `LIVE2D_PREPARATION.md` (parts tree, parameters, pipeline) + `LICENSE_REVIEW.md` | ✅ docs complete (rigging = manual, Cubism Editor) |
| `docs/` | `CHARACTER_DESIGN.md`, `TECHNICAL_INSTRUCTIONS.md`, `LIMITATIONS.md`, `VALIDATION_REPORT.md` | ✅ complete |
| `tools/` | Reproducible scripts: `compose_sheets.py`, `build_psd_scaffold.py`, `validate_package.py` | ✅ complete |
| `app/` | Companion stage: React + TS + Vite, **component puppet renderer** (eye/head/brow rig with clip masks, limits, smoothing), static fallback, Live2D probe/adapter, Tauri 2 config | ✅ puppet headless-tested + browser build verified (Tauri shell not compiled here) |

## The character in one paragraph

A beautiful young adult Black African woman with deep brown skin, large expressive
brown eyes and voluminous natural African curly hair styled in a high puff with loose
curls framing her face. Gold oval hoop earrings, a delicate gold chain with a small
gold Africa-contour pendant, a black cropped camisole, an oversized black jacket draped
off the shoulders, black cargo trousers with gold hardware, a black belt with a gold
square buckle and black/white high-top sneakers with gold details. ~168 cm (5'6").
Confident, warm, intelligent, expressive. Full canonical specification:
[`docs/CHARACTER_DESIGN.md`](docs/CHARACTER_DESIGN.md).

## Quick start

```bash
python3 tools/validate_package.py     # re-verify every deliverable, rewrites docs/VALIDATION_REPORT.md
python3 tools/compose_sheets.py       # rebuild poses/pose_reference_sheet.png from the six poses
python3 tools/build_psd_scaffold.py   # rebuild layers/ parts, manifest, palette and scaffold PSD
```

Requires Python 3 with `pillow`, `numpy` and `pytoshop` (`pip install pillow numpy pytoshop six`).

## Honesty contract

- The poses and expressions are **static reference illustrations**, not animation.
- `layers/waifu_companion_scaffold.psd` is a **layered separation plan** (14 verified
  layers), *not* cut artwork; the actually working rig layers live in `app/public/rig/`
  (matte cut + one surgical head edit, identity-verified by pixel diff).
- The `puppet` renderer **genuinely animates** eye/head/brow components (clip masks,
  independent limits, smoothing, partial blinks) — verified by `npm run test:puppet` and
  the evidence frames in `app/test_out/`. It is a custom micro-engine, **not** a
  Live2D/Inochi2D model; mouth, hair groups and body components are later milestones.
- No `.moc3`, no motion files exist; the Live2D adapter is a lazy-loaded placeholder that
  stays dormant until a real licensed model is added.
- No unlicensed Live2D SDK, model or third-party asset is included; see
  [`live2d/LICENSE_REVIEW.md`](live2d/LICENSE_REVIEW.md) and
  [`docs/ANIMATION_ENGINE_EVALUATION.md`](docs/ANIMATION_ENGINE_EVALUATION.md).
