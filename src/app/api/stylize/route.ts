import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { parseRecipe, recipeSlug } from "@/lib/catalog";
import { buildPrompt } from "@/lib/prompts";
import { RenderError, stylizeImage } from "@/lib/replicate";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { claimCredit, logRender, recordEvent, refundCredit } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // generous ceiling; client downscales first

// Daily credits are the real cap. This is just a burst guard so a runaway
// script can't open dozens of concurrent Replicate calls in a few seconds.
const BURST = { limit: 12, windowMs: 60_000, blockMs: 60_000 };

export async function POST(request: Request) {
  const jar = await cookies();
  const user = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });
  }

  const burst = rateLimit(`stylize:${user}:${clientIp(request)}`, BURST);
  if (!burst.ok) {
    return NextResponse.json(
      { error: "Slow down a moment — too many renders at once." },
      { status: 429, headers: { "Retry-After": String(burst.retryAfterSeconds) } }
    );
  }

  let body: { image?: unknown; finish?: unknown; fix?: unknown; style?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const image = typeof body.image === "string" ? body.image : "";
  // `style` is the field older clients send; it maps straight onto a finish.
  const recipe = parseRecipe({ finish: body.finish ?? body.style, fix: body.fix });

  if (!image.startsWith("data:image/")) {
    return NextResponse.json({ error: "Unsupported image payload." }, { status: 400 });
  }
  if (image.length > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "That image is too large. Try one under 8MB." },
      { status: 413 }
    );
  }
  if (!recipe) {
    return NextResponse.json(
      { error: "Pick a look, or a photo fix with a finish." },
      { status: 400 }
    );
  }

  // Take the credit before spending money at Replicate, and hand it back if the
  // render fails — a failed render shouldn't cost the user anything.
  const claim = await claimCredit(user);
  if (!claim.ok) {
    return NextResponse.json(
      {
        error: "You're out of renders for today. Your allowance resets at midnight UTC.",
        credits: 0,
      },
      { status: 402 }
    );
  }

  await recordEvent(user, "uploads");

  const tag = recipeSlug(recipe);
  const startedAt = Date.now();
  try {
    const { url, predictionId } = await stylizeImage(image, buildPrompt(recipe), tag);
    await logRender({
      username: user,
      finish: recipe.finish,
      fix: recipe.fix,
      status: "done",
      seconds: (Date.now() - startedAt) / 1000,
      predictionId,
    });
    return NextResponse.json({ url, recipe, credits: claim.remaining });
  } catch (error) {
    await refundCredit(user);
    const message = error instanceof Error ? error.message : "Render failed.";
    // The log keeps Replicate's own wording; the studio gets the plain version.
    const detail = error instanceof RenderError && error.detail ? error.detail : message;
    await logRender({
      username: user,
      finish: recipe.finish,
      fix: recipe.fix,
      status: "failed",
      seconds: (Date.now() - startedAt) / 1000,
      error: detail,
      predictionId: error instanceof RenderError ? error.predictionId : null,
    });
    console.error(`[stylize] ${user} / ${tag}: ${detail}`);
    return NextResponse.json(
      { error: message, credits: claim.remaining === null ? null : claim.remaining + 1 },
      { status: 502 }
    );
  }
}
