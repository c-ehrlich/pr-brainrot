import type { Word } from "./types";

const API = "https://api.fish.audio";

function apiKey(): string {
  const key = process.env.FISH_API_KEY;
  if (!key) throw new Error("FISH_API_KEY is not set. Put it in .env at the repo root.");
  return key;
}

export async function synthesize(text: string, voiceId: string): Promise<Buffer> {
  const response = await fetch(`${API}/v1/tts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      model: process.env.FISH_TTS_MODEL ?? "s2.1-pro",
    },
    body: JSON.stringify({ text, reference_id: voiceId, format: "mp3", mp3_bitrate: 128, latency: "normal" }),
  });
  if (!response.ok) throw new Error(`Fish TTS ${response.status}: ${await response.text()}`);
  return Buffer.from(await response.arrayBuffer());
}

/** Word timings from Fish speech-to-text, or null when the request fails. */
export async function transcribeWords(audio: Buffer): Promise<Word[] | null> {
  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }), "line.mp3");
  form.append("language", "en");
  form.append("ignore_timestamps", "false");
  const response = await fetch(`${API}/v1/asr`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, model: process.env.FISH_ASR_MODEL ?? "transcribe-1" },
    body: form,
  });
  if (!response.ok) {
    console.warn(`  Fish ASR ${response.status}: ${await response.text()} (falling back to estimated timings)`);
    return null;
  }
  const result = (await response.json()) as { segments?: { text: string; start: number; end: number }[] };
  const words = (result.segments ?? [])
    .map((s) => ({ text: s.text.trim(), startMs: s.start * 1000, endMs: s.end * 1000 }))
    .filter((w) => w.text.length > 0);
  return words.length > 0 ? words : null;
}
