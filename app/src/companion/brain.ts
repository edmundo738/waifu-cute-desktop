import { TriggerName } from "./types";

/**
 * Local-LLM brain: talks to an OpenAI-compatible endpoint on the user's own
 * machine (LM Studio default: http://127.0.0.1:1234/v1). Nothing leaves the PC.
 * If unreachable, the app degrades honestly to canned local replies and says so.
 * Note: browsers only allow https→http://127.0.0.1 because localhost is a
 * potentially-trustworthy origin; LM Studio must have CORS enabled (default on).
 * In the future Tauri shell this call moves to the Rust side (no CORS at all).
 */

export const BRAIN_BASE = "http://127.0.0.1:1234/v1";

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface BrainStatus {
  online: boolean;
  model: string | null;
  error?: string;
}

export async function probeBrain(base: string = BRAIN_BASE): Promise<BrainStatus> {
  try {
    const ctl = new AbortController();
    const to = window.setTimeout(() => ctl.abort(), 1500);
    const r = await fetch(base + "/models", { signal: ctl.signal });
    window.clearTimeout(to);
    if (!r.ok) return { online: false, model: null, error: "HTTP " + r.status };
    const j = (await r.json()) as { data?: { id?: string }[] };
    const id = j?.data?.[0]?.id ?? null;
    return id ? { online: true, model: id } : { online: false, model: null, error: "no model loaded" };
  } catch (e) {
    return { online: false, model: null, error: e instanceof Error ? e.message : String(e) };
  }
}

const SYSTEM =
  "És a companheira Waifu Cute Desktop: uma jovem mulher africana, calorosa, divertida e leal, " +
  "que vive no desktop do utilizador. Responde SEMPRE em português europeu, em 1-3 frases curtas, " +
  "tom querido e natural, sem listas nem markdown.";

export async function askBrain(history: ChatMsg[], model: string | null, base: string = BRAIN_BASE): Promise<string> {
  const ctl = new AbortController();
  const to = window.setTimeout(() => ctl.abort(), 20000);
  const r = await fetch(base + "/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: ctl.signal,
    body: JSON.stringify({
      model: model ?? "local",
      messages: [{ role: "system", content: SYSTEM }, ...history],
      temperature: 0.8,
      max_tokens: 200,
    }),
  });
  window.clearTimeout(to);
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  const txt = j?.choices?.[0]?.message?.content?.trim();
  if (!txt) throw new Error("empty reply");
  return txt;
}

/** Sentiment → reaction trigger (heuristic; used for both LLM and canned replies). */
export function reactTo(text: string): TriggerName | null {
  const t = text.toLowerCase();
  if (/obrigad|adoro|amei|lind|querid|amor|❤|😍/.test(t)) return "compliment";
  if (/olá|ola\b|oi\b|bom dia|boa tarde|boa noite|hello/.test(t)) return "greet";
  if (/notifica|aviso|alerta|lembrete|atenção/.test(t)) return "notify";
  if (/brinc|piada|haha|😜|😉/.test(t)) return "playful";
  if (/\?|pens|talvez|acho que/.test(t)) return "think";
  return null;
}

/** Honest offline fallback (labelled as such in the UI/log). */
export function fallbackReply(input: string): string {
  const t = input.toLowerCase();
  if (/olá|ola\b|oi\b|bom dia|boa tarde|boa noite/.test(t))
    return "Olá! Que bom ver-te por aqui. Conta-me lá como está a correr o teu dia.";
  if (/\?$/.test(t.trim()))
    return "Boa pergunta! Sem o cérebro local ligado só consigo dar-te companhia… arranca o LM Studio e respondo a sério.";
  return "Estou aqui contigo. Agora sem cérebro local ligado é só carinho pré-feito — com o LM Studio a correr, conversamos a valer.";
}
