import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { z } from "zod";
import { CHARACTER_IDS, CHARACTERS, type CharacterId } from "./config";
import { formatHunksForPrompt, type Hunk } from "./diff";
import type { PullRequest } from "./github";

const ScriptSchema = z.object({
  title: z.string(),
  lines: z
    .array(
      z.object({
        speaker: z.enum(CHARACTER_IDS as [CharacterId, ...CharacterId[]]),
        text: z.string().min(1),
        hunk: z.string().nullable(),
        focusFrom: z.number().int(),
        focusTo: z.number().int(),
      }),
    )
    .min(2),
});

export type Script = z.infer<typeof ScriptSchema>;

// The claude CLI rejects the 2020-12 "$schema" URI, so emit draft-07 without it.
const { $schema: _, ...JSON_SCHEMA } = z.toJSONSchema(ScriptSchema, { target: "draft-07" });

function buildPrompt(pr: PullRequest, hunks: readonly Hunk[]): string {
  const cast = CHARACTER_IDS.map((id) => `- "${id}": ${CHARACTERS[id].persona}`).join("\n");
  return `Write a script for a ~60 second "brainrot" short video (TikTok style: two Family Guy characters talk over Minecraft parkour gameplay) that explains a GitHub pull request. The top half of the screen shows the code being discussed.

Cast:
${cast}

Rules:
- 10 to 16 lines, alternating speakers mostly, 150 to 190 words in total. Each line at most 30 words.
- Open with a hook in the first line. End with a punchline.
- Be technically accurate: a developer watching should actually understand what changed and why.
- Lines are fed to text-to-speech. Write them to be spoken: no markdown, no emoji, no URLs, no code syntax. Say identifiers as words ("the use can save monitor hook", not "useCanSaveMonitor()").
- When a line discusses specific code, set "hunk" to the hunk id (like "h2") and "focusFrom"/"focusTo" to the 1-based line numbers within that hunk being discussed (at most 12 lines apart). Otherwise set "hunk" to null and both focus fields to 0. Most lines should point at code.
- "title" is a short, punchy title for the video (max 8 words).

Pull request: ${pr.owner}/${pr.repo}#${pr.number} — ${pr.title}

Description:
${pr.body.slice(0, 6000)}

Diff hunks:
${formatHunksForPrompt(hunks)}`;
}

export function writeScript(pr: PullRequest, hunks: readonly Hunk[]): Script {
  const output = execFileSync(
    "claude",
    [
      "-p",
      "--model",
      process.env.PR_BRAINROT_MODEL ?? "opus",
      "--output-format",
      "json",
      "--tools",
      "",
      "--json-schema",
      JSON.stringify(JSON_SCHEMA),
    ],
    // Run outside any repo so project instructions don't leak into the prompt.
    { cwd: tmpdir(), input: buildPrompt(pr, hunks), encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  const response = JSON.parse(output) as { is_error: boolean; result: string; structured_output: unknown };
  if (response.is_error) throw new Error(`claude failed: ${response.result}`);
  return ScriptSchema.parse(response.structured_output);
}
