import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

/**
 * On-device webcam face follow (MediaPipe FaceLandmarker, WASM in the browser —
 * no server, no frames leave the machine). Maps the user's face position in the
 * (mirrored) selfie frame to a normalized gaze target so she looks at YOU.
 * Privacy: everything runs locally; stopping kills the camera stream.
 */

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm";
const GAIN = 3.2; // face offset in frame (±~0.3) → gaze (±~1)

const clamp1 = (v: number): number => Math.max(-1, Math.min(1, v));

export class FaceFollower {
  onGaze?: (g: { x: number; y: number } | null) => void;

  private lm?: FaceLandmarker;
  private stream?: MediaStream;
  private video?: HTMLVideoElement;
  private raf = 0;
  private lastMs = 0;
  private running = false;

  async start(video: HTMLVideoElement): Promise<void> {
    this.video = video;
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
    this.lm = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numFaces: 1,
    });
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
    video.srcObject = this.stream;
    await video.play();
    this.running = true;
    this.loop();
  }

  private loop = (): void => {
    if (!this.running) return;
    const now = performance.now();
    if (this.lm && this.video && this.video.readyState >= 2 && now - this.lastMs > 80) {
      this.lastMs = now;
      try {
        const res = this.lm.detectForVideo(this.video, now);
        const f = res.faceLandmarks?.[0];
        if (f && f.length > 152) {
          // nose tip + forehead + chin → stable face centre
          const cx = (f[1].x + f[10].x + f[152].x) / 3;
          const cy = (f[1].y + f[10].y + f[152].y) / 3;
          // mirrored selfie: user leaning to their right (screen-right) = frame-left
          this.onGaze?.({ x: clamp1((0.5 - cx) * GAIN), y: clamp1((cy - 0.42) * GAIN) });
        } else {
          this.onGaze?.(null);
        }
      } catch {
        /* drop frame */
      }
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.lm?.close();
    this.lm = undefined;
    this.stream = undefined;
  }
}
