import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { parseRecipe, recipeSlug } from "@/lib/catalog";
import { RESET_LABEL } from "@/lib/credit-clock";
import { buildPrompt } from "@/lib/prompts";
import { cachedResult, readTicket, settle, signTicket } from "@/lib/render-jobs";
import {
  RenderError,
  cancelPrediction,
  getPrediction,
  isFinished,
  startPrediction,
} from "@/lib/replicate";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { claimCredit, logRender, logRenderStart, recordEvent, refundCredit } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // generous ceiling; client downscales first

// Daily credits are the real cap. This is just a burst guard so a runaway
// script can't open dozens of concurrent Replicate calls in a few seconds.
const BURST = { limit: 12, windowMs: 60_000, blockMs: 60_000 };

async function signedInUser(): Promise<string | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

const expired = () =>
  NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

/**
 * Starts a render. Answers as soon as Replicate has accepted it, with a
 * ticket the browser polls with (GET below). No request stays open while the
 * model works, so a dropped connection can't strand a paid result.
 */
export async function POST(request: Request) {
  const user = await signedInUser();
  if (!user) return expired();

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
        error: `You're out of renders for today. Your allowance resets at ${RESET_LABEL}.`,
        credits: 0,
      },
      { status: 402 }
    );
  }

  await recordEvent(user, "uploads");

  const tag = recipeSlug(recipe);
  const startedAt = Date.now();
  let prediction;
  try {
    prediction = await startPrediction(image, buildPrompt(recipe), tag, request.signal);
  } catch (error) {
    // Nothing was created at Replicate, so nothing was charged there either.
    if (claim.remaining !== null) await refundCredit(user);
    const message = error instanceof Error ? error.message : "Render failed.";
    const detail = error instanceof RenderError && error.detail ? error.detail : message;
    await logRender({
      username: user,
      finish: recipe.finish,
      fix: recipe.fix,
      status: "failed",
      seconds: (Date.now() - startedAt) / 1000,
      error: detail,
      predictionId: null,
    });
    console.error(`[stylize] ${user} / ${tag}: ${detail}`);
    // 503 tells the studio to stop the batch: the next photo would fail the same way.
    const serviceDown = error instanceof RenderError && error.serviceDown;
    return NextResponse.json(
      { error: message, credits: claim.remaining === null ? null : claim.remaining + 1 },
      { status: serviceDown ? 503 : 502 }
    );
  }

  await logRenderStart({
    username: user,
    finish: recipe.finish,
    fix: recipe.fix,
    predictionId: prediction.id,
  });
  const ticket = {
    p: prediction.id,
    u: user,
    f: recipe.finish,
    x: recipe.fix,
    t: startedAt,
    // Only a credit that was really taken gets handed back on failure.
    c: claim.remaining !== null,
  };

  return NextResponse.json({
    status: "processing",
    ticket: signTicket(ticket),
    recipe,
    credits: claim.remaining,
  });
}

/**
 * "Is it done yet?" Polled by the browser with the ticket from POST.
 * `giveup=1` means the browser has waited long enough: the render is
 * cancelled and the credit returned.
 */
export async function GET(request: Request) {
  const user = await signedInUser();
  if (!user) return expired();

  const params = new URL(request.url).searchParams;
  const ticket = readTicket(params.get("ticket"));
  if (!ticket || ticket.u !== user) {
    return NextResponse.json(
      { status: "failed", error: "This render can't be found any more. Render the photo again." },
      { status: 404 }
    );
  }

  const cached = cachedResult(ticket.p);
  if (cached) return NextResponse.json(cached);

  let prediction;
  try {
    prediction = await getPrediction(ticket.p);
  } catch (error) {
    const outcome =
      error instanceof RenderError ? error : new RenderError("Lost track of the render.", ticket.p);
    return NextResponse.json(await settle(ticket, outcome));
  }

  if (prediction && isFinished(prediction)) {
    return NextResponse.json(await settle(ticket, prediction));
  }

  // Give up only on a render Replicate confirms is still running. If Replicate
  // can't be reached, don't refund on a guess; the browser asks again.
  if (params.get("giveup") === "1" && prediction) {
    const after = await cancelPrediction(ticket.p);
    if (after?.status === "succeeded") return NextResponse.json(await settle(ticket, after));
    return NextResponse.json(
      await settle(
        ticket,
        new RenderError(
          "This render took far too long, so it was cancelled and your credit returned. Try again.",
          ticket.p,
          "Cancelled after the browser stopped waiting"
        )
      )
    );
  }

  return NextResponse.json({ status: "processing" }, { headers: { "Cache-Control": "no-store" } });
}
