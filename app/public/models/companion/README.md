# Live2D model drop-in directory

Place the rigged Cubism export here when it exists:

```
models/companion/
  model.model3.json
  model.moc3
  model.2048/texture_00.png
  model.physics.json
  expressions/*.exp3.json
  motions/*.motion3.json
```

The companion stage probes `model.model3.json` at startup (`src/companion/live2dAdapter.ts`):
- **found** → Live2D renderer path (requires adding `pixi-live2d-display`, `pixi.js` and the
  proprietary Cubism Core under the Live2D license terms — see `live2d/LICENSE_REVIEW.md`).
- **not found** → static-sprite placeholder renderer (current default).

Do **not** commit SDK binaries, Cubism Core or third-party models here.
