# Limitations & Manual Work Remaining — Stage E (honest status)

Everything below is stated plainly: what is **done & verified**, what is **partial**,
and what is **not done / manual**. Re-verify any time with `python3 tools/validate_package.py`.

## Done & verified
1. Canonical character specification (`docs/CHARACTER_DESIGN.md`) from the three approved references.
2. Six full-body poses, single-figure, consistent identity, shoes/hands/hair uncropped (`poses/`).
3. Combined pose reference sheet and expression reference sheet (`tools/compose_sheets.py` output).
4. Expression references: 6 canon crops from the approved sheet + 3 generated high-res close-ups.
5. Layered PSD scaffold with 14 RGBA layers (pytoshop read-back verified) + part crops + manifest + sampled palette.
6. Animation specification for 12 animations (markdown + JSON) with parts, start/end, duration, loop, trigger.
7. Live2D preparation docs: part tree, parameter plan, pipeline; license review with sources.
8. Reproducible tooling in `tools/`.

## Partial
1. **Wink high-res close-up**: generation hit the per-turn image limit; `expressions/canon_wink.png`
   (crop from the approved sheet) is the interim reference. Regenerate next session and drop it into `expressions/`.
2. **Layer separation**: the PSD is a scaffold of rectangular crops — no alpha mattes, no hidden-area
   completion, groups not sub-divided (eyes/lids/brows/mouth interior, arm chains, curl groups). See `layers/PARTS_INVENTORY.md`.
3. **Poses 02–04 provenance**: original generations contained duplicate figures; the shipped poses are
   pixel-isolated single figures; untouched originals kept in `poses/_raw/` for audit.
4. **Canon expression crops are low-resolution** (~124×133 px) because they are extracts of the approved sheet.
5. **Palette hexes are sampled approximations** (region medians), not artist-decided brand values.

## Not done — manual work required
1. **Live2D rig**: no `.moc3`, no `.model3.json`, no textures, no physics/expression/motion files.
   Requires Live2D Cubism Editor (licensed seat) following `live2d/LIVE2D_PREPARATION.md` §4.
2. **Clean cut artwork**: true silhouettes + hidden-area paint (Photoshop/Clip Studio).
3. **Mouth viseme chart** (A/I/U/E/O/closed) for talk animation — authored in Editor, not illustrated here.
4. **Motion files**: the 12 specs in `animations/` are design documents only.
5. **Runtime integration**: no Tauri 2 app skeleton exists in this repo yet; integration snippet lives in
   `docs/TECHNICAL_INSTRUCTIONS.md` §5.
6. **Art-direction pass**: generated assets carry minor likeness drift between images (pendant, curl
   pattern). Compare against `poses/pose_reference_sheet.png` before promoting any new asset to canon.

## Explicit non-claims
- No image in this package is animated, rigged or layered beyond the documented scaffold.
- No Live2D SDK/Core binary, no third-party model, no unlicensed asset is included.
- AI-assisted generation was used for poses/close-ups; provenance = this repository's history + `poses/_raw/`.
