import { TriggerName } from "./types";

/**
 * Event bridge: one subscription API over (a) Tauri 2 custom events when running
 * inside the desktop shell, (b) plain browser events in the dev preview.
 * Tauri side emits: app.emit("companion://trigger", { trigger: "greet" | ... })
 */

type TauriEvent = { payload: { trigger?: TriggerName } | TriggerName };

const KEY_MAP: Record<string, TriggerName> = {
  g: "greet",
  c: "compliment",
  t: "think",
  n: "notify",
  p: "playful",
  v: "talk",
  y: "talk",
};

export function subscribeTriggers(cb: (t: TriggerName) => void): () => void {
  const onKey = (e: KeyboardEvent) => {
    const t = KEY_MAP[e.key.toLowerCase()];
    if (t) cb(t);
  };
  window.addEventListener("keydown", onKey);

  let unlisten: (() => void) | undefined;
  const tauri = (window as unknown as { __TAURI__?: { event?: { listen?: (n: string, h: (e: TauriEvent) => void) => Promise<() => void> } } }).__TAURI__;
  if (tauri?.event?.listen) {
    tauri.event.listen("companion://trigger", (e) => {
      const payload = e.payload;
      const trigger = typeof payload === "string" ? payload : payload?.trigger;
      if (trigger) cb(trigger);
    }).then((fn) => (unlisten = fn));
  }

  return () => {
    window.removeEventListener("keydown", onKey);
    unlisten?.();
  };
}

/** Raw viewport CSS coordinates — each renderer maps them relative to its own
 *  on-screen character position (see puppetMath.pointerToGaze). */
export function subscribePointer(cb: (x: number, y: number) => void): () => void {
  const onMove = (e: PointerEvent) => {
    cb(e.clientX, e.clientY);
  };
  window.addEventListener("pointermove", onMove);
  return () => window.removeEventListener("pointermove", onMove);
}
