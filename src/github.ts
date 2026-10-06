import { execFileSync } from "node:child_process";

export interface PullRequest {
  readonly owner: string;
  readonly repo: string;
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly diff: string;
}

export function parsePrUrl(url: string): { owner: string; repo: string; number: number } {
  const match = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(url);
  if (!match?.[1] || !match[2] || !match[3]) {
    throw new Error(`Not a GitHub pull request URL: ${url}`);
  }
  return { owner: match[1], repo: match[2], number: Number(match[3]) };
}

/** Runs the GitHub CLI. `json` is sent as the request body of `gh api --input -`. */
export function gh(args: readonly string[], json?: unknown): string {
  return execFileSync("gh", json === undefined ? args : [...args, "--input", "-"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    input: json === undefined ? undefined : JSON.stringify(json),
  });
}

/** Uses REST rather than `gh pr`, whose GraphQL calls share a separate, easily exhausted quota. */
export function fetchPullRequest(url: string): PullRequest {
  const { owner, repo, number } = parsePrUrl(url);
  const path = `repos/${owner}/${repo}/pulls/${number}`;
  const view = JSON.parse(gh(["api", path, "--jq", "{title, body}"])) as { title: string; body: string | null };
  const diff = gh(["api", path, "-H", "Accept: application/vnd.github.diff"]);
  return { owner, repo, number, title: view.title, body: view.body ?? "", diff };
}
