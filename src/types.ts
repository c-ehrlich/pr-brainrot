import type { CharacterId } from "./config";

export type LineKind = "add" | "del" | "ctx";

export interface CodeToken {
  readonly content: string;
  readonly color: string;
}

export interface CodeLine {
  readonly kind: LineKind;
  readonly tokens: readonly CodeToken[];
}

/** A highlighted diff hunk with the line range the speaker is talking about. */
export interface CodeView {
  readonly hunkId: string;
  readonly file: string;
  readonly lines: readonly CodeLine[];
  /** 0-based, inclusive. */
  readonly focusFrom: number;
  /** 0-based, inclusive. */
  readonly focusTo: number;
}

export interface Word {
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
}

export interface Beat {
  readonly speaker: CharacterId;
  readonly text: string;
  /** Path relative to `public/`. */
  readonly audio: string;
  readonly durationMs: number;
  readonly words: readonly Word[];
  readonly code: CodeView | null;
}

export interface Gameplay {
  /** Path relative to `public/`. */
  readonly src: string;
  readonly durationInSeconds: number;
}

// A type alias rather than an interface: Remotion requires composition props
// to be assignable to Record<string, unknown>.
export type VideoProps = {
  readonly title: string;
  readonly prLabel: string;
  readonly beats: readonly Beat[];
  readonly gameplay: Gameplay;
  readonly gameplayStartSeconds: number;
};
