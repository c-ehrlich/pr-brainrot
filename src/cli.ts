import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CHARACTERS, GAMEPLAY } from "./config";
import { parseDiff, type Hunk } from "./diff";
import { synthesize, transcribeWords } from "./fish";
import { fetchPullRequest } from "./github";
import { highlightHunk } from "./highlight";
import { renderVideo } from "./render";
import { writeScript, type Script } from "./script";
import type { Beat, CodeView, VideoProps, Word } from "./types";

interface LineAudio {
  readonly durationMs: number;
  readonly words: readonly Word[];
}

function audioDurationMs(file: string): number {
  const seconds = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], {
    encoding: "utf8",
  });
  return Math.round(Number(seconds.trim()) * 1000);
}

/** Spreads the script's words over the clip, weighted by length, when speech-to-text is unavailable. */
function estimateWords(text: string, durationMs: number): Word[] {
  const words = text.split(/\s+/).filter(Boolean);
  const weights = words.map((w) => w.length + 2);
  const total = weights.reduce((a, b) => a + b, 0);
  let cursor = 0;
  return words.map((word, i) => {
    const length = ((weights[i] ?? 0) / total) * durationMs;
    const result = { text: word, startMs: cursor, endMs: cursor + length };
    cursor += length;
    return result;
  });
}

async function voiceLine(runDir: string, index: number, text: string, voiceId: string): Promise<{ audioFile: string } & LineAudio> {
  const key = createHash("sha256").update(`${voiceId}\n${text}`).digest("hex").slice(0, 10);
  const audioFile = `line-${index}-${key}.mp3`;
  const metaPath = path.join(runDir, `line-${index}-${key}.json`);
  if (existsSync(metaPath)) {
    return { audioFile, ...(JSON.parse(readFileSync(metaPath, "utf8")) as LineAudio) };
  }
  const audio = await synthesize(text, voiceId);
  const audioPath = path.join(runDir, audioFile);
  writeFileSync(audioPath, audio);
  const durationMs = audioDurationMs(audioPath);
  const words = (await transcribeWords(audio)) ?? estimateWords(text, durationMs);
  const meta: LineAudio = { durationMs, words };
  writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  return { audioFile, ...meta };
}

async function codeViewFor(line: Script["lines"][number], hunks: readonly Hunk[]): Promise<CodeView | null> {
  const hunk = hunks.find((h) => h.id === line.hunk);
  if (!hunk || hunk.lines.length === 0) return null;
  const last = hunk.lines.length - 1;
  const focusFrom = Math.min(Math.max(line.focusFrom - 1, 0), last);
  const focusTo = Math.min(Math.max(line.focusTo - 1, focusFrom), last);
  return { hunkId: hunk.id, file: hunk.file, lines: await highlightHunk(hunk), focusFrom, focusTo };
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile(".env");
  } catch {
    // Optional: the key can also come from the shell environment.
  }

  const args = process.argv.slice(2);
  const url = args.find((a) => !a.startsWith("--"));
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  if (!url) {
    console.error("Usage: pnpm make <github-pr-url> [--new-script] [--no-render]");
    process.exit(1);
  }
  if (!process.env.FISH_API_KEY) {
    console.error("FISH_API_KEY is not set. Put it in .env at the repo root.");
    process.exit(1);
  }

  console.log(`Fetching ${url}`);
  const pr = fetchPullRequest(url);
  const hunks = parseDiff(pr.diff);
  if (hunks.length === 0) throw new Error("The pull request has no reviewable diff hunks.");

  const slug = `${pr.owner}-${pr.repo}-${pr.number}`;
  const runDir = path.join("public", "runs", slug);
  mkdirSync(runDir, { recursive: true });

  const scriptPath = path.join(runDir, "script.json");
  let script: Script;
  if (existsSync(scriptPath) && !flags.has("--new-script")) {
    console.log(`Reusing ${scriptPath} (pass --new-script to rewrite it)`);
    script = JSON.parse(readFileSync(scriptPath, "utf8")) as Script;
  } else {
    console.log(`Writing script with claude (${hunks.length} hunks)…`);
    script = writeScript(pr, hunks);
    writeFileSync(scriptPath, JSON.stringify(script, null, 2));
  }
  console.log(`\n"${script.title}"`);
  for (const line of script.lines) console.log(`  ${CHARACTERS[line.speaker].name}: ${line.text}`);
  console.log();

  const beats: Beat[] = [];
  for (const [index, line] of script.lines.entries()) {
    process.stdout.write(`Voicing line ${index + 1}/${script.lines.length}\r`);
    const voiced = await voiceLine(runDir, index, line.text, CHARACTERS[line.speaker].voiceId);
    beats.push({
      speaker: line.speaker,
      text: line.text,
      audio: `runs/${slug}/${voiced.audioFile}`,
      durationMs: voiced.durationMs,
      words: voiced.words,
      code: await codeViewFor(line, hunks),
    });
  }
  console.log();

  const totalSeconds = beats.reduce((sum, b) => sum + b.durationMs, 0) / 1000;
  const spareSeconds = Math.max(0, GAMEPLAY.durationInSeconds - totalSeconds - 5);
  const props: VideoProps = {
    title: script.title,
    prLabel: `${pr.owner}/${pr.repo}#${pr.number}`,
    beats,
    gameplayStartSeconds: spareSeconds > 0 ? (pr.number * 37) % Math.floor(spareSeconds) : 0,
  };
  mkdirSync("out", { recursive: true });
  const propsPath = path.join("out", `${slug}.props.json`);
  writeFileSync(propsPath, JSON.stringify(props, null, 2));
  console.log(`Props: ${propsPath} (${totalSeconds.toFixed(1)}s of speech)`);

  if (flags.has("--no-render")) return;
  const output = path.join("out", `${slug}.mp4`);
  await renderVideo(props, output);
  console.log(`\nDone: ${path.resolve(output)}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
