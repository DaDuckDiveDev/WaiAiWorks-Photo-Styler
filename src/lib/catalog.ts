/**
 * Everything the studio can make, and how the pieces combine.
 *
 * A render is a "recipe": a finish (one of the illustrated looks, or "photo" to
 * keep it a real photograph) plus an optional photo fix. A plain look is
 * `{ finish: "anime", fix: null }`; a fix is `{ finish: "photo" | look, fix }`.
 *
 * This file is shared by the browser and the server, so it holds ids and
 * labels only. The prompt text lives in lib/prompts.ts and never ships to the
 * client.
 */

/* Ids are unchanged from the Flask app so older history still lines up. */
export type LookId =
  | "anime"
  | "pixar"
  | "comic"
  | "disney"
  | "acrylic"
  | "felt"
  | "tarot"
  | "marble"
  | "nightclub";
export type FinishId = LookId | "photo";
export type FixId = "open-eyes" | "eye-contact" | "eyes-both";

export type Recipe = { finish: FinishId; fix: FixId | null };

export type Look = { id: LookId; label: string; blurb: string };
export type Fix = {
  id: FixId;
  label: string;
  blurb: string;
  /** How the fix reads after a finish: "Anime, eyes opened". */
  outcome: string;
};

export const LOOKS: readonly Look[] = [
  { id: "anime", label: "Anime", blurb: "Hand-drawn warmth, watercolor texture." },
  { id: "pixar", label: "3D Animated", blurb: "Soft cinematic light, glossy detail." },
  { id: "comic", label: "Comic", blurb: "Bold ink, cel shading, halftone punch." },
  { id: "disney", label: "Storybook", blurb: "Dreamy glow, romantic fantasy palette." },
  { id: "acrylic", label: "Acrylic", blurb: "Thick brushstrokes, bold blocks of color." },
  { id: "felt", label: "Felt Art", blurb: "Needle-felted wool, cozy handmade craft." },
  { id: "tarot", label: "Tarot Card", blurb: "Vintage ink, sun and stars, ornate border." },
  { id: "marble", label: "Marble Statue", blurb: "Carved white marble in a museum hall." },
  {
    id: "nightclub",
    label: "Nightclub",
    blurb: "A frame from a 2D animated film, lit with glowing neon.",
  },
];

export const FIXES: readonly Fix[] = [
  {
    id: "open-eyes",
    label: "Open closed eyes",
    blurb: "For blinks and half-closed eyes.",
    outcome: "eyes opened",
  },
  {
    id: "eye-contact",
    label: "Look at the camera",
    blurb: "Turns wandering eyes toward the lens.",
    outcome: "eyes on camera",
  },
  {
    id: "eyes-both",
    label: "Open eyes + look at camera",
    blurb: "Both fixes in a single render.",
    outcome: "eyes opened and on camera",
  },
];

/** The finishes a fix can be rendered in, in display order. */
export const FINISHES: readonly { id: FinishId; label: string }[] = [
  { id: "photo", label: "Photo" },
  ...LOOKS.map(({ id, label }) => ({ id, label })),
];

export const DEFAULT_RECIPE: Recipe = { finish: "anime", fix: null };

const LOOK_IDS = new Set<string>(LOOKS.map((look) => look.id));
const FIX_IDS = new Set<string>(FIXES.map((fix) => fix.id));

export function isLookId(value: unknown): value is LookId {
  return typeof value === "string" && LOOK_IDS.has(value);
}

export function isFixId(value: unknown): value is FixId {
  return typeof value === "string" && FIX_IDS.has(value);
}

export function getLook(id: LookId): Look {
  return LOOKS.find((look) => look.id === id) as Look;
}

export function getFix(id: FixId): Fix {
  return FIXES.find((fix) => fix.id === id) as Fix;
}

export function finishLabel(finish: FinishId): string {
  return finish === "photo" ? "Photo" : getLook(finish).label;
}

/** "Anime", "Anime, eyes opened", "Photo, eyes on camera". */
export function recipeLabel(recipe: Recipe): string {
  const finish = finishLabel(recipe.finish);
  return recipe.fix ? `${finish}, ${getFix(recipe.fix).outcome}` : finish;
}

/** Filename-safe: "anime", "photo-open-eyes", "disney-eyes-both". */
export function recipeSlug(recipe: Recipe): string {
  return recipe.fix ? `${recipe.finish}-${recipe.fix}` : recipe.finish;
}

export function sameRecipe(a: Recipe, b: Recipe): boolean {
  return a.finish === b.finish && a.fix === b.fix;
}

/**
 * Validates an untrusted recipe from a request body. A photo finish only makes
 * sense with a fix — "photo" on its own would be an expensive no-op.
 */
export function parseRecipe(input: { finish?: unknown; fix?: unknown }): Recipe | null {
  const fix = input.fix === null || input.fix === undefined || input.fix === "" ? null : input.fix;
  if (fix !== null && !isFixId(fix)) return null;

  if (input.finish === "photo") {
    return fix ? { finish: "photo", fix } : null;
  }
  if (!isLookId(input.finish)) return null;
  return { finish: input.finish, fix };
}
