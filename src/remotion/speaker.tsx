import { Img, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { CHARACTERS, type CharacterId } from "../config";

const HEIGHT = 680;

export const Speaker: React.FC<{ speaker: CharacterId; speaking: boolean }> = ({ speaker, speaking }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const character = CHARACTERS[speaker];
  const enter = spring({ frame, fps, config: { damping: 11, stiffness: 160 } });
  const bob = speaking ? Math.sin(frame / 2.2) : 0;

  return (
    <Img
      src={staticFile(character.image)}
      style={{
        position: "absolute",
        bottom: -20,
        [character.side]: 30,
        height: HEIGHT,
        transformOrigin: "bottom center",
        transform: `translateY(${(1 - enter) * 400 - Math.abs(bob) * 14}px) scale(${0.6 + 0.4 * enter}) rotate(${bob * 3}deg)`,
        filter: "drop-shadow(0 12px 24px rgba(0,0,0,0.6))",
      }}
    />
  );
};
