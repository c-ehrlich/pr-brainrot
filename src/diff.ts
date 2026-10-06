import type { LineKind } from "./types";

export interface DiffLine {
  readonly kind: LineKind;
  readonly text: string;
}

export interface Hunk {
  readonly id: string;
  readonly file: string;
  readonly header: string;
  readonly lines: readonly DiffLine[];
}

const IGNORED_FILE = /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?)$|\.(snap|svg|map|min\.js)$/;
const MAX_PROMPT_CHARS = 80_000;

export function parseDiff(diff: string): Hunk[] {
  const hunks: { id: string; file: string; header: string; lines: DiffLine[] }[] = [];
  let file: string | null = null;
  let current: (typeof hunks)[number] | null = null;

  for (const raw of diff.split("\n")) {
    const fileMatch = /^diff --git a\/.+ b\/(.+)$/.exec(raw);
    if (fileMatch?.[1]) {
      file = IGNORED_FILE.test(fileMatch[1]) ? null : fileMatch[1];
      current = null;
      continue;
    }
    if (file === null) continue;
    if (raw.startsWith("@@")) {
      current = { id: `h${hunks.length + 1}`, file, header: raw, lines: [] };
      hunks.push(current);
      continue;
    }
    if (current === null) continue;
    const marker = raw[0];
    const text = raw.slice(1);
    if (marker === "+") current.lines.push({ kind: "add", text });
    else if (marker === "-") current.lines.push({ kind: "del", text });
    else if (marker === " ") current.lines.push({ kind: "ctx", text });
  }
  return hunks;
}

/** Renders hunks with ids and 1-based line numbers so the model can point at them. */
export function formatHunksForPrompt(hunks: readonly Hunk[]): string {
  let out = "";
  for (const hunk of hunks) {
    const prefix = { add: "+", del: "-", ctx: " " } as const;
    const body = hunk.lines.map((line, i) => `${String(i + 1).padStart(3)} ${prefix[line.kind]}${line.text}`).join("\n");
    const block = `### ${hunk.id} — ${hunk.file}\n${hunk.header}\n${body}\n\n`;
    if (out.length + block.length > MAX_PROMPT_CHARS) {
      out += `(diff truncated: ${hunks.length - hunks.indexOf(hunk)} more hunks omitted)\n`;
      break;
    }
    out += block;
  }
  return out;
}
