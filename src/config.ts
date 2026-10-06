export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const PANEL_HEIGHT = HEIGHT / 2;

/** Pause after each line so speakers don't talk over each other. */
export const GAP_FRAMES = 6;
export const OUTRO_FRAMES = 30;

export const CHARACTERS = {
  peter: {
    name: "Peter",
    voiceId: "d75c270eaee14c8aa1e9e980cc37cf1b",
    image: "characters/peter.png",
    side: "left",
    persona:
      "Peter Griffin: loud, dim, easily distracted, asks the dumb questions, makes absurd comparisons, occasionally says 'holy crap' or laughs 'hehehehe'.",
  },
  stewie: {
    name: "Stewie",
    voiceId: "e91c4f5974f149478a35affe820d02ac",
    image: "characters/stewie.png",
    side: "right",
    persona:
      "Stewie Griffin: condescending British baby genius who actually understands the code, explains it precisely, insults Peter ('you fat imbecile', 'oh dear god').",
  },
} as const;

export type CharacterId = keyof typeof CHARACTERS;
export const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];

export const GAMEPLAY = {
  src: "gameplay/parkour.mp4",
  durationInSeconds: 180,
} as const;
