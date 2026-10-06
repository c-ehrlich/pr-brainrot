import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { VideoProps } from "./types";

/** Under GitHub's 10 MB attachment limit for free plans, with headroom for container overhead. */
const TARGET_BYTES = 9.5 * 1024 * 1024;
const AUDIO_KBPS = 96;
/** 720×1280: the code panel stays legible, unlike 540×960. */
const COMPACT_SCALE = 2 / 3;

export interface RenderOptions {
  /** Full 1080×1920 straight from Remotion instead of the size-capped 720×1280 GitHub encode. */
  readonly full: boolean;
}

/**
 * Two-pass H.264 Main / yuv420p encode to a fixed size. GitHub's player shows
 * 0:00 for some High-profile or full-range (yuvj420p) files.
 */
function encodeForGitHub(input: string, output: string, seconds: number): void {
  const videoKbps = Math.floor((TARGET_BYTES * 8) / 1000 / seconds) - AUDIO_KBPS;
  const passLog = path.join(tmpdir(), `pr-brainrot-${process.pid}`);
  const video = [
    ["-vf", "fps=30,scale=out_range=tv,format=yuv420p", "-color_range", "tv"],
    ["-c:v", "libx264", "-profile:v", "main", "-preset", "slow", "-b:v", `${videoKbps}k`],
    ["-passlogfile", passLog],
  ].flat();
  const ffmpeg = (args: readonly string[]): void => {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", input, ...args], { stdio: "inherit" });
  };
  console.log(`\nEncoding for GitHub at ${videoKbps} kb/s…`);
  ffmpeg([...video, "-pass", "1", "-an", "-f", "mp4", "/dev/null"]);
  ffmpeg([
    ...video,
    ["-pass", "2", "-c:a", "aac", "-b:a", `${AUDIO_KBPS}k`, "-ar", "48000"],
    ["-video_track_timescale", "90000", "-movflags", "+faststart", "-brand", "mp42", output],
  ].flat());
  rmSync(`${passLog}-0.log`, { force: true });
  rmSync(`${passLog}-0.log.mbtree`, { force: true });
}

export async function renderVideo(props: VideoProps, outputLocation: string, options: RenderOptions): Promise<void> {
  console.log("Bundling…");
  const serveUrl = await bundle({ entryPoint: path.resolve("src/remotion/index.ts") });
  const composition = await selectComposition({ serveUrl, id: "Brainrot", inputProps: props });
  const master = options.full ? outputLocation : outputLocation.replace(/\.mp4$/, ".master.mp4");

  let lastPercent = -1;
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: master,
    inputProps: props,
    scale: options.full ? 1 : COMPACT_SCALE,
    onProgress: ({ progress }) => {
      const percent = Math.floor(progress * 100);
      if (percent !== lastPercent) {
        lastPercent = percent;
        process.stdout.write(`Rendering ${percent}%\r`);
      }
    },
  });

  if (options.full) return;
  encodeForGitHub(master, outputLocation, composition.durationInFrames / composition.fps);
  rmSync(master);
}
