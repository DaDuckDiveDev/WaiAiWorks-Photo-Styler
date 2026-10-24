/**
 * Thin Replicate client over the HTTP API.
 *
 * We call the model endpoint directly instead of pulling in the SDK so this
 * stays dependency-free and serverless-friendly. `Prefer: wait` blocks for up
 * to 60s; anything slower falls through to polling.
 */

const MODEL = "black-forest-labs/flux-kontext-pro";
// Overridable only so a local mock can stand in for Replicate during testing.
const API_ROOT = process.env.REPLICATE_API_ROOT || "https://api.replicate.com/v1";
const POLL_INTERVAL_MS = 1500;
const POLL_BUDGET_MS = 180_000;
/*
 * Replicate throttles how fast predictions can be created; with under $5 of
 * account credit the limit drops to 6 a minute with a burst of 1, so a batch
 * that starts its next photo right away gets a 429. A 429 means nothing was
 * created and nothing was charged, so it's safe to wait as told and ask again.
 */
const THROTTLE_RETRIES = 5;
const THROTTLE_BUDGET_MS = 40_000;

type Prediction = {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[] | null;
  error?: string | null;
  urls?: { get?: string };
  created_at?: string;
  started_at?: string;
  completed_at?: string;
  metrics?: { predict_time?: number; total_time?: number };
};

function token(): string {
  const value = process.env.REPLICATE_API_TOKEN;
  if (!value) throw new Error("REPLICATE_API_TOKEN is not set.");
  return value;
}

function firstUrl(output: Prediction["output"]): string | null {
  if (!output) return null;
  if (typeof output === "string") return output;
  return output[0] ?? null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A failed render. `message` is written for the person using the studio;
 * `detail` keeps Replicate's own wording for the render log.
 */
export class RenderError extends Error {
  constructor(
    message: string,
    readonly predictionId: string | null = null,
    readonly detail: string | null = null
  ) {
    super(message);
    this.name = "RenderError";
  }
}

/** How long Replicate asked us to wait, from the header or the JSON body. */
function retryAfterMs(response: Response, body: string, attempt: number): number {
  let seconds = Number(response.headers.get("retry-after"));
  if (!Number.isFinite(seconds) || seconds <= 0) {
    try {
      seconds = Number((JSON.parse(body) as { retry_after?: unknown }).retry_after);
    } catch {
      seconds = Number.NaN;
    }
  }
  if (!Number.isFinite(seconds) || seconds <= 0) seconds = 2 ** attempt;
  // A little jitter so two people rendering at once don't collide again.
  return Math.min(15_000, seconds * 1000) + Math.floor(Math.random() * 750);
}

/** Replicate's error text without the JSON wrapping, for logs. */
function rejectionDetail(body: string): string {
  try {
    const parsed = JSON.parse(body) as { detail?: unknown; title?: unknown };
    if (typeof parsed.detail === "string") return parsed.detail.slice(0, 300);
    if (typeof parsed.title === "string") return parsed.title.slice(0, 300);
  } catch {
    // Not JSON; use it as is.
  }
  return body.slice(0, 300);
}

/** What to tell the person in the studio when Replicate says no. */
function rejectionMessage(status: number): string {
  if (status === 429) {
    return "Replicate is limiting how fast renders can start right now. Wait a minute, then try again.";
  }
  if (status === 402) {
    return "The Replicate account is out of credit, so renders are paused until it's topped up.";
  }
  if (status === 401 || status === 403) {
    return "The studio couldn't sign in to Replicate. The API token needs checking.";
  }
  if (status >= 500) return "Replicate is having trouble right now. Try again in a minute.";
  return `Replicate couldn't take this photo (${status}). Try again, or try a different photo.`;
}

/** Starts a prediction, waiting out Replicate's rate limit if it pushes back. */
async function createPrediction(input: Record<string, unknown>, tag: string): Promise<Prediction> {
  const startedAt = Date.now();
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(`${API_ROOT}/models/${MODEL}/predictions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token()}`,
        "Content-Type": "application/json",
        Prefer: "wait=60",
      },
      body: JSON.stringify({ input }),
    });
    if (response.ok) return (await response.json()) as Prediction;

    const body = await response.text();
    if (response.status === 429 && attempt <= THROTTLE_RETRIES) {
      const waitMs = retryAfterMs(response, body, attempt);
      if (Date.now() - startedAt + waitMs <= THROTTLE_BUDGET_MS) {
        console.warn("[replicate] throttled, waiting to retry", { recipe: tag, attempt, waitMs });
        await sleep(waitMs);
        continue;
      }
    }
    const detail = rejectionDetail(body);
    console.error("[replicate] rejected", { recipe: tag, status: response.status, detail });
    throw new RenderError(rejectionMessage(response.status), null, `Replicate ${response.status}: ${detail}`);
  }
}

/**
 * Runs the model against a single image and returns the output image URL.
 * `image` may be a public URL or a data: URI. `tag` names the recipe in logs.
 */
export async function stylizeImage(
  image: string,
  prompt: string,
  tag = "unknown"
): Promise<{ url: string; predictionId: string }> {
  const requestedAt = Date.now();
  let prediction = await createPrediction(
    {
      prompt,
      input_image: image,
      aspect_ratio: "match_input_image",
      output_format: "jpg",
      safety_tolerance: 2,
    },
    tag
  );
  console.info("[replicate] accepted", { predictionId: prediction.id, model: MODEL, recipe: tag });
  const deadline = Date.now() + POLL_BUDGET_MS;

  while (
    (prediction.status === "starting" || prediction.status === "processing") &&
    Date.now() < deadline
  ) {
    await sleep(POLL_INTERVAL_MS);
    const pollUrl = prediction.urls?.get ?? `${API_ROOT}/predictions/${prediction.id}`;
    const poll = await fetch(pollUrl, {
      headers: { Authorization: `Bearer ${token()}` },
      cache: "no-store",
    });
    if (!poll.ok) {
      throw new RenderError(`Lost track of the render (${poll.status}).`, prediction.id);
    }
    prediction = (await poll.json()) as Prediction;
  }

  // Log timings, never customer photos, prompts, tokens, or output URLs.
  console.info("[replicate] result", {
    predictionId: prediction.id,
    model: MODEL,
    recipe: tag,
    status: prediction.status,
    elapsedMs: Date.now() - requestedAt,
    createdAt: prediction.created_at,
    startedAt: prediction.started_at,
    completedAt: prediction.completed_at,
    predictSeconds: prediction.metrics?.predict_time,
    totalSeconds: prediction.metrics?.total_time,
  });

  if (prediction.status === "failed" || prediction.status === "canceled") {
    throw new RenderError(
      prediction.error || "The render failed. Try a different photo or style.",
      prediction.id
    );
  }

  const url = firstUrl(prediction.output);
  if (!url) {
    throw new RenderError("The render timed out before an image came back.", prediction.id);
  }
  return { url, predictionId: prediction.id };
}
