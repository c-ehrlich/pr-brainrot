import { bundledLanguages, codeToTokens } from "shiki";
import type { Hunk } from "./diff";
import type { CodeLine, CodeToken } from "./types";

const THEME = "github-dark-default";

const EXTENSION_LANGUAGES: Record<string, string> = {
  mts: "ts",
  cts: "ts",
  mjs: "js",
  cjs: "js",
  yml: "yaml",
  rs: "rust",
  py: "python",
  rb: "ruby",
  sh: "bash",
};

function languageFor(file: string): string {
  const extension = file.split(".").pop()?.toLowerCase() ?? "";
  const lang = EXTENSION_LANGUAGES[extension] ?? extension;
  return lang in bundledLanguages ? lang : "text";
}

/** Drops the first `count` characters across a line's tokens. */
function trimLeading(tokens: readonly CodeToken[], count: number): CodeToken[] {
  let remaining = count;
  const result: CodeToken[] = [];
  for (const token of tokens) {
    const cut = Math.min(remaining, token.content.length);
    remaining -= cut;
    if (cut < token.content.length) result.push({ ...token, content: token.content.slice(cut) });
  }
  return result;
}

export async function highlightHunk(hunk: Hunk): Promise<CodeLine[]> {
  const texts = hunk.lines.map((l) => l.text.replace(/\t/g, "  "));
  // Strip the indentation every line shares so deeply nested code still fits.
  const indent = Math.min(...texts.filter((t) => t.trim()).map((t) => t.length - t.trimStart().length), Infinity);
  const { tokens } = await codeToTokens(texts.join("\n"), {
    lang: languageFor(hunk.file) as "text",
    theme: THEME,
  });
  return hunk.lines.map((line, i) => ({
    kind: line.kind,
    tokens: trimLeading(
      (tokens[i] ?? []).map((t) => ({ content: t.content, color: t.color ?? "#e6edf3" })),
      Number.isFinite(indent) ? indent : 0,
    ),
  }));
}
