# Live2D Cubism Preparation — Stage D

Target runtime: **Windows 11 · Tauri 2 · React · TypeScript · Live2D Cubism (WebGL in WebView2).**
Golden rule: *a flattened PNG is not a rigged model.* This document + the scaffold assets
are the preparation; the rig itself is manual work in **Live2D Cubism Editor**.

## 1. What exists today (verified)

| Asset | Path | Reality |
|---|---|---|
| Layered PSD scaffold, 14 layers, RGBA, canvas 1264×843 | `layers/waifu_companion_scaffold.psd` | Real layered PSD (read-back verified with pytoshop). Layers are **rectangular crops of flat art** — no alpha mattes, no hidden-area completion. |
| Part crops (RGBA PNGs) | `layers/parts/part_01…14_*.png` | Same rectangles as the PSD layers, for inspection. |
| Part boxes (px + fractions of figure bbox) | `layers/parts_manifest.json` | Machine-readable separation plan. |
| Pose canon (6 poses) | `poses/` | Reference poses for personality & key poses — **not** rig inputs. |
| Animation specs (12) | `animations/` | What the rig must be able to perform. |

## 2. Required part tree for the rig (separation target)

```
Companion (root)
├─ hair_back            (puff silhouette behind head/shoulders)
│   ├─ curl_group_back_L / _R
├─ body
│   ├─ neck
│   ├─ torso            (cropped top + skin of chest/waist)
│   ├─ jacket_L / jacket_R (sleeves as separate deformers)
│   ├─ arm_L_upper → arm_L_fore → hand_L
│   ├─ arm_R_upper → arm_R_fore → hand_R
│   ├─ pants_hip → pants_leg_L / pants_leg_R (cargo pockets parented to legs)
│   └─ shoe_L / shoe_R
├─ head (deformer)
│   ├─ face_base        (skin, ears, nose)
│   ├─ brow_L / brow_R
│   ├─ eye_L / eye_R    (whites, iris, highlights)
│   ├─ eyelid_upper_L/R, eyelid_lower_L/R
│   ├─ mouth            (lips + interior + tongue for talk visemes)
│   ├─ hair_front       (puff crown + face-framing tendrils, 2–3 curl groups)
│   └─ accessories: earring_L, earring_R, necklace, navel piercing (parented to torso)
```

The 14 scaffold layers map onto this tree at *group* level; the Editor artist must
sub-divide (eyes vs lids vs brows, curl groups, arm chains) while cutting clean art.

## 3. Parameter plan (Cubism)

Standard: `ParamAngleX/Y/Z`, `ParamBodyAngleX/Y/Z`, `ParamEyeLOpen/ROpen`,
`ParamEyeBallX/Y`, `ParamBrowLY/RY`, `ParamMouthForm`, `ParamMouthOpenY`, `ParamBreath`.
Custom: `ParamHairSwayFront/Side/Back`, `ParamArmLRaise/Rotate`, `ParamArmRRaise/Rotate`,
`ParamHandRSign` (peace sign), `ParamPuffScale`.
Expression files (`.exp3.json`): happy, curious, surprised, wink, sad, angry, thinking —
one per canon expression in `expressions/`.
Physics: `physics3.json` for hair tendrils, puff, earrings, jacket sleeves (see
`animations/ANIMATION_SPEC.md` #6 for lag/amplitude targets).

## 4. Production pipeline (manual steps from here)

1. **Cut clean art** in Photoshop/Clip Studio: start from `waifu_companion_scaffold.psd`,
   split groups per §2, paint hidden areas (behind hair, under jacket, under lids…),
   export a single PSD with true alpha layers, canvas ≥ 2048 px wide if texture budget allows.
2. **Import PSD** into Live2D Cubism Editor → auto layer import.
3. **Mesh + deformers**: build the §2 hierarchy; mesh density higher on face/hands.
4. **Parameters & expressions**: bind §3 parameters; author the 7 `.exp3.json`.
5. **Physics**: hair/earring/sleeve pendulums per spec.
6. **Motions**: implement the 12 specs from `animations/` as `.motion3.json`.
7. **Export**: `model.moc3`, `model.2048/texture_00.png`, `model.model3.json`,
   physics/expression/motion JSONs → place under the app's `models/companion/` directory.
8. **Runtime**: Tauri 2 WebView2 + React + `pixi-live2d-display` (PixiJS ≥6, WebGL);
   load `model.model3.json` from app-local storage; fall back to static
   `poses/pose_01_neutral.png` sprite when WebGL is unavailable.
9. **QA**: run the 12 animations; check silhouette vs `poses/pose_reference_sheet.png`.

## 5. Guardrails

- Do not ship any Live2D SDK file, Cubism Core binary or third-party model in this repo
  (see `LICENSE_REVIEW.md`). Cubism Core is fetched by the developer from Live2D under
  their license terms at build time.
- Do not claim "rigged/animated" until a `.moc3` + motions exist and render in the app.
