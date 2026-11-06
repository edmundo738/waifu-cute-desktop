/**
 * Pure, environment-free math of the component puppet engine.
 * Every function here is unit-tested by selftest.node.ts (npm run test:puppet).
 * The eye is the reference component: opening (clip mask) + eyeball/iris assembly
 * behind the lids + independent limits + smoothing. All other components reuse
 * the same parameter/clamp/smooth primitives.
 */

export interface Vec2 { x: number; y: number }

export interface RigLimits {
  gaze_dx: number;      // independent horizontal iris travel (px, pose space)
  gaze_dy: number;      // independent vertical iris travel (px, pose space)
  head_rot_deg: number; // head rotation limit
  head_dx: number;      // head translation limit x
  head_dy: number;      // head translation limit y
  brow_dy: [number, number]; // [raise(negative y), lower(positive y)]
  brow_dx: number;
}

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

/** Independent-axis gaze clamp: the controller asks, the anatomy decides. */
export function gazeOffset(gaze: Vec2, limits: RigLimits): Vec2 {
  return {
    x: clamp(gaze.x, -1, 1) * limits.gaze_dx,
    y: clamp(gaze.y, -1, 1) * limits.gaze_dy,
  };
}

/** Frame-rate independent exponential smoothing (critically-damped-ish follow). */
export function smoothDamp(current: number, target: number, lambda: number, dt: number): number {
  const a = 1 - Math.exp(-lambda * dt);
  return current + (target - current) * a;
}

export interface BlinkPhase { t: number; duration: number }

/** Blink envelope: close 0.08s, hold 0.02s, open 0.15s (ANIMATION_SPEC #2). */
export function blinkValue(t: number, duration = 0.25): number {
  if (t < 0 || t > duration) return 0;
  const close = 0.08, hold = 0.02;
  if (t < close) return t / close;
  if (t < close + hold) return 1;
  return 1 - (t - close - hold) / (duration - close - hold);
}

/** Partial-blink friendly: any b in [0,1] is a valid lid position. */
export function lidBottomY(b: number, lidBox: { y0: number; y1: number }, openCy: number, openRy: number): number {
  const natural = lidBox.y1;
  const closed = openCy + openRy; // bottom of the opening
  return natural + (closed - natural) * clamp(b, 0, 1);
}

/** Head follows gaze direction with its own (smaller) limits — never a copy. */
export function headTarget(gaze: Vec2, limits: RigLimits): { rot: number; dx: number; dy: number } {
  const gx = clamp(gaze.x, -1, 1);
  const gy = clamp(gaze.y, -1, 1);
  return {
    rot: clamp(gx * limits.head_rot_deg * 0.6, -limits.head_rot_deg, limits.head_rot_deg),
    dx: clamp(gx * limits.head_dx * 0.5, -limits.head_dx, limits.head_dx),
    dy: clamp(gy * limits.head_dy * 0.4, -limits.head_dy, limits.head_dy),
  };
}

/** Brow offset from an expression intensity: raise (i>0) = negative y in image space.
 *  limits.brow_dy = [raise limit (negative), lower limit (positive)]. */
export function browOffset(intensity: number, limits: RigLimits): Vec2 {
  const i = clamp(intensity, -1, 1);
  const [raiseLim, lowerLim] = limits.brow_dy;
  return { x: 0, y: i >= 0 ? i * raiseLim : -i * lowerLim };
}

/** Idle gaze wander: slow Lissajous inside ±0.35 of range. */
export function idleGaze(t: number): Vec2 {
  return { x: 0.35 * Math.sin(t * 0.31), y: 0.25 * Math.sin(t * 0.21 + 1.7) };
}

/** Screen-space mapping config: the ON-SCREEN position of the character's eyes
 *  (canvas rect + view transform, NOT the window centre) plus sensitivity radii. */
export interface PointerMap {
  eyeX: number; eyeY: number;   // eye centre in viewport CSS px
  sensX: number; sensY: number; // px distance that saturates each axis
}

/**
 * Pointer → gaze target. Relative to the eyes' real screen position so the
 * neutral axis is exactly "cursor over her face", with a soft saturation curve
 * (|v|^0.85) that makes mid-range cursor distances feel more responsive.
 */
export function pointerToGaze(px: number, py: number, m: PointerMap): Vec2 {
  const soft = (v: number): number => {
    const c = clamp(v, -1, 1);
    return Math.sign(c) * Math.pow(Math.abs(c), 0.85);
  };
  return { x: soft((px - m.eyeX) / m.sensX), y: soft((py - m.eyeY) / m.sensY) };
}

/**
 * Secondary motion (hair, cloth…): the layer lives INSIDE the head group, so
 * its extra offset is the lag between a smoothed copy of the driver (head
 * movement) and the driver itself — negative while the head moves
 * (drag-behind), decaying to 0 when the head settles. Bounded by construction.
 */
export class SecondaryMotion {
  private s = 0;
  step(driver: number, lambda: number, dt: number): number {
    this.s = smoothDamp(this.s, driver, lambda, dt);
    return this.s - driver;
  }
  reset(): void {
    this.s = 0;
  }
}
