import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CHARACTERS, GAMEPLAY } from "./config";
import { parseDiff, type Hunk } from "./diff";
import { synthesize, transcribeWords } from "./fish";
import { fetchPullRequest, type PullRequest } from "./github";
import { highlightHunk } from "./highlight";
import { renderVideo } from "./render";
import { writeScript, type Script } from "./script";
import type { Beat, CodeView, Gameplay, VideoProps, Word } from "./types";

export interface GenerateOptions {
  readonly url: string;
  /** Ignore a cached script.json and ask the model again. */
  readonly newScript: boolean;
  readonly render: boolean;
  readonly full: boolean;
  /** Replaces the bundled parkour clip. */
  readonly gameplayUrl: string | undefined;
}

export interface GenerateResult {
  readonly pr: PullRequest;
  readonly script: Script;
  /** Absolute path, or null when rendering was skipped. */
  readonly video: string | null;
}

interface LineAudio {
  readonly durationMs: number;
  readonly words: readonly Word[];
}

function probeSeconds(file: string): number {
  const seconds = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], {
    encoding: "utf8",
  });
  return Number(seconds.trim());
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
  const durationMs = Math.round(probeSeconds(audioPath) * 1000);
  const words = (await transcribeWords(audio)) ?? estimateWords(text, durationMs);
  const meta: LineAudio = { durationMs, words };
  writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  return { audioFile, ...meta };
}

async function codeViewFor(line: Script["lines"][number], hunks: readonly Hunk[]): Promise<CodeView | null> {
  const hunk = hunks.find((h) => h.id === line.hunk);
  if (!hunk || hunk.lines.length === 0) return null;
  const last = hunk.lines.length - 1;
  const focusFrom = Math.min(Math.max(Math.round(line.focusFrom) - 1, 0), last);
  const focusTo = Math.min(Math.max(Math.round(line.focusTo) - 1, focusFrom), last);
  return { hunkId: hunk.id, file: hunk.file, lines: await highlightHunk(hunk), focusFrom, focusTo };
}

/** Downloads a gameplay clip and crops it to the bottom panel. */
async function prepareGameplay(url: string | undefined, runDir: string, slug: string): Promise<Gameplay> {
  if (!url) return GAMEPLAY;
  const raw = path.join(runDir, "gameplay-source");
  const output = path.join(runDir, "gameplay.mp4");
  if (!existsSync(output)) {
    console.log(`Downloading gameplay from ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Gameplay download failed: HTTP ${response.status}`);
    writeFileSync(raw, Buffer.from(await response.arrayBuffer()));
    execFileSync("ffmpeg", [
      ...["-y", "-loglevel", "error", "-i", raw, "-t", "180", "-an"],
      ...["-vf", "scale=720:640:force_original_aspect_ratio=increase,crop=720:640,fps=30,format=yuv420p"],
      ...["-c:v", "libx264", "-crf", "26", "-preset", "veryfast", output],
    ]);
  }
  return { src: `runs/${slug}/gameplay.mp4`, durationInSeconds: Math.floor(probeSeconds(output)) };
}

export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  console.log(`Fetching ${options.url}`);
  const pr = fetchPullRequest(options.url);
  const hunks = parseDiff(pr.diff);
  if (hunks.length === 0) throw new Error("The pull request has no reviewable diff hunks.");

  const slug = `${pr.owner}-${pr.repo}-${pr.number}`;
  const runDir = path.join("public", "runs", slug);
  mkdirSync(runDir, { recursive: true });

  const scriptPath = path.join(runDir, "script.json");
  let script: Script;
  if (existsSync(scriptPath) && !options.newScript) {
    console.log(`Reusing ${scriptPath} (pass --new-script to rewrite it)`);
    script = JSON.parse(readFileSync(scriptPath, "utf8")) as Script;
  } else {
    script = await writeScript(pr, hunks);
    writeFileSync(scriptPath, JSON.stringify(script, null, 2));
  }
  console.log(`\n"${script.title}"`);
  for (const line of script.lines) console.log(`  ${CHARACTERS[line.speaker].name}: ${line.text}`);
  console.log();

  const beats: Beat[] = [];
  for (const [index, line] of script.lines.entries()) {
    console.log(`Voicing line ${index + 1}/${script.lines.length}`);
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

  const gameplay = await prepareGameplay(options.gameplayUrl, runDir, slug);
  const totalSeconds = beats.reduce((sum, b) => sum + b.durationMs, 0) / 1000;
  const spareSeconds = Math.max(0, gameplay.durationInSeconds - totalSeconds - 5);
  const props: VideoProps = {
    title: script.title,
    prLabel: `${pr.owner}/${pr.repo}#${pr.number}`,
    beats,
    gameplay,
    gameplayStartSeconds: spareSeconds >= 1 ? (pr.number * 37) % Math.floor(spareSeconds) : 0,
  };
  mkdirSync("out", { recursive: true });
  const propsPath = path.join("out", `${slug}.props.json`);
  writeFileSync(propsPath, JSON.stringify(props, null, 2));
  console.log(`Props: ${propsPath} (${totalSeconds.toFixed(1)}s of speech)`);

  if (!options.render) return { pr, script, video: null };
  const output = path.resolve("out", `${slug}.mp4`);
  await renderVideo(props, output, { full: options.full });
  const megabytes = statSync(output).size / 1024 / 1024;
  console.log(`\nVideo: ${output} (${megabytes.toFixed(1)} MB)`);
  return { pr, script, video: output };
}
