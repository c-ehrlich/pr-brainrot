import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { PANEL_HEIGHT, WIDTH } from "../config";
import type { CodeLine, CodeView, LineKind } from "../types";
import type { TimedBeat } from "./timeline";

const HEADER_HEIGHT = 110;
const BODY_HEIGHT = PANEL_HEIGHT - HEADER_HEIGHT;
const MARKER_WIDTH = 44;
const CODE_WIDTH = WIDTH - MARKER_WIDTH - 24;
const LINE_HEIGHT_RATIO = 1.5;
const MAX_FONT_SIZE = 40;
const MIN_FONT_SIZE = 26;
/** Monospace glyph width relative to font size. */
const CHAR_WIDTH_RATIO = 0.6;
const FONT = '"JetBrains Mono", "SF Mono", Menlo, monospace';

const LINE_STYLE: Record<LineKind, { background: string; marker: string; markerColor: string }> = {
  add: { background: "rgba(46,160,67,0.22)", marker: "+", markerColor: "#3fb950" },
  del: { background: "rgba(248,81,73,0.22)", marker: "-", markerColor: "#f85149" },
  ctx: { background: "transparent", marker: " ", markerColor: "#8b949e" },
};

/** Largest font size at which the longest focused line fits the panel width. */
function fontSizeFor(view: CodeView): number {
  const focused = view.lines.slice(view.focusFrom, view.focusTo + 1);
  const longest = Math.max(1, ...focused.map((l) => l.tokens.reduce((n, t) => n + t.content.length, 0)));
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, CODE_WIDTH / (longest * CHAR_WIDTH_RATIO)));
}

/** Line index (fractional) at the centre of the focused range. */
function focusCentre(view: CodeView): number {
  return (view.focusFrom + view.focusTo + 1) / 2;
}

const Line: React.FC<{ line: CodeLine; focused: boolean; lineHeight: number }> = ({ line, focused, lineHeight }) => {
  const style = LINE_STYLE[line.kind];
  return (
    <div
      style={{
        height: lineHeight,
        display: "flex",
        alignItems: "center",
        background: style.background,
        opacity: focused ? 1 : 0.35,
        whiteSpace: "pre",
      }}
    >
      <span style={{ width: MARKER_WIDTH, flexShrink: 0, textAlign: "center", color: style.markerColor }}>{style.marker}</span>
      {line.tokens.map((token, i) => (
        <span key={i} style={{ color: token.color }}>
          {token.content}
        </span>
      ))}
    </div>
  );
};

const TitleCard: React.FC<{ title: string; prLabel: string }> = ({ title, prLabel }) => (
  <div
    style={{
      height: "100%",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      padding: "0 80px",
      gap: 32,
      fontFamily: '"Helvetica Neue", Arial, sans-serif',
    }}
  >
    <div style={{ color: "#8b949e", fontSize: 40, fontFamily: FONT }}>{prLabel}</div>
    <div style={{ color: "#f0f6fc", fontSize: 92, fontWeight: 900, lineHeight: 1.05 }}>{title}</div>
  </div>
);

export const CodePanel: React.FC<{
  title: string;
  prLabel: string;
  timeline: readonly TimedBeat[];
  active: number;
}> = ({ title, prLabel, timeline, active }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const current = timeline[active];
  const view = current?.code;
  if (!current || !view) return <TitleCard title={title} prLabel={prLabel} />;

  const previous = timeline[active - 1]?.code ?? null;
  const progress = spring({ frame: frame - current.from, fps, config: { damping: 200 }, durationInFrames: 15 });
  const sameHunk = previous !== null && previous.hunkId === view.hunkId;
  // Within a hunk, pan and zoom from the previous focus; a new hunk slides in.
  const from = sameHunk ? previous : view;
  const fontSize = interpolate(progress, [0, 1], [fontSizeFor(from), fontSizeFor(view)]);
  const lineHeight = fontSize * LINE_HEIGHT_RATIO;
  const centre = interpolate(progress, [0, 1], [focusCentre(from), focusCentre(view)]);
  const scroll = centre * lineHeight - BODY_HEIGHT / 2;
  const enter = sameHunk ? 1 : progress;
  const directory = view.file.split("/").slice(0, -1).join("/");
  const fileName = view.file.split("/").at(-1);

  return (
    <div style={{ height: "100%", background: "#0d1117", fontFamily: FONT }}>
      <div
        style={{
          height: HEADER_HEIGHT,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 32px",
          borderBottom: "2px solid #30363d",
          background: "#161b22",
        }}
      >
        <div style={{ color: "#8b949e", fontSize: 24, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {prLabel} · {directory}
        </div>
        <div style={{ color: "#f0f6fc", fontSize: 36, fontWeight: 700 }}>{fileName}</div>
      </div>
      <div
        style={{
          height: BODY_HEIGHT,
          overflow: "hidden",
          position: "relative",
          fontSize,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 60}px)`,
        }}
      >
        <div style={{ transform: `translateY(${-scroll}px)` }}>
          {view.lines.map((line, i) => (
            <Line key={i} line={line} lineHeight={lineHeight} focused={i >= view.focusFrom && i <= view.focusTo} />
          ))}
        </div>
      </div>
    </div>
  );
};
