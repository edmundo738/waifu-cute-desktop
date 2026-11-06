import { PoseName, TriggerName } from "./types";

/**
 * Pose-level reaction state machine (placeholder behaviour for the static
 * renderer). Durations mirror animations/animations.json one-shot lengths.
 * When the Live2D renderer is active these triggers map to .motion3.json groups
 * of the same names instead of pose swaps.
 */
const REACTION: Record<TriggerName, { pose: PoseName | null; holdMs: number }> = {
  greet: { pose: "waving", holdMs: 2300 },
  compliment: { pose: "happy", holdMs: 2000 },
  think: { pose: "thinking", holdMs: 4000 }, // spec caps at 6s; demo uses 4s
  notify: { pose: "surprised", holdMs: 1550 },
  playful: { pose: "playful", holdMs: 1500 },
  talk: { pose: null, holdMs: 2400 }, // mouth preview only on static renderer
};

export class CompanionStateMachine {
  private pose: PoseName = "neutral";
  private timer: number | undefined;
  onChange: ((pose: PoseName, trigger: TriggerName | null) => void) | undefined;
  onTalk: ((active: boolean) => void) | undefined;

  trigger(t: TriggerName): void {
    const r = REACTION[t];
    window.clearTimeout(this.timer);
    this.onTalk?.(t === "talk");
    if (r.pose) {
      this.setPose(r.pose, t);
      this.timer = window.setTimeout(() => {
        this.setPose("neutral", null);
        if (t === "talk") this.onTalk?.(false);
      }, r.holdMs);
    } else {
      this.timer = window.setTimeout(() => this.onTalk?.(false), r.holdMs);
    }
  }

  forcePose(p: PoseName): void {
    window.clearTimeout(this.timer);
    this.onTalk?.(false);
    this.setPose(p, null);
  }

  private setPose(p: PoseName, t: TriggerName | null): void {
    this.pose = p;
    this.onChange?.(p, t);
  }

  get current(): PoseName {
    return this.pose;
  }
}
