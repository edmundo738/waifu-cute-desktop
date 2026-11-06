# License & Redistribution Review — Live2D stack

Verified 2026-11-06 against live2d.com and npm. Conclusion first: **development can
proceed with no fees; a public release needs a quick publisher-classification check;
nothing unlicensed is included in this repository.**

## 1. Live2D Cubism SDK (Native / Web)
- Download and development are free, subject to agreeing to the Live2D Proprietary
  Software License Agreement and the Live2D Open Software License Agreement at download
  time [2](https://www.live2d.com/en/sdk/about/).
- Publishing content that uses the SDK requires the **SDK Release License (Publication
  License Agreement)**, completed at least one month before release — **except** for
  General Users and Small-Scale Enterprises (annual sales < ¥10 million), who are exempt
  [3](https://help.live2d.com/en/sdk/sdk_001/), [1](https://www.live2d.com/en/sdk/license/).
- The exemption **does not apply to Expandable Applications** (e.g. avatar systems where
  users supply/extend models). If Waifu Cute Desktop ever lets users load their own
  models, a separate contract is required regardless of company size
  [1](https://www.live2d.com/en/sdk/license/).
- For reference, mid/large-scale publishers pay per plan (e.g. one-time purchase plans
  from ¥100,000 / unit royalties ¥40) [4](https://www.live2d.com/en/sdk/license/purchase_plan02/).

## 2. Cubism Core (`live2dcubismcore.min.js`)
- Proprietary Live2D component required by web renderers. It is **not vendored here**;
  developers obtain it from Live2D under the agreements above and wire it into the build.

## 3. pixi-live2d-display (renderer bridge)
- License: **MIT** [3](https://www.npmjs.com/package/pixi-live2d-display).
- Requirements: PixiJS > 6, browser with WebGL + ES6 (WebView2 on Windows 11 qualifies)
  [3](https://www.npmjs.com/package/pixi-live2d-display).
- For Cubism models it needs the proprietary Cubism Core loaded separately (see §2).

## 4. Tauri 2 / React / TypeScript
- Tauri 2: MIT or Apache-2.0; React: MIT; TypeScript: Apache-2.0. No redistribution
  concerns for a desktop app bundle.

## 5. Character art & model ownership
- All character art in this package was produced in-project from the user's approved
  references; no third-party model, texture or sample asset is used. The character IP
  stays with the project owner. (AI-generated provenance is recorded in `docs/LIMITATIONS.md`.)

## 6. Cubism Editor (rigging tool)
- Separate Live2D product with its own license (free trial available; paid plans for
  commercial use). Rigging work in §4 of `LIVE2D_PREPARATION.md` requires a licensed seat.

## 7. Action items before public release
1. Confirm publisher classification (General User / Small-Scale Enterprise vs larger).
2. Decide whether user-loaded models will ever be supported → Expandable Application test.
3. Accept the Live2D agreements at SDK/Core download; keep records.
4. If classification changes, sign the SDK Release License ≥1 month before shipping.
