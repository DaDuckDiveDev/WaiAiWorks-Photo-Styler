/**
 * Thin Replicate client over the HTTP API.
 *
 * We call the model endpoint directly instead of pulling in the SDK so this
 * stays dependency-free and serverless-friendly. `Prefer: wait` blocks for up
 * to 60s; anything slower falls through to polling.
 */

const MODEL = "black-forest-labs/flux-kontext-pro";
const API_ROOT = "https://api.replicate.com/v1";
const POLL_INTERVAL_MS = 1500;
const POLL_BUDGET_MS = 180_000;

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
 * Runs the model against a single image and returns the output image URL.
 * `image` may be a public URL or a data: URI.
 */
export async function stylizeImage(image: string, prompt: string): Promise<string> {
  const requestedAt = Date.now();
  const response = await fetch(`${API_ROOT}/models/${MODEL}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      Prefer: "wait=60",
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

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Replicate rejected the request (${response.status}): ${detail.slice(0, 300)}`);
  }

  let prediction = (await response.json()) as Prediction;
  console.info("[replicate] accepted", { predictionId: prediction.id, model: MODEL });
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
      throw new Error(`Lost track of the render (${poll.status}).`);
    }
    prediction = (await poll.json()) as Prediction;
  }

  // Log timings, never customer photos, prompts, tokens, or output URLs.
  console.info("[replicate] result", {
    predictionId: prediction.id,
    model: MODEL,
    status: prediction.status,
    elapsedMs: Date.now() - requestedAt,
    createdAt: prediction.created_at,
    startedAt: prediction.started_at,
    completedAt: prediction.completed_at,
    predictSeconds: prediction.metrics?.predict_time,
    totalSeconds: prediction.metrics?.total_time,
  });

  if (prediction.status === "failed" || prediction.status === "canceled") {
    throw new Error(prediction.error || "The render failed. Try a different photo or style.");
  }

  const url = firstUrl(prediction.output);
  if (!url) {
    throw new Error("The render timed out before an image came back.");
  }
  return url;
}
