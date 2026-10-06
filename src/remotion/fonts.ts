import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Bundled OFL fonts, so renders look the same on machines without Arial Black or SF Mono.
export const CAPTION_FONT = '"Archivo Black", sans-serif';
export const CODE_FONT = '"JetBrains Mono", monospace';
export const UI_FONT = "Inter, sans-serif";

export function loadFonts(): void {
  void loadFont({ family: "Archivo Black", url: staticFile("fonts/ArchivoBlack-Regular.ttf") });
  void loadFont({ family: "JetBrains Mono", url: staticFile("fonts/JetBrainsMono.ttf"), weight: "100 800" });
  void loadFont({ family: "Inter", url: staticFile("fonts/Inter.ttf"), weight: "100 900" });
}
