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
9. High-res **wink close-up** (completing the four close-ups) and five **viseme mouth-shape
   art references** (A/I/U/E/O) with a combined viseme sheet.
10. Runnable **companion stage skeleton** (`app/`): transparent sprite mattes, placeholder
    static renderer, reaction state machine, Tauri/browser event bridge, Live2D probe + lazy
    adapter; `npm run build` passes and the dev server serves sprites and the model probe correctly.
11. **Component puppet v0.2** (eye/head/brow milestone M2–M4): clipped eyeball translation,
    partial/full blink lids, independent brows, head with own limits/smoothing; headless
    acceptance tests (`npm run test:puppet`) and evidence frames in `app/test_out/`;
    default renderer in the app whenever `public/rig/manifest.json` is present.
12. **v0.3**: gaze axis relative to her on-screen eye position (10/10 selftest), optional
    on-device webcam face-follow (MediaPipe WASM) and local-LLM brain hook (LM Studio
    OpenAI-compatible) with honest canned-reply fallback when offline. Caveats: face-follow
    needs camera permission and downloads the WASM/model from CDN on first use; the brain
    needs LM Studio running with CORS enabled (in the Tauri shell the call moves to Rust).
14. **v0.5 secondary motion & expressions**: hair puff/tendrils with drag-behind lag +
    idle sway, per-eye wink, smile parameter (corner lift + squint) wired to triggers and
    chat sentiment (23/23 selftest). Overlay technique caps hair amplitudes at sub-pixel
    near the silhouette (echo control); earrings/forehead-wisps intentionally not separated.
13. **v0.4 Mouth Puppet**: opening×shape component with jaw patch, clipped oral cavity,
    gradual teeth/tongue and speech timeline (19/19 selftest + evidence frames). Still
    procedural-minimal by design: no lip texture detail at extreme openings, no asymmetric
    smile corners, no jaw-driven neck/torso compensation yet.

## Partial
1. **Viseme references are art guidance only**: `expressions/viseme_*.png` illustrate A/I/U/E/O
   on her face; rig-quality mouth meshes and `.motion3.json` talk curves are still authored in Cubism Editor.
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
5. **Tauri shell compilation**: `app/src-tauri/` is a configuration skeleton only — not compiled in
   the sandbox (no Rust/webkit2gtk toolchain). The web stage itself is type-checked, built and
   browser-verified; the Live2D renderer path is untested (no model exists to load).
6. **Art-direction pass**: generated assets carry minor likeness drift between images (pendant, curl
   pattern). Compare against `poses/pose_reference_sheet.png` before promoting any new asset to canon.

## Explicit non-claims
- No image in this package is animated, rigged or layered beyond the documented scaffold.
- No Live2D SDK/Core binary, no third-party model, no unlicensed asset is included.
- AI-assisted generation was used for poses/close-ups; provenance = this repository's history + `poses/_raw/`.
