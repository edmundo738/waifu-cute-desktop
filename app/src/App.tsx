import { useEffect, useRef, useState } from "react";
import { CompanionRenderer, POSES, PoseName, TriggerName } from "./companion/types";
import { StaticSpriteRenderer } from "./companion/staticRenderer";
import { detectModel, tryCreateLive2DRenderer } from "./companion/live2dAdapter";
import { PuppetRenderer, FaceParams, RIG_MANIFEST_URL } from "./puppet/PuppetRenderer";
import { subscribePointer, subscribeTriggers } from "./companion/bridge";
import { CompanionStateMachine } from "./companion/stateMachine";
import { FaceFollower } from "./companion/faceFollow";
import { BrainStatus, ChatMsg, askBrain, fallbackReply, probeBrain, reactTo } from "./companion/brain";
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

interface ChatLine { who: "you" | "her"; text: string }

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const smRef = useRef<CompanionStateMachine | null>(null);
  const rendererRef = useRef<CompanionRenderer | null>(null);
  const followerRef = useRef<FaceFollower | null>(null);
  const talkingRef = useRef(false);
  const [rendererKind, setRendererKind] = useState<"loading" | "static" | "live2d" | "puppet">("loading");
  const [modelFound, setModelFound] = useState<boolean | null>(null);
  const [rigFound, setRigFound] = useState<boolean | null>(null);
  const [pose, setPose] = useState<PoseName>("neutral");
  const [talking, setTalking] = useState(false);
  const [viseme, setViseme] = useState<(typeof VISEMES)[number]>("A");
  const [log, setLog] = useState<string[]>([]);
  const [faceOn, setFaceOn] = useState(false);
  const [brain, setBrain] = useState<BrainStatus | null>(null);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [brainBusy, setBrainBusy] = useState(false);

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
        if (renderer instanceof PuppetRenderer) {
          renderer.setFaceParams(FACE_BY_TRIGGER[t]);
          if (t === "talk") renderer.setSpeech("Olá! A minha boca agora mexe mesmo: camadas, máscaras e mandíbula, tudo feito à mão.");
        }
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
      rendererRef.current = renderer;
      setRendererKind(renderer.kind);
      renderer.setPose(sm.current);
      pushLog(
        renderer.kind === "puppet"
          ? "renderer online: component puppet (layers+masks+params) — real eye/head animation, not Live2D"
          : `renderer online: ${renderer.kind}${renderer.kind === "static" ? " (placeholder, not a rig)" : ""}`,
      );
      probeBrain().then((s) => {
        setBrain(s);
        pushLog(s.online ? `brain online: local LLM ${s.model}` : `brain offline (${s.error}) — canned replies`);
      });
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
      followerRef.current?.stop();
      renderer?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleFace = async (): Promise<void> => {
    if (faceOn) {
      followerRef.current?.stop();
      followerRef.current = null;
      if (rendererRef.current instanceof PuppetRenderer) rendererRef.current.setFaceFollow(false);
      setFaceOn(false);
      pushLog("webcam face-follow OFF (camera stream released)");
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    try {
      const f = new FaceFollower();
      f.onGaze = (g) => {
        if (g && rendererRef.current instanceof PuppetRenderer) rendererRef.current.setExternalGaze(g.x, g.y);
      };
      await f.start(video);
      followerRef.current = f;
      if (rendererRef.current instanceof PuppetRenderer) rendererRef.current.setFaceFollow(true);
      setFaceOn(true);
      pushLog("webcam face-follow ON (MediaPipe FaceLandmarker, on-device only)");
    } catch (e) {
      pushLog("webcam unavailable: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const sendChat = async (): Promise<void> => {
    const text = chatInput.trim();
    if (!text || brainBusy) return;
    setChatInput("");
    const history: ChatMsg[] = [...chat, { who: "you" as const, text }]
      .slice(-8)
      .map((m) => ({ role: m.who === "you" ? ("user" as const) : ("assistant" as const), content: m.text }));
    setChat((c) => [...c, { who: "you", text }]);
    setBrainBusy(true);
    smRef.current?.trigger("think");
    let reply: string;
    let offline = false;
    try {
      let st = brain;
      if (!st) {
        st = await probeBrain();
        setBrain(st);
      }
      if (!st.online) throw new Error(st.error ?? "offline");
      reply = await askBrain(history, st.model);
    } catch {
      offline = true;
      reply = fallbackReply(text);
    }
    setBrainBusy(false);
    setChat((c) => [...c, { who: "her", text: reply }]);
    const r = reactTo(reply);
    if (r) smRef.current?.trigger(r);
    if (rendererRef.current instanceof PuppetRenderer) rendererRef.current.setSpeech(reply);
    smRef.current?.trigger("talk");
    pushLog(offline ? "brain offline → canned reply (honest fallback)" : `brain reply via ${brain?.model ?? "local LLM"}`);
  };

  return (
    <>
      <header>
        <h1>WAIFU CUTE DESKTOP</h1>
        <span className="tag">companion stage · component puppet v0.3</span>
      </header>

      <div className="banner">
        <b>Renderer honesty banner:</b>{" "}
        {rendererKind === "puppet" ? (
          <>
            the <b>component puppet</b> is live: eyeballs translate inside clipped eye openings
            around <b>her real on-screen eye axis</b>, lids blink over them, brows move
            independently, head follows with its own limits. New: webcam face-follow and a
            local-LLM brain hook (LM Studio) — both on-device, both optional. Mouth/torso
            components remain later milestones; this is <b>not</b> Live2D/Inochi2D.
          </>
        ) : (
          <>static-sprite placeholder (transform-only idle). Not a rig.</>
        )}
      </div>

      <main>
        <section className="stage">
          <canvas ref={canvasRef} />
          <video ref={videoRef} className="pip" muted playsInline hidden={!faceOn} />
          <div className={`mouth-preview ${talking ? "active" : ""}`}>
            <img src={VISEME_URL[viseme]} alt={`viseme ${viseme}`} />
            <div className="cap">viseme {viseme} · art preview</div>
          </div>
        </section>

        <aside className="panel">
          <h2>Next-level inputs</h2>
          <div className="row">
            <button className="primary" onClick={() => void toggleFace()} style={faceOn ? { borderColor: "var(--ok)", color: "var(--ok)" } : undefined}>
              {faceOn ? "📷 a ver-te (click p/ parar)" : "📷 olhar para ti (webcam)"}
            </button>
          </div>
          <div className="chips">
            <div>
              brain (LM Studio @127.0.0.1:1234):{" "}
              {brain === null ? (
                <span className="k">probing…</span>
              ) : brain.online ? (
                <span className="ok">{brain.model}</span>
              ) : (
                <span className="warn">offline — canned replies</span>
              )}
            </div>
          </div>
          <div className="chat" aria-live="polite">
            {chat.length === 0 && <div className="her"><span className="who">ela:</span> fala comigo… (se o LM Studio estiver a correr, respondo com o cérebro local)</div>}
            {chat.map((m, i) => (
              <div key={i} className={m.who === "you" ? "you" : "her"}>
                <span className="who">{m.who === "you" ? "tu:" : "ela:"}</span>
                {m.text}
              </div>
            ))}
            {brainBusy && <div className="her"><span className="who">ela:</span> …</div>}
          </div>
          <form className="chatform" onSubmit={(e) => { e.preventDefault(); void sendChat(); }}>
            <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="escreve-lhe algo…" maxLength={300} />
            <button className="primary" type="submit" disabled={brainBusy}>enviar</button>
          </form>

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
                  window.dispatchEvent(new PointerEvent("pointermove", {
                    clientX: ((x + 1) / 2) * window.innerWidth,
                    clientY: ((y + 1) / 2) * window.innerHeight,
                  }));
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
              {" · "}face-follow:{" "}
              {faceOn ? <span className="ok">on</span> : <span className="k">off</span>}
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
