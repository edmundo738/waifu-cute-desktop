# Eye Animation Architecture (component puppet, v0.2)

**Status: IMPLEMENTED & TESTED** for the eye component (M2–M3), head (M4) and brows.
Evidence: `app/test_out/gaze_3x3.png`, `blink_strip.png`, `combo_expressions.png`;
assertions in `app/src/puppet/selftest.node.ts` (`npm run test:puppet`).

## 1. Principle

The face is a **layered composition of independently animated components**, not a picture
with cursor effects on top. The eye is the reference component; every future component
(torso, arms, hair groups) reuses the same primitives: *sprite layer + pivot + parameter
transform + clip mask + independent limits + smoothing*.

## 2. Layer stack (back → front), head group transformed as one unit

1. `body_base` — canon pose matte, head region erased (transparent hole).
2. `neck_patch` — neck/collar backing under the head (silhouette-matted), hides the seam.
3. **head group** (pivot = neck `(630,198)`; rot ±4°, translate ±6/±3 px, own smoothing):
   1. `head_base` — face with **empty eye openings** (iris/pupil/upper-lash removed,
      openings filled flat sclera; brows removed) — surgical edit of the canon head,
      identity verified by pixel diff (mean |Δ| 2.36 outside edit mask, p95 8.0).
   2. `iris_L/R` — eyeball/iris/pupil assemblies cut from the canon art, **behind the lids**,
      translated by the clamped gaze offset, **clipped to the opening ellipse**.
   3. `lid_L/R` — upper-lid bands (skin + lash stroke from the canon art), clipped to the
      opening, stretched downward by `blink ∈ [0,1]` (partial blinks are valid states).
   4. `brow_L/R` — independent brow sprites, translated by expression intensity.

## 3. Movement model

- Gaze controller outputs `dx,dy` = `clamp(gaze.x)·limit_x`, `clamp(gaze.y)·limit_y`
  (independent axes; defaults ±5 px / ±3 px in pose space).
- The opening ellipse is a **clip mask**: even if a calculation demanded more, no eyeball
  pixel is ever drawn outside the anatomical opening (acceptance 2 & 3).
- No whole-eye rotation: controlled **translation** of the eyeball assembly, per spec.
- Blinking interacts correctly with gaze and masks: the lid is drawn *after* the iris
  inside the same clip, so a blink covers the eyeball at any gaze direction (acceptance 7).
- Head uses gaze direction as *one input* with its own limits (±4°, ±6/±3 px), its own
  slower smoothing (λ=5 vs eyes λ=10), and remains optional (eyes work with head frozen).

## 4. Parameter list (puppet v0.2)

`gaze.x, gaze.y` (−1..1) · `blink` (0..1) · `browRaise` (−1..1) · `headRot, headDx, headDy`
· `breathPhase` (s). Interpolation: exponential smoothing (`smoothDamp`), blink envelope
close 0.08 s / hold 0.02 s / open 0.15 s.

## 5. What this is NOT

Not a mesh-deformation engine (no vertex grids yet), not Live2D/Inochi2D. Mesh deformation
and mouth/jaw components are documented next milestones (`IMPLEMENTATION_AND_TEST_REPORT.md`).
