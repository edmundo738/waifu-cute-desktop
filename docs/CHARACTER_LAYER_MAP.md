# Character Layer Map — what actually exists vs what is missing

Source of truth: `poses/pose_01_neutral.png` (canon). All rig assets in `app/public/rig/`,
coordinates in `app/public/rig/manifest.json` (pose pixel space, 1264×843).

## Available layers (cut/derived, verified)

| Layer | Asset | Origin | Notes |
|---|---|---|---|
| body (headless) | `rig/body_base.png` | matte of canon pose, head box erased | silhouette alpha from matted sprite |
| neck/collar backing | `rig/neck_patch.png` | canon crop (585,160)-(678,245) | silhouette-matted; seam cover under head |
| head/face base | `rig/head_base.png` | **surgical edit** of canon head crop | empty openings (sclera fill), no brows, no upper lash; identity diff mean 2.36 / p95 8.0 outside edit mask |
| eyeball/iris L+R | `rig/iris_L/R.png` | cut from canon art (iris+pupil+highlight) | feathered ellipse alpha |
| upper lid L+R | `rig/lid_L/R.png` | cut from canon art (skin + lash stroke) | stretched by blink inside opening clip |
| brow L+R | `rig/brow_L/R.png` | cut from canon art (dark stroke alpha) | independent translation |
| full-body poses ×6 | `sprites/companion_*.png` | matted canon poses | gesture states (wave etc.) |
| mouth visemes A/I/U/E/O | `expressions/viseme_*.png` | generated art references | **preview only**, not rig layers |

## Measured anatomy (pose space)

- Eye openings (clip ellipses): L centre (609,133) r(13,10) · R centre (655,135) r(13,10)
- Iris boxes: L (602,127)-(619,143) · R (647,129)-(664,145)
- Lid boxes: L (595,124)-(624,133) · R (641,126)-(670,135)
- Brow boxes: L (594,107)-(625,125) · R (638,109)-(671,127)
- Head box (512,0)-(752,212) · neck pivot (630,198) · mouth box (615,158)-(646,176)

## Mouth component layers (v0.4, verified)

| Layer | Asset | Origin | Notes |
|---|---|---|---|
| face base (mouthless) | `rig/head_base_nm.png` | surgical edit of canon head | lips removed, skin/philtrum preserved |
| jaw / lower-lip patch | `rig/mouth_jaw.png` | cut from canon art | feathered ellipse alpha; rides jawDy ≤5.5 px; stops above chin contour |
| closed lips (rest) | `rig/mouth_closed.png` | cut from canon art | feathered rrect alpha; crossfades out as opening grows |
| oral cavity + teeth + tongue | procedural vector | `MouthRenderer.ts` | clipped to cavity path; teeth ≤45 % cavity height; tongue only o≥0.5 |
| upper-lip seam | procedural stroke | `MouthRenderer.ts` | anime line on cavity ceiling while open |

## Hair secondary-motion layers (v0.5, verified)

| Layer | Asset | Origin | Notes |
|---|---|---|---|
| puff crown overlay | `rig/hair_puff.png` | feathered cut of canon hair | lag + idle sway, sub-pixel at silhouette |
| tendril L / R overlays | `rig/hair_tendril_L/R.png` | feathered cuts of side curls | drawn in front of face edge; lag λ3 |

Not separated (documented, not faked): earrings (gold-on-skin ghost risk), forehead
wisps, back hair mass (not visible in front view).

## Missing components (must be authored/cut later — NOT faked)

- Lower-lid independent layer (currently part of face base)
- Mouth: corner asymmetry / smile curls, lip texture at large openings (procedural lips are minimal by design); viseme art sheets remain reference only
- Hair sub-groups (puff crown, side tendrils, back mass) for secondary motion
- Arm chains (upper/fore/hand) and torso split for gesture rigging
- Eye highlights as separate layer (currently baked into iris sprite)
- Sclera as separate backing layer (currently painted into head_base openings)
