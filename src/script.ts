import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
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
        text: z.string(),
        hunk: z.string().nullable(),
        // Plain numbers: integer bounds aren't supported by every structured-output backend.
        focusFrom: z.number(),
        focusTo: z.number(),
      }),
    )
    .min(2),
});

export type Script = z.infer<typeof ScriptSchema>;

// Draft-07 without "$schema": the claude CLI rejects the 2020-12 URI.
const { $schema: _, ...JSON_SCHEMA } = z.toJSONSchema(ScriptSchema, { target: "draft-07" });

export const PROVIDERS = ["anthropic", "openrouter", "claude-code"] as const;
export type Provider = (typeof PROVIDERS)[number];

const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: "claude-opus-5-5",
  openrouter: "anthropic/claude-opus-5.5",
  "claude-code": "opus",
};

/** Models that accept server-side refusal fallbacks (`fallbacks: "default"`). */
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

/** Explicit `PR_BRAINROT_PROVIDER`, else whichever API key is set, else the local Claude Code CLI. */
export function resolveProvider(): Provider {
  const explicit = process.env.PR_BRAINROT_PROVIDER;
  if (explicit) {
    if (!(PROVIDERS as readonly string[]).includes(explicit)) {
      throw new Error(`PR_BRAINROT_PROVIDER must be one of ${PROVIDERS.join(", ")}`);
    }
    return explicit as Provider;
  }
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  return "claude-code";
}

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

async function viaAnthropic(prompt: string, model: string): Promise<Script> {
  const client = new Anthropic();
  const useFallbacks = FALLBACK_MODELS.has(model);
  const response = await client.beta.messages.parse({
    model,
    max_tokens: 16000,
    ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    output_config: { effort: "medium", format: betaZodOutputFormat(ScriptSchema) },
    messages: [{ role: "user", content: prompt }],
  });
  if (response.stop_reason === "refusal") {
    throw new Error(`Claude declined to write the script: ${response.stop_details?.explanation ?? "no explanation"}`);
  }
  if (!response.parsed_output) throw new Error(`Claude returned no script (stop reason: ${response.stop_reason})`);
  return response.parsed_output;
}

async function viaOpenRouter(prompt: string, model: string): Promise<Script> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/c-ehrlich/pr-brainrot",
      "X-Title": "pr-brainrot",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_schema", json_schema: { name: "script", strict: true, schema: JSON_SCHEMA } },
    }),
  });
  if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${await response.text()}`);
  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error(`OpenRouter returned no content: ${JSON.stringify(body).slice(0, 500)}`);
  return ScriptSchema.parse(JSON.parse(content));
}

function viaClaudeCode(prompt: string, model: string): Script {
  const output = execFileSync(
    "claude",
    ["-p", "--model", model, "--output-format", "json", "--tools", "", "--json-schema", JSON.stringify(JSON_SCHEMA)],
    // Run outside any repo so project instructions don't leak into the prompt.
    { cwd: tmpdir(), input: prompt, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  const response = JSON.parse(output) as { is_error: boolean; result: string; structured_output: unknown };
  if (response.is_error) throw new Error(`claude failed: ${response.result}`);
  return ScriptSchema.parse(response.structured_output);
}

export async function writeScript(pr: PullRequest, hunks: readonly Hunk[]): Promise<Script> {
  const provider = resolveProvider();
  const model = process.env.PR_BRAINROT_MODEL || DEFAULT_MODELS[provider];
  console.log(`Writing script with ${provider} (${model}, ${hunks.length} hunks)…`);
  const prompt = buildPrompt(pr, hunks);
  switch (provider) {
    case "anthropic":
      return viaAnthropic(prompt, model);
    case "openrouter":
      return viaOpenRouter(prompt, model);
    case "claude-code":
      return viaClaudeCode(prompt, model);
  }
}
