# pr-brainrot

Turns a GitHub pull request into a vertical "brainrot" short: Peter and Stewie explain the diff while Minecraft parkour plays underneath.

```bash
pnpm install
echo "FISH_API_KEY=..." > .env
pnpm make https://github.com/owner/repo/pull/123
# → out/owner-repo-123.mp4
```

The gameplay clip is not committed (76 MB). Fetch it once:

```bash
uvx yt-dlp -f "bv*[height<=1080][vcodec^=avc1]" -o /tmp/parkour-raw.mp4 "https://www.youtube.com/watch?v=XBIaqOm0RKQ"
ffmpeg -ss 20 -t 180 -i /tmp/parkour-raw.mp4 -an -vf "scale=-2:1080,crop=1080:960,fps=30" \
  -c:v libx264 -crf 23 -preset veryfast -movflags +faststart public/gameplay/parkour.mp4
```

Requires `gh` (logged in, for private repos), `claude` (Claude Code CLI) and `ffprobe` on `PATH`. Fish Audio API credit is separate from platform credit; add it at https://fish.audio/app/developers.

## Pipeline

1. `gh pr view` / `gh pr diff` fetch the PR. The diff is split into hunks (`src/diff.ts`), skipping lockfiles and snapshots.
2. `claude -p` writes the dialogue as structured JSON (`src/script.ts`). Each line can point at a hunk and a line range to show.
3. Fish Audio voices each line (`src/fish.ts`); Fish speech-to-text provides word timings for captions, with a length-weighted estimate as fallback.
4. Shiki highlights the referenced hunks (`src/highlight.ts`).
5. Remotion renders 1080×1920: code on top, gameplay below, the speaking character and word-by-word captions on the seam (`src/remotion/`).

## Iterating

Everything lands in `public/runs/<owner>-<repo>-<number>/` and is reused on the next run:

- `script.json` is kept until you pass `--new-script`. Edit it by hand to tweak lines; only changed lines are re-voiced.
- Output is 720×1280, re-encoded with FFmpeg (two-pass H.264 Main, yuv420p) to land under 10 MB and play in GitHub's player. `--full` keeps the 1080×1920 Remotion render instead.
- `--no-render` stops after writing `out/<slug>.props.json`.
- `pnpm studio --props=out/<slug>.props.json` opens Remotion Studio for live-editing the visuals.

## Configuration

`src/config.ts` holds the cast (Fish voice IDs, images, personas used in the prompt) and the gameplay clip. Find other voices with:

```bash
curl -s "https://api.fish.audio/model?title=Stewie&sort_by=task_count" | jq '.items[] | {_id, title, task_count}'
```

Environment overrides: `PR_BRAINROT_MODEL` (default `opus`), `FISH_TTS_MODEL` (default `s2.1-pro`), `FISH_ASR_MODEL` (default `transcribe-1`).

## Future

- Remotion needs a company licence for companies with 4+ people. Plain FFmpeg could replace it: pre-render the code panel and captions as PNG frames (or ASS subtitles), then overlay them on the gameplay with `ffmpeg -filter_complex`. That drops the licence and the headless Chrome, at the cost of fiddlier animation.
- Trigger from a PR comment (`/brainrot`) via a GitHub Action that runs this script and uploads the MP4.
