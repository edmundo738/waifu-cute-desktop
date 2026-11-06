# Eye Tracking Specification (implemented in `app/src/puppet/`)

## Inputs (priority order)
1. **Webcam face-follow** (optional toggle; MediaPipe FaceLandmarker WASM, on-device):
   user's face centre (nose+forehead+chin landmarks) in the mirrored selfie frame →
   normalized gaze with gain 3.2 (`faceFollow.ts`); freshest source wins while <0.6 s old.
   No frames ever leave the machine.
2. **Cursor position**, mapped **relative to her eyes' real on-screen position**
   (canvas rect + view transform → `pointerToGaze`), NOT the window centre: cursor exactly
   over her face = neutral (0,0). Sensitivity radii 36 % viewport width / 40 % height;
   soft saturation |v|^0.85 for mid-range responsiveness; active while pointer <3 s old.
3. **Manual gaze targets** (UI buttons left/right/up/down/center → synthetic pointer events).
4. **Interaction gaze bias** (triggers add `gazeBias`, e.g. thinking → up-left).
5. **Idle gaze wander** (Lissajous ±0.35/±0.25, `idleGaze(t)`) when no other source is fresh.

## Outputs
- `gaze.x, gaze.y` (−1..1) → iris translation `dx = clamp(gaze.x)·5 px`, `dy = clamp(gaze.y)·3 px`
  (pose space; independent axes; MEASURED in selftest over 11 directions incl. diagonals/extremes).

## Constraints & behaviour
- Clip mask = opening ellipse (L (609,133) r13×10, R (655,135) r13×10): eyeball pixels never
  render outside it, whatever the math asks (acceptance 2–4).
- Smoothing: exponential, λ=10 (≈90 ms settle); no abrupt jumps (acceptance: smooth interpolation).
- Neutral resting position = gaze (0,0); return-to-neutral verified residual <0.01 (acceptance 8).
- Both eyes share one gaze vector but keep **independent anatomical placement** (each clipped
  to its own opening); coordination is natural by construction.
- Blinking is orthogonal: lid band drawn over the iris inside the same clip, so tracking
  continues correctly during partial/full blinks (acceptance 7; see blink_strip.png).
- Transitions cursor↔idle↔bias are parameter blends, not state snaps.

## Not implemented (documented, not faked)
- Per-eye convergence/divergence (both eyes translate identically within own masks).
- Saccade micro-jitter (smooth follow only).
- Gaze-driven eyelid squint (lids respond to blink + expression only).
