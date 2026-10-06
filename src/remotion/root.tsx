import { Composition } from "remotion";
import { FPS, GAMEPLAY, HEIGHT, WIDTH } from "../config";
import type { VideoProps } from "../types";
import { loadFonts } from "./fonts";
import { totalFrames } from "./timeline";
import { BrainrotVideo } from "./video";

loadFonts();

const EMPTY_PROPS: VideoProps = { title: "No props", prLabel: "", beats: [], gameplay: GAMEPLAY, gameplayStartSeconds: 0 };

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Brainrot"
    component={BrainrotVideo}
    width={WIDTH}
    height={HEIGHT}
    fps={FPS}
    durationInFrames={1}
    defaultProps={EMPTY_PROPS}
    calculateMetadata={({ props }) => ({ durationInFrames: totalFrames(props.beats, FPS) })}
  />
);
