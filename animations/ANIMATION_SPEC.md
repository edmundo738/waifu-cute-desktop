# Animation Specification v1 — Waifu Cute Desktop Companion

Scope: design specification for the first 12 animations of the Live2D model.
These are **specs**, not motion files. They become `.motion3.json` / parameter curves
inside Live2D Cubism Editor (see `live2d/LIVE2D_PREPARATION.md`). Design principle:
subtle, natural movement — never exaggerated robotic motion.

Parameter naming follows Live2D Cubism conventions (`ParamAngleX/Y/Z`, `ParamEyeLOpen`,
`ParamEyeBallX/Y`, `ParamBrowLY/RY`, `ParamMouthForm`, `ParamMouthOpenY`,
`ParamBodyAngleX`, `ParamBreath`, plus custom `ParamHairSway*`, `ParamArmL/R*`).

---

### 1. idle_breathing
- **Parts:** torso (chest scale), shoulders, head (micro nod), jacket sleeves (follow).
- **Start → end:** chest scale 1.000 → 1.012 peak → 1.000; shoulders Y 0 → +0.6 % → 0; head angle X 0 → +0.4° → 0.
- **Duration:** 3.2 s cycle (inhale 1.4 s ease-in, exhale 1.8 s ease-out).
- **Loop:** yes, continuous default idle.
- **Trigger:** always on when no higher-priority motion plays.

### 2. blink
- **Parts:** upper eyelids (both), slight lower-lid rise.
- **Start → end:** `ParamEyeLOpen/ROpen` 1 → 0 (0.08 s) → hold 0.02 s → 1 (0.15 s).
- **Duration:** ≈ 0.25 s per blink.
- **Loop:** no; randomised interval 2.8–5.2 s (occasional double-blink, 5 % chance).
- **Trigger:** idle timer; suppressed while `surprised` or `wink` is active.

### 3. eye_movement
- **Parts:** eyeballs (`ParamEyeBallX/Y` ±1), micro head assist (±1°).
- **Start → end:** saccade to new target in 0.10–0.14 s (ease-out), hold 0.6–2.4 s.
- **Duration:** continuous sequence of saccades + holds.
- **Loop:** yes (random walk within ±0.6 when nothing to look at).
- **Trigger:** idle; overridden by `cursor_tracking`.

### 4. cursor_tracking
- **Parts:** eyeballs (±1), head (`ParamAngleX/Y` ±10°, `ParamAngleZ` ±3°), torso lean ±2°.
- **Start → end:** current gaze → cursor-mapped target; critically-damped follow, lag 0.12 s, settle ≈ 0.25 s; head leads eyes by 60 % of range.
- **Duration:** continuous while pointer moves; eases back to idle gaze 1.5 s after pointer rests.
- **Loop:** no (event-driven continuous).
- **Trigger:** Tauri window `pointermove` events (normalised to model space).

### 5. head_sway (small head movements)
- **Parts:** head (`ParamAngleZ` ±2°, `ParamAngleX` ±3°), neck follow.
- **Start → end:** sine drift around neutral, two overlapped frequencies (4.5 s and 6.5 s) so it never looks periodic.
- **Duration:** continuous.
- **Loop:** yes.
- **Trigger:** always on under idle priority.

### 6. hair_movement
- **Parts:** front tendrils, side curl groups, puff crown (3 deformers), earrings (secondary).
- **Start → end:** `ParamHairSway*` ±0.5–1.0°, phase-lagged 0.15 s (front), 0.25 s (side), 0.35 s (back) behind head motion; earrings pendulum ±4° lag 0.2 s.
- **Duration:** continuous physics simulation (physics3.json), not keyframes.
- **Loop:** yes (physics-driven).
- **Trigger:** any head/body motion; mild ambient sway at idle (±0.2°).

### 7. smile
- **Parts:** mouth (`ParamMouthForm` 0 → +0.6), cheeks raise, lower lids +10 %, brows +0.1.
- **Start → end:** neutral → warm smile in 0.40 s ease-in-out; hold; release 0.50 s.
- **Duration:** hold = emotion duration (default 2.0 s).
- **Loop:** no.
- **Trigger:** greeting start, positive sentiment from dialogue engine, user compliment.

### 8. talk (mouth movements)
- **Parts:** jaw/mouth (`ParamMouthOpenY` 0–1), mouth form (±0.3 per viseme), slight head bob ±1° per stressed syllable.
- **Start → end:** viseme sequence A/I/U/E/O + closed, driven by TTS phonemes; 80–160 ms per viseme with 40 ms co-articulation blends.
- **Duration:** = utterance length.
- **Loop:** no; streams while audio plays.
- **Trigger:** TTS playback events (per-phoneme timestamps from the voice pipeline).

### 9. wave
- **Parts:** right upper arm, forearm, hand, jacket sleeve R (follow), head tilt +4°, smile +0.4.
- **Start → end:** arm raise 0.50 s ease-out → hand oscillates ±14° twice at 2.2 Hz (0.90 s) → lower 0.55 s ease-in.
- **Duration:** ≈ 2.3 s total.
- **Loop:** no.
- **Trigger:** app launch, user returns to desktop after >5 min, chat greeting detected.

### 10. think
- **Parts:** right forearm + hand to chin, eyes up-left (`ParamEyeBallX` −0.5, `Y` +0.5), brow inner +0.2, mouth form −0.2 (pout), head tilt −3°.
- **Start → end:** hand raise 0.60 s → gaze shift 0.30 s → hold with micro eye drift → release 0.60 s.
- **Duration:** hold = processing time (cap 6 s, then shrug variant later).
- **Loop:** no.
- **Trigger:** long-running task, ambiguous user query, "hmm" dialogue line.

### 11. surprised_reaction
- **Parts:** brows (+0.8), eyes (`ParamEyeLOpen/ROpen` → 1.2), mouth (`ParamMouthOpenY` 0.4), head back (`ParamAngleX` −3°), hands lift ±(shoulder rot 8°), hair puff slight expand (deformer scale 1.02).
- **Start → end:** onset 0.25 s (fast in) → hold 0.80 s → decay 0.50 s to idle.
- **Duration:** ≈ 1.55 s.
- **Loop:** no.
- **Trigger:** unexpected notification, error event, sudden loud input, easter eggs.

### 12. playful_wink
- **Parts:** left eyelid (`ParamEyeLOpen` 1 → 0), left brow +0.3, mouth form +0.4 (cheeky grin), head tilt +5°, optional peace-sign hand (reuse wave arm curve at 60 % amplitude).
- **Start → end:** close 0.20 s → hold 0.35 s → open 0.25 s.
- **Duration:** ≈ 0.80 s (+0.9 s if hand sign used).
- **Loop:** no.
- **Trigger:** task completed successfully, playful dialogue line, user easter-egg hotkey.

---

## Priority / blending rules
1. `talk` and `blink` blend over everything (additive face layer).
2. One full-body motion at a time (`wave` > `think` > `surprised` > `wink` > idle set).
3. Idle layer = `idle_breathing` + `head_sway` + `hair_movement` + `eye_movement` (or `cursor_tracking`).
4. All easings default to cubic in-out unless stated; no linear snaps except blink close.

Machine-readable version: `animations/animations.json`.
