export type PoseName =
  | "neutral"
  | "happy"
  | "thinking"
  | "waving"
  | "surprised"
  | "playful";

export type TriggerName =
  | "greet"      // app launch / user returns -> wave
  | "compliment" // positive sentiment -> happy
  | "think"      // long task / ambiguous query -> thinking
  | "notify"     // unexpected notification -> surprised
  | "playful"    // task completed / easter egg -> playful wink
  | "talk";      // TTS stream -> mouth preview (static renderer) / talk motion (Live2D)

export interface CompanionRenderer {
  readonly kind: "static" | "live2d" | "puppet";
  setPose(pose: PoseName): void;
  setGaze(x: number, y: number): void; // -1..1 normalized cursor position
  dispose(): void;
}

export const POSES: PoseName[] = [
  "neutral",
  "happy",
  "thinking",
  "waving",
  "surprised",
  "playful",
];

export const SPRITE_URL: Record<PoseName, string> = {
  neutral: "/sprites/companion_neutral.png",
  happy: "/sprites/companion_happy.png",
  thinking: "/sprites/companion_thinking.png",
  waving: "/sprites/companion_waving.png",
  surprised: "/sprites/companion_surprised.png",
  playful: "/sprites/companion_playful.png",
};
