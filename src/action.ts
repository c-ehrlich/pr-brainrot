import { appendFileSync, readFileSync } from "node:fs";
import { gh } from "./github";
import { generate } from "./pipeline";
import { PUBLISH_MODES, publish, uploadVideo, type PublishMode } from "./publish";

/** The parts of the webhook payloads this action reads. */
interface EventPayload {
  readonly issue?: { readonly number: number; readonly pull_request?: unknown };
  readonly comment?: { readonly id: number; readonly body: string; readonly author_association: string };
  readonly pull_request?: {
    readonly number: number;
    readonly draft: boolean;
    readonly head: { readonly repo: { readonly full_name: string } | null };
  };
}

type Trigger =
  | { readonly type: "comment"; readonly prNumber: number; readonly commentId: number }
  | { readonly type: "pull_request"; readonly prNumber: number };

function input(name: string): string {
  return process.env[`PR_BRAINROT_${name}`]?.trim() ?? "";
}

function setOutput(name: string, value: string): void {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

/** Decides from the event whether to run, or returns the reason to skip. */
function resolveTrigger(eventName: string, event: EventPayload, repository: string): Trigger | string {
  if (eventName === "issue_comment") {
    if (!event.issue?.pull_request || !event.comment) return "the comment is not on a pull request";
    const command = input("COMMAND") || "/brainrot";
    if (!event.comment.body.trim().startsWith(command)) return `the comment does not start with ${command}`;
    const allowed = (input("ALLOWED_ASSOCIATIONS") || "OWNER,MEMBER,COLLABORATOR").split(",").map((s) => s.trim());
    if (!allowed.includes(event.comment.author_association)) {
      return `the commenter's association (${event.comment.author_association}) is not in ${allowed.join(", ")}`;
    }
    return { type: "comment", prNumber: event.issue.number, commentId: event.comment.id };
  }
  if (eventName === "pull_request" || eventName === "pull_request_target") {
    if (!event.pull_request) return "the event has no pull request";
    if (event.pull_request.draft) return "the pull request is a draft";
    if (!process.env.FISH_API_KEY && event.pull_request.head.repo?.full_name !== repository) {
      return "secrets are not available to pull requests from forks; use the comment trigger for those";
    }
    return { type: "pull_request", prNumber: event.pull_request.number };
  }
  return `unsupported event ${eventName}; use issue_comment or pull_request`;
}

function react(repository: string, commentId: number, content: "eyes" | "rocket" | "confused"): void {
  try {
    gh(["api", "-X", "POST", `repos/${repository}/issues/comments/${commentId}/reactions`, "--silent"], { content });
  } catch (error) {
    console.warn(`Could not add a ${content} reaction:`, error);
  }
}

async function main(): Promise<void> {
  const repository = process.env.GITHUB_REPOSITORY ?? "";
  const eventName = process.env.GITHUB_EVENT_NAME ?? "";
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8")) as EventPayload;
  const mode = input("MODE") || "comment";
  if (!(PUBLISH_MODES as readonly string[]).includes(mode)) {
    throw new Error(`mode must be one of ${PUBLISH_MODES.join(", ")}, got "${mode}"`);
  }

  const trigger = resolveTrigger(eventName, event, repository);
  if (typeof trigger === "string") {
    console.log(`Skipping: ${trigger}.`);
    return;
  }
  if (!process.env.FISH_API_KEY) throw new Error("The fish-api-key input is required.");
  if (!process.env.UPLOAD_TOKEN) throw new Error("The upload-token input is required.");
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENROUTER_API_KEY) {
    throw new Error("Set either the anthropic-api-key or the openrouter-api-key input.");
  }
  if (trigger.type === "comment") react(repository, trigger.commentId, "eyes");

  const url = `https://github.com/${repository}/pull/${trigger.prNumber}`;
  try {
    const result = await generate({
      url,
      newScript: true,
      render: true,
      full: false,
      gameplayUrl: input("GAMEPLAY_URL") || undefined,
    });
    if (!result.video) throw new Error("Rendering produced no video.");
    const videoUrl = await uploadVideo(result.video, result.pr);
    console.log(`Uploaded: ${videoUrl}`);
    const location = publish(mode as PublishMode, result.pr, result.script, videoUrl);
    console.log(`Posted: ${location}`);
    setOutput("video-url", videoUrl);
    if (trigger.type === "comment") react(repository, trigger.commentId, "rocket");
  } catch (error) {
    if (trigger.type === "comment") {
      react(repository, trigger.commentId, "confused");
      const run = `${process.env.GITHUB_SERVER_URL}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`;
      const message = error instanceof Error ? error.message : String(error);
      gh(["api", "-X", "POST", `repos/${repository}/issues/${trigger.prNumber}/comments`, "--silent"], {
        body: `Brainrot generation failed: ${message.slice(0, 500)}\n\n[Workflow run](${run})`,
      });
    }
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
