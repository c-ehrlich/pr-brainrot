# pr-brainrot

Peter and Stewie explain your pull request over Minecraft parkour, as a vertical video posted to the PR.

https://github.com/user-attachments/assets/9f98e16d-da7e-4843-a2bd-66b49ebf3998

<sub>Made by the action for [a rate limiter fix](https://github.com/c-ehrlich/pr-brainrot-sandbox/pull/1).</sub>

- Claude (or any model on OpenRouter) writes a short dialogue from the PR description and diff.
- Fish Audio voices it, and its speech-to-text times the word-by-word captions.
- Remotion renders the code being discussed on top and gameplay below. FFmpeg compresses the result under 10 MB so GitHub plays it inline.

A video takes about 3 to 5 minutes on a standard runner.

## GitHub Action

### Secrets

Add these as repository or organization secrets:

| Secret | What it is |
| --- | --- |
| `FISH_API_KEY` | [Fish Audio](https://fish.audio/app/developers) API key. API credit is separate from platform credit. |
| `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` | Writes the script. Set one. |
| `BRAINROT_UPLOAD_TOKEN` | Personal access token used only to upload the video. GitHub's attachment endpoint rejects workflow tokens. Fine-grained: Contents, Issues and Pull requests read & write on the repositories that use the action. |

### Workflow

Pick a trigger: copy [`examples/on-comment.yml`](examples/on-comment.yml) to run when someone comments `/brainrot` on a PR, or [`examples/on-pull-request.yml`](examples/on-pull-request.yml) to run for every PR when it is opened or marked ready for review. Save it as `.github/workflows/brainrot.yml`.

```yaml
on:
  issue_comment:
    types: [created]

jobs:
  brainrot:
    if: github.event.issue.pull_request && startsWith(github.event.comment.body, '/brainrot')
    runs-on: ubuntu-latest
    permissions:
      contents: read
      issues: write
      pull-requests: write
    steps:
      - uses: c-ehrlich/pr-brainrot@v1
        with:
          fish-api-key: ${{ secrets.FISH_API_KEY }}
          upload-token: ${{ secrets.BRAINROT_UPLOAD_TOKEN }}
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

The comment trigger only runs for commenters whose association is in `allowed-associations`, so strangers cannot spend your credits on public repositories. The bot reacts 👀 while it works, 🚀 when the video is posted, and 😕 with an error comment if it fails. The PR trigger skips drafts and pull requests from forks, which receive no secrets; comment `/brainrot` on those instead. The action reads the diff through the API and never checks out or runs pull request code.

### Inputs

| Input | Default | Description |
| --- | --- | --- |
| `fish-api-key` | required | Fish Audio API key. |
| `upload-token` | required | Personal access token for the video upload. |
| `anthropic-api-key` | | Anthropic API key. |
| `openrouter-api-key` | | OpenRouter API key. Used when no Anthropic key is set. |
| `model` | `claude-opus-5-5` / `anthropic/claude-opus-5.5` | Script-writing model. |
| `mode` | `comment` | `comment` posts a new comment. `edit` adds a section to the PR description; reruns replace it. |
| `command` | `/brainrot` | Comment prefix that triggers a run. |
| `allowed-associations` | `OWNER,MEMBER,COLLABORATOR` | Who can trigger a run by comment. |
| `gameplay-url` | bundled parkour clip | MP4 to use as the background. |
| `github-token` | `github.token` | Reads the PR and posts the result. |

Output: `video-url`, the uploaded video's URL.

## Local CLI

```bash
pnpm install
cp .env.example .env   # add FISH_API_KEY, plus ANTHROPIC_API_KEY or OPENROUTER_API_KEY
pnpm make https://github.com/owner/repo/pull/123
# → out/owner-repo-123.mp4
```

Requires `gh` (logged in), `ffmpeg` and `ffprobe` on `PATH`. Without an Anthropic or OpenRouter key, the script is written by the local `claude` CLI (Claude Code).

| Flag | Effect |
| --- | --- |
| `--new-script` | Ask the model again instead of reusing `public/runs/<slug>/script.json`. |
| `--no-render` | Stop after writing `out/<slug>.props.json`. |
| `--full` | Keep the 1080×1920 render instead of the compressed 720×1280 one. |
| `--gameplay=<url>` | Use another gameplay clip. |
| `--publish=comment\|edit` | Upload the video and post it to the PR, like the action. |

Each run caches its script and voiced lines under `public/runs/<owner>-<repo>-<number>/`. Edit `script.json` by hand to tweak lines; only changed lines are voiced again. `pnpm studio --props=out/<slug>.props.json` opens Remotion Studio for live-editing the visuals.

Environment overrides: `PR_BRAINROT_PROVIDER` (`anthropic`, `openrouter` or `claude-code`), `PR_BRAINROT_MODEL`, `FISH_TTS_MODEL` (default `s2.1-pro`), `FISH_ASR_MODEL` (default `transcribe-1`).

## Customizing

`src/config.ts` holds the cast: Fish voice IDs, images, and the personas used in the prompt. Find other voices with:

```bash
curl -s "https://api.fish.audio/model?title=Stewie&sort_by=task_count" | jq '.items[] | {_id, title, task_count}'
```

## Notes

- Remotion requires a [company license](https://www.remotion.pro/license) for companies with four or more people. FFmpeg alone could replace it: render the code panel and captions as image frames or ASS subtitles, then overlay them on the gameplay with `ffmpeg -filter_complex`. That removes the license and the headless Chrome, at the cost of fiddlier animation.
- The upload uses the undocumented endpoint behind GitHub's drag-and-drop attachments. It is the only way to get a video that plays inline, and it may change without notice.
- Character images, voices and gameplay belong to their owners. This is a non-commercial joke project.
- Fonts: [Archivo Black](https://github.com/Omnibus-Type/ArchivoBlack), [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) and [Inter](https://github.com/rsms/inter), all under the SIL Open Font License (`public/fonts/`).
