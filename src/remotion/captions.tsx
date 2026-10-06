import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { PANEL_HEIGHT } from "../config";
import type { Word } from "../types";

const WORDS_PER_PAGE = 3;

export const Captions: React.FC<{ words: readonly Word[] }> = ({ words }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nowMs = (frame / fps) * 1000;

  let activeIndex = 0;
  for (const [i, word] of words.entries()) {
    if (word.startMs <= nowMs) activeIndex = i;
  }
  const active = words[activeIndex];
  if (!active || nowMs > (words.at(-1)?.endMs ?? 0) + 400) return null;

  const pageStart = activeIndex - (activeIndex % WORDS_PER_PAGE);
  const page = words.slice(pageStart, pageStart + WORDS_PER_PAGE);
  const pop = spring({ frame: frame - Math.round((active.startMs / 1000) * fps), fps, config: { damping: 12, stiffness: 300 } });

  return (
    <div
      style={{
        position: "absolute",
        top: PANEL_HEIGHT - 40,
        left: 40,
        right: 40,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "0 40px",
        fontFamily: '"Arial Black", "Helvetica Neue", Arial, sans-serif',
        fontWeight: 900,
        fontSize: 88,
        lineHeight: 1.1,
        textTransform: "uppercase",
        textAlign: "center",
      }}
    >
      {page.map((word, i) => {
        const isActive = pageStart + i === activeIndex;
        return (
          <span
            key={pageStart + i}
            style={{
              color: isActive ? "#ffe14d" : "#ffffff",
              WebkitTextStroke: "14px #000",
              paintOrder: "stroke fill",
              textShadow: "0 6px 0 rgba(0,0,0,0.5)",
              transform: isActive ? `scale(${0.9 + 0.12 * pop})` : undefined,
              display: "inline-block",
            }}
          >
            {word.text}
          </span>
        );
      })}
    </div>
  );
};
