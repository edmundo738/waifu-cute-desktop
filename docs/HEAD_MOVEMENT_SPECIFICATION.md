# Head Movement Specification (implemented in `app/src/puppet/`)

## Relationship to gaze
Head direction takes the **gaze vector as one input** (`headTarget(gaze, limits)`), never the
eye offset value. Eyes remain fully functional with the head frozen (acceptance 5).

## Limits (independent, smaller than eyes)
- Rotation: ±4° about the neck pivot (630,198).
- Translation: ±6 px x, ±3 px y (pose space).
- Mapping: `rot = clamp(gaze.x·0.6·4°)`, `dx = clamp(gaze.x·0.5·6)`, `dy = clamp(gaze.y·0.4·3)`
  → at full gaze the head uses 60 %/50 %/40 % of its own range: subtler by design (acceptance 6).

## Smoothing (its own, slower)
- λ=5 for rot/dx/dy vs eyes λ=10 → head lags eyes naturally; convergence verified
  (|Δ|<0.05 after 4 s simulated, MEASURED in selftest).

## Composition inside the head group
Rotation + translation apply to the whole head group (face base, irises, lids, brows), so
every facial component stays anatomically aligned (acceptance 9: no gaps — neck patch covers
the body seam; silhouette alpha prevents background leaks).

## Secondary motion (not yet implemented)
- Hair lag/counter-sway (needs hair sub-group layers — see CHARACTER_LAYER_MAP.md).
- Neck/torso compensation (needs torso component — milestone M5+).

## Anti-mechanical rules
- Head never copies eye rotation 1:1; amplitudes capped; exponential easing only;
  idle micro-sway (0.8 px vertical breath coupling) keeps the head alive at rest.
