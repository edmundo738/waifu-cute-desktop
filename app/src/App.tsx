import { useEffect, useRef, useState } from "react";
import { CompanionRenderer, POSES, PoseName, TriggerName } from "./companion/types";
import { StaticSpriteRenderer } from "./companion/staticRenderer";
import { detectModel, tryCreateLive2DRenderer } from "./companion/live2dAdapter";
import { PuppetRenderer, FaceParams, RIG_MANIFEST_URL } from "./puppet/PuppetRenderer";
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

const FACE_BY_TRIGGER: Record<TriggerName, FaceParams> = {
  greet: {},
  compliment: { browRaise: 0.35 },
  think: { gazeBias: { x: -0.5, y: -0.55 }, browRaise: -0.3 },
  notify: { browRaise: 1 },
  playful: { browRaise: 0.5 },
  talk: {},
};

async function detectRig(): Promise<boolean> {
  try {
    const r = await fetch(RIG_MANIFEST_URL, { method: "HEAD" });
    return r.ok && (r.headers.get("content-type") ?? "").includes("json");
  } catch {
    return false;
  }
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const smRef = useRef<CompanionStateMachine | null>(null);
  const talkingRef = useRef(false);
  const [rendererKind, setRendererKind] = useState<"loading" | "static" | "live2d" | "puppet">("loading");
  const [modelFound, setModelFound] = useState<boolean | null>(null);
  const [rigFound, setRigFound] = useState<boolean | null>(null);
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
      if (t) {
        pushLog(`trigger:${t} -> pose:${p}`);
        if (renderer instanceof PuppetRenderer) renderer.setFaceParams(FACE_BY_TRIGGER[t]);
      } else if (renderer instanceof PuppetRenderer) {
        renderer.setFaceParams({ browRaise: 0, gazeBias: { x: 0, y: 0 } });
      }
    };
    sm.onTalk = (active) => {
      talkingRef.current = active;
      setTalking(active);
      if (active) pushLog("talk demo: viseme preview (art only, not rig mouth motion)");
    };

    (async () => {
      const [model, rig] = [await detectModel(), await detectRig()];
      setModelFound(model);
      setRigFound(rig);
      if (model) renderer = await tryCreateLive2DRenderer(canvas);
      if (!renderer && rig) {
        try {
          const p = new PuppetRenderer(canvas);
          await p.init();
          renderer = p;
        } catch (e) {
          console.warn("[companion] puppet init failed, falling back to static:", e);
        }
      }
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
      pushLog(
        renderer.kind === "puppet"
          ? "renderer online: component puppet (layers+masks+params) — real eye/head animation, not Live2D"
          : `renderer online: ${renderer.kind}${renderer.kind === "static" ? " (placeholder, not a rig)" : ""}`,
      );
    })();

    const offTriggers = subscribeTriggers((t) => sm.trigger(t));
    const offPointer = subscribePointer((x, y) => renderer?.setGaze(x, y));

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
        <span className="tag">companion stage · component puppet v0.2</span>
      </header>

      <div className="banner">
        <b>Renderer honesty banner:</b>{" "}
        {rendererKind === "puppet" ? (
          <>
            the <b>component puppet</b> is live: eyeball/iris assemblies translate inside clipped eye
            openings (independent X/Y limits), lids blink over them (partial blinks included), brows
            move independently, and the head follows gaze with its own smaller limits and smoothing.
            Built on the custom micro-engine (layers + masks + parameters) — <b>not</b> a Live2D or
            Inochi2D model; mouth/torso/arm components are later milestones.
          </>
        ) : (
          <>static-sprite placeholder (transform-only idle). Not a rig.</>
        )}
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

          <h2>Gaze targets (manual)</h2>
          <div className="row">
            {([["left", -1, 0], ["right", 1, 0], ["up", 0, -1], ["down", 0, 1], ["center", 0, 0]] as const).map(([label, x, y]) => (
              <button
                key={label}
                onClick={() => {
                  const c = canvasRef.current;
                  if (!c) return;
                  const r = c.getBoundingClientRect();
                  window.dispatchEvent(new PointerEvent("pointermove", {
                    clientX: ((x + 1) / 2) * window.innerWidth,
                    clientY: ((y + 1) / 2) * window.innerHeight,
                  }));
                  void r;
                }}
              >
                {label}
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
              {rendererKind === "puppet" && <span className="ok"> · component puppet live</span>}
              {rendererKind === "static" && <span className="warn"> · placeholder, not rigged</span>}
            </div>
            <div>
              puppet rig:{" "}
              {rigFound === null ? <span className="k">checking…</span> : rigFound ? <span className="ok">found</span> : <span className="warn">not found</span>}
              {" · "}live2d model:{" "}
              {modelFound === null ? <span className="k">checking…</span> : modelFound ? <span className="ok">found</span> : <span className="warn">not found</span>}
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
        Puppet layers cut from the canon pose (docs/CHARACTER_LAYER_MAP.md) · engine evaluation in
        docs/ANIMATION_ENGINE_EVALUATION.md · evidence frames in app/test_out/ · rig pipeline in
        live2d/LIVE2D_PREPARATION.md
      </footer>
    </>
  );
}
