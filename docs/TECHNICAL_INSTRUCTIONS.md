# Technical Instructions — pipeline, tooling, integration

## 1. Repository tooling (Python 3, `pillow numpy pytoshop six`)

| Script | Purpose |
|---|---|
| `tools/compose_sheets.py` | Rebuilds `poses/pose_reference_sheet.png` (figure-trimmed 3×2 grid with captions). |
| `tools/build_psd_scaffold.py` | Rebuilds `layers/parts/*.png`, `layers/parts_manifest.json`, `layers/color_palette.json`, `layers/waifu_companion_scaffold.psd` from `poses/pose_01_neutral.png`. Edit the `PARTS` fraction table to adjust boxes. |
| `tools/validate_package.py` | Verifies every deliverable (existence, size, image dims, PSD layer read-back, JSON parse) and rewrites `docs/VALIDATION_REPORT.md`. |

## 2. Stage pipeline as executed

- **Stage A** — references inspected; canon written to `docs/CHARACTER_DESIGN.md`.
- **Stage B** — six poses generated against the references; duplicate-figure outputs
  isolated pixel-exact ( originals in `poses/_raw/` ); sheet composed.
- **Stage C** — canon expression grid cropped from `references/ref_sheet_a.png`;
  high-res close-ups generated; expression sheet composed.
- **Stage D** — part boxes defined as fractions of the figure bbox; part crops +
  14-layer RGBA PSD scaffold written and read-back verified; Live2D docs authored.
- **Stage E** — `tools/validate_package.py` → `docs/VALIDATION_REPORT.md`; limitations recorded.

## 3. From scaffold to rig (manual, Cubism Editor)

Follow `live2d/LIVE2D_PREPARATION.md` §4. Key points: cut true alpha silhouettes from the
scaffold layout; paint hidden areas; sub-divide face (eyes/lids/brows/mouth interior) and
arms (upper/fore/hand); keep layer names from `layers/PARTS_INVENTORY.md` so docs stay valid.

## 4. Texture & naming conventions

- Export textures at 2048×2048 (`model.2048/texture_00.png`); keep the face in the upper-left quadrant for mip quality.
- Files: `model.moc3`, `model.model3.json`, `model.physics.json`, `expressions/*.exp3.json`, `motions/*.motion3.json`.
- App-side directory: `models/companion/` (never commit Cubism Core or SDK binaries — see `live2d/LICENSE_REVIEW.md`).

## 5. Runtime integration — implemented skeleton (`app/`)

The integration sketch is now **real, build-verified code** in `app/` (see `app/README.md`):

- `src/companion/staticRenderer.ts` — placeholder renderer: transparent canon sprites with
  transform-only idle (breathing 3.2 s, sway 4.5 s, cursor lean). Not a rig, labelled as such in-UI.
- `src/companion/stateMachine.ts` — trigger → pose reactions using the durations from
  `animations/animations.json` (wave 2.3 s, happy 2.0 s, surprised 1.55 s, playful 1.5 s…).
- `src/companion/bridge.ts` — one subscription API over Tauri 2 `companion://trigger` events
  plus browser keyboard/pointer fallback; hotkeys G/C/T/N/P/V.
- `src/companion/live2dAdapter.ts` — probes `models/companion/model.model3.json`
  (content-type checked to defeat Vite's SPA-fallback 200s) and lazy-loads
  `pixi-live2d-display` + `pixi.js` only when a model exists; otherwise null → static fallback.
- `src-tauri/` — Tauri 2 configuration skeleton (transparent 480×720 always-on-top window,
  `fire_trigger` command emitting `companion://trigger`). **Not compiled in the sandbox.**
- WebView2 (Windows 11) provides WebGL2 for the future Live2D path; the static renderer is
  deliberately WebGL-free so GPU-blocked environments still show the companion.
- Tauri/bridge events map 1:1 to the triggers listed in `animations/animations.json`.

## 6. QA checklist before accepting new assets into canon

1. Side-by-side vs `poses/pose_reference_sheet.png` (face, hair silhouette, outfit, gold accents).
2. Full-body framing: shoes, hands, hair tips visible.
3. Background clean neutral; no text/watermark/flags.
4. Run `tools/validate_package.py`; commit assets with provenance note.
