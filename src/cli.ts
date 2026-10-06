import { generate } from "./pipeline";
import { PUBLISH_MODES, publish, uploadVideo, type PublishMode } from "./publish";

const USAGE = `Usage: pnpm make <github-pr-url> [options]

  --new-script         ask the model for a new script instead of reusing the cached one
  --no-render          stop after writing out/<slug>.props.json
  --full               keep the 1080×1920 render instead of the <10 MB GitHub encode
  --gameplay=<url>     use another gameplay clip
  --publish=<mode>     upload and post to the PR: ${PUBLISH_MODES.join(" | ")}`;

async function main(): Promise<void> {
  try {
    process.loadEnvFile(".env");
  } catch {
    // Optional: keys can also come from the shell environment.
  }

  const args = process.argv.slice(2);
  const url = args.find((a) => !a.startsWith("--"));
  const flags = new Set(args.filter((a) => a.startsWith("--") && !a.includes("=")));
  const option = (name: string): string | undefined =>
    args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const publishMode = option("publish");
  if (!url || (publishMode && !(PUBLISH_MODES as readonly string[]).includes(publishMode))) {
    console.error(USAGE);
    process.exit(1);
  }
  if (!process.env.FISH_API_KEY) {
    console.error("FISH_API_KEY is not set. Put it in .env at the repo root.");
    process.exit(1);
  }

  const result = await generate({
    url,
    newScript: flags.has("--new-script"),
    render: !flags.has("--no-render"),
    full: flags.has("--full"),
    gameplayUrl: option("gameplay"),
  });
  if (!publishMode || !result.video) return;
  const videoUrl = await uploadVideo(result.video, result.pr);
  console.log(`Uploaded: ${videoUrl}`);
  console.log(`Posted: ${publish(publishMode as PublishMode, result.pr, result.script, videoUrl)}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
