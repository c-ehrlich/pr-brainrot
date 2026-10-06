import { GAP_FRAMES, OUTRO_FRAMES } from "../config";
import type { Beat, CodeView } from "../types";

export interface TimedBeat {
  readonly beat: Beat;
  readonly from: number;
  readonly durationInFrames: number;
  /** The beat's code, or the most recent earlier beat's code when it has none. */
  readonly code: CodeView | null;
}

export function buildTimeline(beats: readonly Beat[], fps: number): TimedBeat[] {
  let from = 0;
  let code: CodeView | null = null;
  return beats.map((beat) => {
    const durationInFrames = Math.ceil((beat.durationMs / 1000) * fps) + GAP_FRAMES;
    code = beat.code ?? code;
    const timed = { beat, from, durationInFrames, code };
    from += durationInFrames;
    return timed;
  });
}

export function totalFrames(beats: readonly Beat[], fps: number): number {
  const timeline = buildTimeline(beats, fps);
  const last = timeline.at(-1);
  return Math.max(1, last ? last.from + last.durationInFrames + OUTRO_FRAMES : 1);
}

/** Index of the beat on screen at `frame`; the last beat stays up during the outro. */
export function activeBeatIndex(timeline: readonly TimedBeat[], frame: number): number {
  let index = 0;
  for (const [i, timed] of timeline.entries()) {
    if (timed.from <= frame) index = i;
  }
  return index;
}
