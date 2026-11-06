import { useEffect, useRef, useState } from "react";
import { CompanionRenderer, POSES, PoseName, TriggerName } from "./companion/types";
import { StaticSpriteRenderer } from "./companion/staticRenderer";
import { detectModel, tryCreateLive2DRenderer } from "./companion/live2dAdapter";
import { subscribePointer, subscribeTriggers } from "./companion/bridge";
import { CompanionStateMachine } from "./companion/stateMachine";
import visA from "../../expressions/viseme_A.png";
import visI from "../../expressions/viseme_I.png";
import visU from "../../expressions/viseme_U.png";
import visE from "../../expressions/viseme_E.png";
import visO from "../../expressions/viseme_O.png";

const VISEMES = ["A", "I", "U", "E", "O"] as const;
const VISEME_URL: Record<(typeof VISEMES)[number], string> = { A: visA, I: visI, U: visU, E: visE, O: visO };

const TRIGGERS: { id: TriggerName; label: string; key: string }[] = [
  { id: "greet", label: "Greet / wave", key: "G" },
  { id: "compliment", label: "Compliment", key: "C" },
  { id: "think", label: "Thinking", key: "T" },
  { id: "notify", label: "Notification", key: "N" },
  { id: "playful", label: "Wink / playful", key: "P" },
  { id: "talk", label: "Talk demo", key: "V" },
];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const smRef = useRef<CompanionStateMachine | null>(null);
  const talkingRef = useRef(false);
  const [rendererKind, setRendererKind] = useState<"loading" | "static" | "live2d">("loading");
  const [modelFound, setModelFound] = useState<boolean | null>(null);
  const [pose, setPose] = useState<PoseName>("neutral");
  const [talking, setTalking] = useState(false);
  const [viseme, setViseme] = useState<(typeof VISEMES)[number]>("A");
  const [log, setLog] = useState<string[]>([]);

  const pushLog = (line: string) =>
    setLog((l) => [...l.slice(-7), `${new Date().toLocaleTimeString()}  ${line}`]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: CompanionRenderer | null = null;
    let disposed = false;

    const sm = new CompanionStateMachine();
    smRef.current = sm;
    sm.onChange = (p, t) => {
      setPose(p);
      renderer?.setPose(p);
      if (t) pushLog(`trigger:${t} -> pose:${p}`);
    };
    sm.onTalk = (active) => {
      talkingRef.current = active;
      setTalking(active);
      if (active) pushLog("talk demo: viseme preview (art only, not rig mouth motion)");
    };

    (async () => {
      setModelFound(await detectModel());
      renderer = await tryCreateLive2DRenderer(canvas);
      if (!renderer) {
        const s = new StaticSpriteRenderer(canvas);
        await s.init();
        renderer = s;
      }
      if (disposed) {
        renderer.dispose();
        return;
      }
      setRendererKind(renderer.kind);
      renderer.setPose(sm.current);
      pushLog(`renderer online: ${renderer.kind}${renderer.kind === "static" ? " (placeholder, not a rig)" : ""}`);
    })();

    const offTriggers = subscribeTriggers((t) => sm.trigger(t));
    const offPointer = subscribePointer((x, y) => renderer?.setGaze(x, y));

    // viseme cycling while the talk demo runs (spec #8 timing: 80-160 ms/viseme)
    const visemeTimer = window.setInterval(() => {
      if (talkingRef.current) setViseme((v) => VISEMES[(VISEMES.indexOf(v) + 1) % VISEMES.length]);
    }, 120);

    return () => {
      disposed = true;
      offTriggers();
      offPointer();
      window.clearInterval(visemeTimer);
      renderer?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <header>
        <h1>WAIFU CUTE DESKTOP</h1>
        <span className="tag">companion stage · skeleton v0.1</span>
      </header>

      <div className="banner">
        <b>Honesty banner:</b> this stage runs the <b>static-sprite placeholder renderer</b>{" "}
        (transform-only idle: breathing, sway, cursor lean). It is <b>not</b> a Live2D rig —
        no mesh, no mouth/eye motion. When <code>models/companion/model.model3.json</code> exists,
        the Live2D adapter takes over automatically.
      </div>

      <main>
        <section className="stage">
          <canvas ref={canvasRef} />
          <div className={`mouth-preview ${talking ? "active" : ""}`}>
            <img src={VISEME_URL[viseme]} alt={`viseme ${viseme}`} />
            <div className="cap">viseme {viseme} · art preview</div>
          </div>
        </section>

        <aside className="panel">
          <h2>Triggers (event pipeline)</h2>
          <div className="row">
            {TRIGGERS.map((t) => (
              <button key={t.id} className="primary" onClick={() => smRef.current?.trigger(t.id)} title={`hotkey ${t.key}`}>
                {t.label}
              </button>
            ))}
          </div>

          <h2>Poses (canon sheet)</h2>
          <div className="row">
            {POSES.map((p) => (
              <button
                key={p}
                onClick={() => smRef.current?.forcePose(p)}
                style={pose === p ? { borderColor: "var(--gold)", color: "var(--gold)" } : undefined}
              >
                {p}
              </button>
            ))}
          </div>

          <h2>Status</h2>
          <div className="chips">
            <div>
              renderer: <span className="k">{rendererKind}</span>
              {rendererKind === "static" && <span className="warn"> · placeholder, not rigged</span>}
            </div>
            <div>
              live2d model:{" "}
              {modelFound === null ? (
                <span className="k">checking…</span>
              ) : modelFound ? (
                <span className="ok">found</span>
              ) : (
                <span className="warn">not found → static fallback</span>
              )}
            </div>
            <div>
              pose: <span className="k">{pose}</span>
            </div>
          </div>

          <h2>Event log</h2>
          <div className="log">{log.join("\n") || "waiting for events…"}</div>
        </aside>
      </main>

      <footer>
        Sprites: transparent mattes of the canon poses · character canon in docs/CHARACTER_DESIGN.md ·
        rig pipeline in live2d/LIVE2D_PREPARATION.md · license rules in live2d/LICENSE_REVIEW.md
      </footer>
    </>
  );
}
