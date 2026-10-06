import { AbsoluteFill, Audio, Loop, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { PANEL_HEIGHT } from "../config";
import type { VideoProps } from "../types";
import { Captions } from "./captions";
import { CodePanel } from "./code-panel";
import { Speaker } from "./speaker";
import { activeBeatIndex, buildTimeline } from "./timeline";

export const BrainrotVideo: React.FC<VideoProps> = ({ title, prLabel, beats, gameplay, gameplayStartSeconds }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeline = buildTimeline(beats, fps);
  const active = activeBeatIndex(timeline, frame);
  const gameplayStart = Math.round(gameplayStartSeconds * fps);
  const gameplayFrames = gameplay.durationInSeconds * fps - gameplayStart;

  return (
    <AbsoluteFill style={{ backgroundColor: "#0d1117" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: PANEL_HEIGHT, overflow: "hidden" }}>
        <CodePanel title={title} prLabel={prLabel} timeline={timeline} active={active} />
      </div>
      <div style={{ position: "absolute", top: PANEL_HEIGHT, left: 0, right: 0, bottom: 0, overflow: "hidden" }}>
        <Loop durationInFrames={gameplayFrames}>
          <OffthreadVideo
            src={staticFile(gameplay.src)}
            trimBefore={gameplayStart}
            muted
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </Loop>
      </div>
      {timeline.map((timed, i) => (
        <Sequence key={i} from={timed.from} durationInFrames={timed.durationInFrames} layout="none">
          <Audio src={staticFile(timed.beat.audio)} />
        </Sequence>
      ))}
      {timeline.map((timed, i) => (
        // The last speaker stays on screen through the outro.
        <Sequence
          key={i}
          from={timed.from}
          durationInFrames={i === timeline.length - 1 ? Infinity : timed.durationInFrames}
        >
          <Speaker speaker={timed.beat.speaker} speaking={i === active} />
          <Captions words={timed.beat.words} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
