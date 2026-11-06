# Animation Engine Evaluation (Live2D vs Inochi2D vs custom)

Verdict first: **both existing engines are viable production targets but neither can be
rigged or verified in this environment** (both require a GUI authoring tool and manual
artist work; Inochi2D is additionally beta). Therefore the **custom lightweight component
engine** is implemented now (user rule C), designed so a future Live2D/Inochi2D rig drops
in behind the same `CompanionRenderer` interface.

## A. Live2D Cubism
- SDK free to download/develop; publishing requires the SDK Release License except
  individuals/small enterprises <¥10M/yr; exemption void for Expandable Applications
  ([help.live2d.com](https://help.live2d.com/en/sdk/sdk_001/), [live2d.com](https://www.live2d.com/en/sdk/license/)).
- Rigging requires **Cubism Editor** (GUI, licensed seat) — cannot run headless here. [FACT]
- Web runtime needs proprietary Cubism Core + renderer (pixi-live2d-display MIT bridge).
  [FACT — see live2d/LICENSE_REVIEW.md]
- Model requirements: layered PSD cut by an artist → .moc3 export. [FACT]

## B. Inochi2D / Inochi Creator
- License: **BSD 2-clause, free, commercial use allowed** ([docs FAQ](https://docs.inochi2d.com/en/latest/inochi2d/faq.html),
  [unofficial wiki](https://i2d.richardn.me/en:faq:start)). [FACT]
- Maturity: "still heavily work-in-progress… we do still not recommend using it in a
  production setting" during beta ([GitHub wiki FAQ](https://github.com/Inochi2D/inochi2d/wiki/Frequently-Asked-Questions)). [FACT]
- PSD import exists but is WIP: blending modes/visibility may load wrong; some exporters'
  PSDs fail outright ([wiki](https://github.com/Inochi2D/inochi2d/wiki/Frequently-Asked-Questions),
  [unofficial FAQ](https://i2d.richardn.me/en:faq:start)). [FACT]
- Rigging = **Inochi Creator GUI** (Early Access; 0.7.0 crashes on Intel iGPU)
  ([Steam](https://store.steampowered.com/app/2108550/Inochi_Creator/), [DUB](https://code.dlang.org/packages/inochi-creator/0.7.0)). [FACT]
- Incompatible with Live2D models; PSDs cut for Live2D "for the most part" compatible
  ([docs FAQ](https://docs.inochi2d.com/en/latest/inochi2d/faq.html)). [FACT]
- Web/Tauri runtime: no first-party turnkey WebGL/WebView runtime verified here. [UNKNOWN → needs spike]

## C. Custom component engine (implemented)
Justification per user rule: existing engines cannot satisfy "genuinely animated and
testable **now**" because their authoring pipelines are GUI+manual and unavailable in a
headless sandbox. Scope kept minimal and generic:
layered sprites · clip masks · independent transforms · parameter-driven animation ·
interpolation · state management · eye constraints · head movement · expression control.
Not implemented yet: mesh deformation, physics simulation. [MEASURED by selftest]

## Decision record
1. Ship puppet v0.2 (custom) as the living companion today. [DONE]
2. Keep Live2D as primary production-rig target (mature tooling, Tauri/React path known).
3. Keep Inochi2D as license-free fallback; re-evaluate at its 1.0; its PSD compatibility
   means our future cut PSD serves both engines.
4. Never bundle SDK/Core binaries; verify licenses at integration time (live2d/LICENSE_REVIEW.md).
