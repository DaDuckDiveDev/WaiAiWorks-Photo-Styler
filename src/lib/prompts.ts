/**
 * Prompt text for every recipe. Server-only: imported by the stylize route and
 * nothing the browser loads, so the wording isn't shipped to clients.
 *
 * The look prompts are carried over from the legacy Flask app (stylize.py).
 * The "do not add or duplicate people" guardrail is what keeps render failures
 * down, so it stays in every prompt, fixes included.
 */

import type { FixId, LookId, Recipe } from "@/lib/catalog";

const PRESERVE_SUBJECTS =
  "Reimagine only the people already in the image — do not add, duplicate, or invent extra characters. " +
  "Preserve the number, position, and identity of every person exactly.";

const LOOK_PROMPTS: Record<LookId, string> = {
  anime:
    "A warm and whimsical group portrait in a hand-drawn Japanese animation style. " +
    `${PRESERVE_SUBJECTS} ` +
    "Stylize them with expressive features: large soulful eyes, gentle blush on the cheeks, and flowing hand-drawn hair. " +
    "Use clean line art, watercolor textures, and a pastel and earth-tone palette. " +
    "Loosely stylize the background with cozy light and a film-grain finish. " +
    "Absolutely avoid blur or distortion. Keep the emotional warmth and storytelling charm of the scene.",
  pixar:
    "Turn this photo into a modern 3D animated character portrait. " +
    `${PRESERVE_SUBJECTS} ` +
    "Preserve each person's facial features, skin tone, hair style, and expression. " +
    "Use soft lighting, detailed stylized textures, large expressive eyes, and a vibrant color palette. " +
    "Aim for cinematic depth-of-field, emotional warmth, and a playful, heartwarming feel.",
  comic:
    "A dramatic, high-contrast comic book illustration of the people in the photo. " +
    `${PRESERVE_SUBJECTS} ` +
    "Maintain all facial features, skin tones, and body positions exactly. " +
    "Apply bold black ink outlines, vibrant cel-shaded coloring, and halftone texture detail. " +
    "Use sharp lighting and stylized shadows for dynamic comic-panel energy. " +
    "Simplify the background with action lines or comic blur effects. " +
    "Avoid blur or smudging — keep linework clean and colors poppy.",
  disney:
    "Transform this photo into an elegant, dreamy classic animated storybook style. " +
    `${PRESERVE_SUBJECTS} ` +
    "Preserve their facial features, skin tone, and expressions. " +
    "Use soft glowing light, gentle watercolor-style shading, and flowing outlines. " +
    "Add a pastel palette and a romantic fantasy atmosphere. " +
    "Do not add new characters or distort the original ones.",
  acrylic:
    "Transform this photo into a bold acrylic painting on canvas. " +
    `${PRESERVE_SUBJECTS} ` +
    "Keep each person's face shape, skin tone, hairstyle, expression, pose, and clothing recognizable, " +
    "and keep the original composition and camera angle. " +
    "Paint with thick, visible brushstrokes and palette-knife texture, simplified shapes, and flat blocks of " +
    "bright, saturated color — warm oranges, sunny yellows, and deep blues — with confident dark edges where shapes meet. " +
    "Simplify the background into broad painted color fields. " +
    "It must look like a real hand-painted acrylic on canvas, not a photo filter. No text or signature.",
  felt:
    "Transform this photo into a handmade needle-felted wool scene, like a cozy stop-motion craft diorama. " +
    `${PRESERVE_SUBJECTS} ` +
    "Turn each person into a soft felt figure that keeps their face shape, skin tone, hairstyle, expression, pose, " +
    "and clothing colors and patterns recognizable. " +
    "Use fuzzy wool fibers on every surface, rosy felted cheeks, simple stitched details, and small embroidered " +
    "accents on clothing. " +
    "Rebuild the background, furniture, and objects in felt and knitted textures, matching the original layout " +
    "and camera angle. " +
    "Soft, warm, even lighting with gentle shadows, like a tabletop miniature photographed up close. No text.",
  tarot:
    "Transform this photo into an illustrated vintage tarot card. " +
    `${PRESERVE_SUBJECTS} ` +
    "Draw each person as a stylized tarot figure who keeps their face, skin tone, hairstyle, expression, pose, " +
    "and outfit recognizable, in the original arrangement. " +
    "Use fine ink linework, flat muted colors — sage green, mustard gold, dusty teal, and cream — and a subtle " +
    "aged-paper grain. " +
    "Frame the whole scene inside an ornate tarot card border with celestial motifs: a smiling sun, a crescent moon, " +
    "and small stars. " +
    "Simplify the background into a decorative illustrated backdrop. " +
    "Leave out any text, titles, numbers, or lettering.",
  marble:
    "Transform this photo into a classical sculpture carved from polished white marble. " +
    `${PRESERVE_SUBJECTS} ` +
    "Turn every person into carved stone as one statue group on a stone plinth, keeping each face, hairstyle, " +
    "expression, pose, body type, and clothing recognizable, with flowing drapery folds and fine chisel detail. " +
    "Show soft gray veining in the marble and smooth, polished highlights. " +
    "Place the statue in a grand, softly lit museum gallery with columns and a patterned stone floor, " +
    "keeping the original camera angle and arrangement of people. " +
    "Everything on the statue is white marble: no painted skin, hair, or clothing colors.",
  // Written for nightclub and event shoots: it keeps the venue and turns up the neon.
  // Up to about 435 T5 tokens with a fix added; FLUX Kontext reads at most 512,
  // and a fix is appended last, so keep any additions short.
  nightclub:
    "Transform this photograph into a beautiful, fully illustrated 2D animated cartoon with a charming, " +
    "hand-drawn aesthetic inspired by classic Japanese animated films and modern premium cartoon illustrations. " +
    "Art style: strongly cartoonish, NOT photorealistic or semi-realistic. " +
    "Clean, expressive outlines with soft, smooth cel shading. " +
    "Simplified facial features, slightly larger expressive eyes, charming animated smiles, and naturally stylized proportions. " +
    "Smooth illustrated skin with warm, vibrant colors and absolutely no photographic skin texture. " +
    "Beautifully drawn hair with simplified flowing shapes and carefully placed highlights. " +
    "Rich, saturated colors, soft painterly shadows, and a polished animated-movie finish. " +
    "Vibrant nightclub lighting with glowing neon accents, cinematic atmosphere, and illustrated background details. " +
    `Preserve the original: ${PRESERVE_SUBJECTS} ` +
    "Preserve recognizable facial features, skin tones, hairstyles, expressions, poses, and body types. " +
    "Maintain the exact clothing, accessories, jewelry, and important logos. " +
    "Keep the original camera angle, composition, and arrangement of people. " +
    "Preserve the nightclub environment, furniture, lighting, and decorations. " +
    "Important: make the entire image look like an actual frame from a professionally produced 2D animated movie, " +
    "NOT a photograph with a cartoon filter applied. " +
    "Avoid realistic skin, photographic textures, 3D rendering, hyperrealism, plastic-looking faces, " +
    "exaggerated caricatures, distorted anatomy, or AI-generated facial inconsistencies. " +
    "Final result: a vibrant, colorful, charming, completely hand-illustrated cartoon scene with consistent " +
    "character designs, beautiful outlines, and an unmistakably animated appearance.",
};

