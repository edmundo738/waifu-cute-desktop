# Companion Stage — app skeleton (Tauri 2 + React + TypeScript)

Runnable integration skeleton for the Waifu Cute Desktop companion.
**Verified in-browser** (Vite dev server, WebGL-free 2D canvas). **Not** a Live2D runtime yet.

## Run

```bash
cd app
npm install
npm run dev        # http://localhost:5173 (binds 0.0.0.0, preview-host friendly)
npm run build      # typecheck + production bundle into app/dist
```

## What is real here

| Piece | Status |
|---|---|
| Transparent full-body sprites (`public/sprites/`) | ✅ real alpha mattes of the six canon poses (`tools/make_sprites` step, matting verified on checkerboard) |
| `StaticSpriteRenderer` | ✅ real code; **placeholder motion only** (breathing scale, micro sway, cursor lean via 2D transforms). Not a rig. |
| `PuppetRenderer` + `src/puppet/*` | ✅ **component puppet v0.2**: eyeball/iris translation clipped to eye openings (independent X/Y limits), upper-lid partial/full blinks over the eyeball, independent brows, head with own smaller limits & slower smoothing; headless acceptance tests + evidence frames via `npm run test:puppet` |
| `CompanionStateMachine` | ✅ trigger → pose reactions with spec durations (wave 2.3 s, happy 2.0 s, surprised 1.55 s, playful 1.5 s, think cap) |
| `bridge.ts` | ✅ one subscription API over Tauri 2 events (`companion://trigger`) + browser keyboard/pointer fallback |
| Viseme mouth preview | ✅ cycles `expressions/viseme_*.png` art during the talk demo — **art preview, not mouth rigging** |
| `live2dAdapter.ts` | ✅ probe + lazy loader; resolves to null until a model exists (deps intentionally absent) |
| `src-tauri/` | ⚠️ configuration skeleton (Tauri 2 conf, capabilities, entrypoints) — **not compiled in the sandbox** (no Rust/webkit2gtk toolchain here) |

## Honesty rules baked into the UI

- A permanent banner states the renderer is a placeholder, not a rig.
- Status chip reports `renderer: static · placeholder, not rigged` or `live2d`.
- Model probe result is shown (`not found → static fallback`).
- Event log records every trigger → pose transition.

## Enabling Live2D later

1. Rig & export per `live2d/LIVE2D_PREPARATION.md` → drop into `public/models/companion/`.
2. `npm i pixi-live2d-display pixi.js`; obtain Cubism Core from Live2D under their license
   (`live2d/LICENSE_REVIEW.md`) and load it before the adapter import.
3. Map `animations/animations.json` triggers to `.motion3.json` groups of the same names.

## Tauri wrap (Windows 11 target)

`src-tauri/tauri.conf.json` points `devUrl` at Vite 5173 and `frontendDist` at `../app/dist`;
window preset: 480×720, transparent, undecorated, always-on-top — the desktop-companion form
factor. Build on a machine with the Tauri 2 prerequisites (Rust, WebView2 on Windows).
