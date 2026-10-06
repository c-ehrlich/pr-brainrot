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
  /** Full 1080×1920 at Remotion's default quality instead of the size-capped 720×1280. */
  readonly full: boolean;
}

export async function renderVideo(props: VideoProps, outputLocation: string, options: RenderOptions): Promise<void> {
  console.log("Bundling…");
  const serveUrl = await bundle({ entryPoint: path.resolve("src/remotion/index.ts") });
  const composition = await selectComposition({ serveUrl, id: "Brainrot", inputProps: props });

  const seconds = composition.durationInFrames / composition.fps;
  const videoKbps = Math.floor((TARGET_BYTES * 8) / 1000 / seconds) - AUDIO_KBPS;
  const encoding = options.full
    ? {}
    : {
        scale: COMPACT_SCALE,
        videoBitrate: `${videoKbps}k` as const,
        encodingMaxRate: `${Math.round(videoKbps * 1.5)}k` as const,
        encodingBufferSize: `${videoKbps * 2}k` as const,
        audioBitrate: `${AUDIO_KBPS}k` as const,
        x264Preset: "slow" as const,
      };

  let lastPercent = -1;
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation,
    inputProps: props,
    ...encoding,
    onProgress: ({ progress }) => {
      const percent = Math.floor(progress * 100);
      if (percent !== lastPercent) {
        lastPercent = percent;
        process.stdout.write(`Rendering ${percent}%\r`);
      }
    },
  });
}
