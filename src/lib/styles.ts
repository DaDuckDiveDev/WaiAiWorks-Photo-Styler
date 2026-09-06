/**
 * Style presets. Prompts carried over from the legacy Flask app (stylize.py)
 * with light cleanup — the "do not add or duplicate people" guardrail is the
 * part that keeps render failures down, so it stays in every prompt.
 */

export type StyleId = "anime" | "pixar" | "comic" | "disney";

export type StylePreset = {
  id: StyleId;
  label: string;
  blurb: string;
  prompt: string;
};

const PRESERVE_SUBJECTS =
  "Reimagine only the people already in the image — do not add, duplicate, or invent extra characters. " +
  "Preserve the number, position, and identity of every person exactly.";

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "anime",
    label: "Anime",
    blurb: "Hand-drawn warmth, watercolor texture, pastel earth tones.",
    prompt:
      "A warm and whimsical group portrait in a hand-drawn Japanese animation style. " +
      `${PRESERVE_SUBJECTS} ` +
      "Stylize them with expressive features: large soulful eyes, gentle blush on the cheeks, and flowing hand-drawn hair. " +
      "Use clean line art, watercolor textures, and a pastel and earth-tone palette. " +
      "Loosely stylize the background with cozy light and a film-grain finish. " +
      "Absolutely avoid blur or distortion. Keep the emotional warmth and storytelling charm of the scene.",
  },
  {
    id: "pixar",
    label: "3D Animated",
    blurb: "Soft cinematic lighting, glossy textures, big expressive eyes.",
    prompt:
      "Turn this photo into a modern 3D animated character portrait. " +
      `${PRESERVE_SUBJECTS} ` +
      "Preserve each person's facial features, skin tone, hair style, and expression. " +
      "Use soft lighting, detailed stylized textures, large expressive eyes, and a vibrant color palette. " +
      "Aim for cinematic depth-of-field, emotional warmth, and a playful, heartwarming feel.",
  },
  {
    id: "comic",
    label: "Comic",
    blurb: "Bold ink outlines, cel shading, halftone punch.",
    prompt:
      "A dramatic, high-contrast comic book illustration of the people in the photo. " +
      `${PRESERVE_SUBJECTS} ` +
      "Maintain all facial features, skin tones, and body positions exactly. " +
      "Apply bold black ink outlines, vibrant cel-shaded coloring, and halftone texture detail. " +
      "Use sharp lighting and stylized shadows for dynamic comic-panel energy. " +
      "Simplify the background with action lines or comic blur effects. " +
      "Avoid blur or smudging — keep linework clean and colors poppy.",
  },
  {
    id: "disney",
    label: "Storybook",
    blurb: "Dreamy glow, watercolor shading, romantic fantasy palette.",
    prompt:
      "Transform this photo into an elegant, dreamy classic animated storybook style. " +
      `${PRESERVE_SUBJECTS} ` +
      "Preserve their facial features, skin tone, and expressions. " +
      "Use soft glowing light, gentle watercolor-style shading, and flowing outlines. " +
      "Add a pastel palette and a romantic fantasy atmosphere. " +
      "Do not add new characters or distort the original ones.",
  },
];

export const STYLE_IDS = STYLE_PRESETS.map((preset) => preset.id);

export function getPreset(id: string): StylePreset | undefined {
  return STYLE_PRESETS.find((preset) => preset.id === id);
}