/**
 * Each fix is phrased twice: once as a photo retouch, once as a direction for
 * the illustration. FLUX Kontext follows a single instruction better than a
 * "first do X, then do Y" chain, so a fixed illustration is one combined ask.
 */
const FIX_PROMPTS: Record<FixId, { retouch: string; artwork: string }> = {
  "open-eyes": {
    retouch:
      "Retouch this photograph so that every person has their eyes naturally open. " +
      "For anyone whose eyes are closed, half-closed, or caught mid-blink, open them with realistic eyes " +
      "that look natural for that person's face: matching eye shape, natural eyelids and lashes, " +
      "and a gaze that follows the direction their face is pointing. " +
      "Leave anyone whose eyes are already open untouched.",
    artwork:
      "In the artwork, draw every person with their eyes open: anyone whose eyes are closed, half-closed, " +
      "or mid-blink in the photo gets naturally open, expressive eyes that fit their face.",
  },
  "eye-contact": {
    retouch:
      "Retouch this photograph so that every person is looking directly into the camera lens. " +
      "Redirect each gaze by moving only the irises and pupils; keep head angles, eyelids, and expressions the same. " +
      "Leave anyone already looking at the camera untouched.",
    artwork:
      "In the artwork, draw every person with their eyes looking straight out at the viewer, as if into the camera lens: " +
      "turn any gaze that wanders away from the lens by moving only the eyes, without changing head angles or expressions.",
  },
  "eyes-both": {
    retouch:
      "Retouch this photograph so that every person has open eyes looking directly into the camera lens. " +
      "Open any closed, half-closed, or blinking eyes with realistic eyes that look natural for that person's face, " +
      "and redirect any gaze that drifts away from the lens by moving only the irises and pupils. " +
      "Keep head angles and expressions the same.",
    artwork:
      "In the artwork, draw every person with open, expressive eyes looking straight out at the viewer, " +
      "as if into the camera lens: open any closed or blinking eyes and turn any wandering gaze toward the lens, " +
      "without changing head angles.",
  },
};

// A retouch shouldn't "reimagine" anyone, so it gets its own head-count guardrail.
const KEEP_EVERYONE =
  "Do not add, remove, or duplicate anyone. Preserve the number, position, and identity of every person exactly.";

const KEEP_THE_PHOTO =
  "Change nothing except the eyes: keep every person's identity, facial features, skin tone, expression, " +
  "hair, pose, and clothing, and keep the lighting, colors, sharpness, grain, background, and framing " +
  "exactly as in the original. The result must stay a photorealistic photograph, not an illustration.";

export function buildPrompt(recipe: Recipe): string {
  if (recipe.finish === "photo") {
    // parseRecipe guarantees a fix here; a bare photo finish is rejected.
    const fix = FIX_PROMPTS[recipe.fix as FixId];
    return `${fix.retouch} ${KEEP_THE_PHOTO} ${KEEP_EVERYONE}`;
  }

  const look = LOOK_PROMPTS[recipe.finish];
  if (!recipe.fix) return look;
  return `${look} ${FIX_PROMPTS[recipe.fix].artwork}`;
}
