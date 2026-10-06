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

function gh(args: readonly string[]): string {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

export function fetchPullRequest(url: string): PullRequest {
  const { owner, repo, number } = parsePrUrl(url);
  const view = JSON.parse(gh(["pr", "view", url, "--json", "title,body"])) as {
    title: string;
    body: string;
  };
  return { owner, repo, number, title: view.title, body: view.body, diff: gh(["pr", "diff", url]) };
}
