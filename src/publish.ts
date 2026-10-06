import { readFileSync } from "node:fs";
import path from "node:path";
import { CHARACTERS } from "./config";
import { gh, type PullRequest } from "./github";
import type { Script } from "./script";

export const PUBLISH_MODES = ["comment", "edit"] as const;
export type PublishMode = (typeof PUBLISH_MODES)[number];

const BLOCK_START = "<!-- pr-brainrot:start -->";
const BLOCK_END = "<!-- pr-brainrot:end -->";
const REPO_URL = "https://github.com/c-ehrlich/pr-brainrot";

/** Workflow tokens get a 404 from the attachment endpoint, so CI passes a personal token here. */
function uploadToken(): string {
  return process.env.UPLOAD_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN || gh(["auth", "token"]).trim();
}

/**
 * Uploads through the endpoint GitHub's web editor uses for drag-and-drop, so the
 * returned user-attachments URL renders as an inline player. It is undocumented.
 */
export async function uploadVideo(file: string, pr: PullRequest): Promise<string> {
  const repositoryId = gh(["api", `repos/${pr.owner}/${pr.repo}`, "--jq", ".id"]).trim();
  const query = new URLSearchParams({
    name: path.basename(file),
    content_type: "video/mp4",
    repository_id: repositoryId,
  });
  const response = await fetch(`https://uploads.github.com/user-attachments/assets?${query}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${uploadToken()}`, Accept: "application/json" },
    body: readFileSync(file),
  });
  if (response.status !== 201) {
    const hint = response.status === 404 ? " The upload token must be a personal access token; workflow tokens are rejected." : "";
    throw new Error(`GitHub attachment upload failed: HTTP ${response.status}: ${await response.text()}.${hint}`);
  }
  return ((await response.json()) as { url: string }).url;
}

function renderSection(script: Script, videoUrl: string, heading: string): string {
  const transcript = script.lines.map((l) => `**${CHARACTERS[l.speaker].name}:** ${l.text}`).join("\n\n");
  return [
    `${heading} 🧠 Brainrot explainer: ${script.title}`,
    "",
    videoUrl,
    "",
    "<details><summary>Transcript</summary>",
    "",
    transcript,
    "",
    "</details>",
    "",
    `<sub>Made with [pr-brainrot](${REPO_URL})</sub>`,
  ].join("\n");
}

/** Adds the video in a comment, or in a marked section of the description that reruns replace. Returns a link to it. */
export function publish(mode: PublishMode, pr: PullRequest, script: Script, videoUrl: string): string {
  const base = `repos/${pr.owner}/${pr.repo}`;
  if (mode === "comment") {
    const body = renderSection(script, videoUrl, "###");
    return gh(["api", "-X", "POST", `${base}/issues/${pr.number}/comments`, "--jq", ".html_url"], { body }).trim();
  }
  const current = gh(["api", `${base}/pulls/${pr.number}`, "--jq", ".body // \"\""]).replace(/\n$/, "");
  const block = `${BLOCK_START}\n${renderSection(script, videoUrl, "##")}\n${BLOCK_END}`;
  const start = current.indexOf(BLOCK_START);
  const end = current.indexOf(BLOCK_END);
  const body =
    start !== -1 && end > start
      ? current.slice(0, start) + block + current.slice(end + BLOCK_END.length)
      : `${current}\n\n${block}`;
  gh(["api", "-X", "PATCH", `${base}/pulls/${pr.number}`, "--silent"], { body });
  return `https://github.com/${pr.owner}/${pr.repo}/pull/${pr.number}`;
}
