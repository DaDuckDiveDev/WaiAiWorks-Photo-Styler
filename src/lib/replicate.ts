/**
 * Thin Replicate client over the HTTP API.
 *
 * A render is split in two so no browser request has to stay open while the
 * model works: `startPrediction` creates it and returns at once, and the
 * browser then polls, which calls `getPrediction`. A phone that locks mid-render, or a hosting proxy that cuts
 * long requests, can no longer lose a result: the next poll picks it up.
 *
 * Finished images are copied with `copyOutput` because Replicate deletes API
 * outputs after an hour (the Flask app kept copies on its disk for the same
 * reason).
 */

const MODEL = "black-forest-labs/flux-kontext-pro";
// Overridable only so a local mock can stand in for Replicate during testing.
const API_ROOT = process.env.REPLICATE_API_ROOT || "https://api.replicate.com/v1";
/*
 * Replicate throttles how fast predictions can be created; with under $5 of
 * account credit the limit drops to 6 a minute with a burst of 1, so a batch
 * that starts its next photo right away gets a 429. A 429 means nothing was
 * created and nothing was charged, so it's safe to wait as told and ask again.
 */
const THROTTLE_RETRIES = 5;
const THROTTLE_BUDGET_MS = 25_000;
/** Largest output we'll copy. FLUX Kontext returns roughly 1 megapixel JPEGs. */
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

export type Prediction = {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[] | null;
  error?: string | null;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
  metrics?: { predict_time?: number; total_time?: number };
};

function token(): string {
  const value = process.env.REPLICATE_API_TOKEN;
  if (!value) {
    throw new RenderError(
      "The studio isn't connected to Replicate yet, so it can't render.",
      null,
      "REPLICATE_API_TOKEN is not set",
      true
    );
  }
  return value;
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
    readonly detail: string | null = null,
    /**
     * Set when the problem is Replicate's side as a whole (rate limit, no
     * credit, bad token), not this photo: the batch should stop rather than
     * fail every remaining photo the same way.
     */
    readonly serviceDown = false
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

/**
 * Starts a render and returns as soon as Replicate has accepted it; the
 * browser polls for the result. Waits out Replicate's rate limit if it pushes
 * back, but stops waiting if the browser has gone (`signal`), so the caller
 * can refund the credit instead of starting a render nobody will collect.
 */
export async function startPrediction(
  image: string,
  prompt: string,
  tag = "unknown",
  signal?: AbortSignal
): Promise<Prediction> {
  const startedAt = Date.now();
  for (let attempt = 1; ; attempt += 1) {
    if (signal?.aborted) {
      throw new RenderError("The studio stopped waiting for this render.", null, "Browser disconnected before the render started");
    }
    let response: Response;
    try {
      response = await fetch(`${API_ROOT}/models/${MODEL}/predictions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: {
            prompt,
            input_image: image,
            aspect_ratio: "match_input_image",
            output_format: "jpg",
            safety_tolerance: 2,
          },
        }),
      });
    } catch (error) {
      console.error("[replicate] create failed to connect", { recipe: tag, error: (error as Error).message });
      throw new RenderError(
        "Couldn't reach Replicate. Try again in a minute.",
        null,
        `Network: ${(error as Error).message}`.slice(0, 300),
        true
      );
    }

    if (response.ok) {
      const prediction = (await response.json()) as Prediction;
      console.info("[replicate] accepted", {
        predictionId: prediction.id,
        model: MODEL,
        recipe: tag,
        status: prediction.status,
        waitedMs: Date.now() - startedAt,
      });
      return prediction;
    }

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
    const serviceDown = [401, 402, 403, 429].includes(response.status) || response.status >= 500;
    throw new RenderError(
      rejectionMessage(response.status),
      null,
      `Replicate ${response.status}: ${detail}`,
      serviceDown
    );
  }
}

/** Replicate IDs are short lowercase alphanumerics; anything else never reaches the URL. */
export function isPredictionId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]{6,64}$/i.test(value);
}

/**
 * Current state of a render. Returns null when Replicate can't be reached right
 * now, so the caller treats it as "still working" and asks again shortly.
 * Throws a RenderError if Replicate no longer knows the prediction.
 */
export async function getPrediction(id: string): Promise<Prediction | null> {
  if (!isPredictionId(id)) throw new RenderError("That render can't be found.", null);
  let response: Response;
  try {
    response = await fetch(`${API_ROOT}/predictions/${id}`, {
      headers: { Authorization: `Bearer ${token()}` },
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (response.status === 404) {
    throw new RenderError(
      "This render expired before it could be collected. Render the photo again.",
      id,
      "Replicate 404: prediction not found"
    );
  }
  if (!response.ok) return null; // 429/5xx: transient, poll again.
  return (await response.json()) as Prediction;
}

/**
 * Asks Replicate to stop a render nobody is waiting for any more, and returns
 * the prediction as Replicate reports it afterwards (it may have finished in
 * the meantime), or null if Replicate couldn't be reached.
 */
export async function cancelPrediction(id: string): Promise<Prediction | null> {
  if (!isPredictionId(id)) return null;
  try {
    const response = await fetch(`${API_ROOT}/predictions/${id}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (!response.ok) return null;
    return (await response.json()) as Prediction;
  } catch {
    return null;
  }
}

export function isFinished(prediction: Prediction): boolean {
  return (
    prediction.status === "succeeded" ||
    prediction.status === "failed" ||
    prediction.status === "canceled"
  );
}

export function outputUrl(prediction: Prediction): string | null {
  const output = prediction.output;
  if (!output) return null;
  if (typeof output === "string") return output;
  return output[0] ?? null;
}

/** The person-facing reason a finished prediction has no image. */
export function failureMessage(prediction: Prediction): string {
  if (prediction.status === "canceled") return "The render was cancelled before it finished.";
  return prediction.error || "The render failed. Try a different photo or style.";
}

/** Logs timings, never customer photos, prompts, tokens, or output URLs. */
export function logResult(prediction: Prediction, tag: string, elapsedMs: number): void {
  console.info("[replicate] result", {
    predictionId: prediction.id,
    model: MODEL,
    recipe: tag,
    status: prediction.status,
    elapsedMs,
    createdAt: prediction.created_at,
    startedAt: prediction.started_at,
    completedAt: prediction.completed_at,
    predictSeconds: prediction.metrics?.predict_time,
    totalSeconds: prediction.metrics?.total_time,
  });
}

/** Only Replicate's own file hosts (or the local test mock) are ever fetched. */
function isOutputHost(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol === "https:" && (url.hostname === "replicate.delivery" || url.hostname.endsWith(".replicate.delivery"))) {
      return true;
    }
    return Boolean(process.env.REPLICATE_API_ROOT) && url.origin === new URL(API_ROOT).origin;
  } catch {
    return false;
  }
}

/**
 * Copies a finished image into a data: URI so it outlives Replicate's one-hour
 * retention. Falls back to the original URL if the copy fails; that still
 * works for an hour.
 */
export async function copyOutput(url: string): Promise<string> {
  if (url.startsWith("data:image/")) return url;
  if (!isOutputHost(url)) return url;
  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    const type = response.headers.get("content-type") ?? "image/jpeg";
    if (!response.ok || !type.startsWith("image/")) return url;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_OUTPUT_BYTES) return url;
    return `data:${type.split(";")[0]};base64,${bytes.toString("base64")}`;
  } catch (error) {
    console.warn("[replicate] couldn't copy output, using the original link", {
      error: (error as Error).message,
    });
    return url;
  }
}
