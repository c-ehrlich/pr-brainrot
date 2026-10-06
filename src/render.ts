import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { VideoProps } from "./types";

export async function renderVideo(props: VideoProps, outputLocation: string): Promise<void> {
  console.log("Bundling…");
  const serveUrl = await bundle({ entryPoint: path.resolve("src/remotion/index.ts") });
  const composition = await selectComposition({ serveUrl, id: "Brainrot", inputProps: props });
  let lastPercent = -1;
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation,
    inputProps: props,
    onProgress: ({ progress }) => {
      const percent = Math.floor(progress * 100);
      if (percent !== lastPercent) {
        lastPercent = percent;
        process.stdout.write(`Rendering ${percent}%\r`);
      }
    },
  });
}
