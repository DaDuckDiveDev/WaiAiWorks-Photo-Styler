/**
 * Render jobs: the server half of start-then-poll rendering.
 *
 * When Replicate accepts a render, the browser gets a signed ticket naming the
 * prediction, the account and the recipe. It brings the ticket back each time
 * it asks "is it done yet?", so the server needs no job table: the signature
 * proves the ticket is ours and belongs to whoever is signed in.
 *
 * Settling (copying the image, logging it, refunding a failure) happens once
 * per render even if two polls race or a phone retries after a dropped
 * connection: an in-process guard for this server, and `settleRender`'s
 * database check across restarts.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { type FinishId, type FixId, parseRecipe, recipeSlug } from "@/lib/catalog";
import {
  RenderError,
  copyOutput,
  failureMessage,
  logResult,
  outputUrl,
  type Prediction,
} from "@/lib/replicate";
import { getUsage, refundCredit, settleRender } from "@/lib/usage";

/**
 * How long a ticket can be brought back. Long on purpose: a phone that slept
 * through a render should still collect it, or get its credit back if
 * Replicate has deleted it by then (it keeps outputs for an hour). Collecting
 * twice is harmless; settling happens once.
 */
const TICKET_MAX_AGE_MS = 24 * 60 * 60_000;
/** Finished results kept in memory for repeat polls. Each holds an image, so keep few. */
const CACHE_LIMIT = 24;
const CACHE_BYTES = 64 * 1024 * 1024;
const CACHE_MS = 10 * 60_000;

export type Ticket = {
  /** Replicate prediction ID */
  p: string;
  /** account */
  u: string;
  f: FinishId;
  x: FixId | null;
  /** started at, ms */
  t: number;
  /** a credit was taken for this render (false when usage tracking is off or failed) */
  c: boolean;
};

export type PollResult =
  | { status: "processing" }
  | { status: "done"; url: string; credits?: number | null }
  | { status: "failed"; error: string; credits?: number | null };

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 16) throw new Error("SESSION_SECRET is missing or too short.");
  // Domain-separated from session cookies, so one can never pass for the other.
  return `render-ticket:${value}`;
}

function mac(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function signTicket(ticket: Ticket): string {
  const body = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return `${body}.${mac(body)}`;
}

/** Returns the ticket if it's genuine, unexpired, and well formed; otherwise null. */
export function readTicket(token: string | null | undefined): Ticket | null {
  if (!token || token.length > 2000) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = Buffer.from(mac(body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const ticket = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Ticket;
    if (typeof ticket.p !== "string" || typeof ticket.u !== "string") return null;
    if (typeof ticket.t !== "number" || Date.now() - ticket.t > TICKET_MAX_AGE_MS) return null;
    if (typeof ticket.c !== "boolean") return null;
    if (!parseRecipe({ finish: ticket.f, fix: ticket.x })) return null;
    return ticket;
  } catch {
    return null;
  }
}

/* ---- settle once ---- */

type CacheEntry = { result: PollResult; at: number; bytes: number };

const globalForJobs = globalThis as unknown as {
  __kaielSettled?: Map<string, CacheEntry>;
  __kaielSettling?: Map<string, Promise<PollResult>>;
};
const settled = (globalForJobs.__kaielSettled ??= new Map());
const settling = (globalForJobs.__kaielSettling ??= new Map());

function remember(id: string, result: PollResult) {
  const now = Date.now();
  const bytes = result.status === "done" ? result.url.length : 200;
  let total = bytes;
  for (const entry of settled.values()) total += entry.bytes;
  // Oldest first: Maps iterate in insertion order.
  for (const [key, entry] of settled) {
    const stale = now - entry.at > CACHE_MS;
    if (!stale && settled.size < CACHE_LIMIT && total <= CACHE_BYTES) break;
    settled.delete(key);
    total -= entry.bytes;
  }
  settled.set(id, { result, at: now, bytes });
}

/** A result this server already settled, if it still has it. */
export function cachedResult(id: string): PollResult | null {
  const entry = settled.get(id);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_MS) {
    settled.delete(id);
    return null;
  }
  return entry.result;
}

async function currentCredits(user: string): Promise<number | null> {
  return (await getUsage(user))?.credits ?? null;
}

/**
 * Turns a finished prediction (or a terminal error) into the browser's answer,
 * logging it and refunding a failure exactly once.
 */
export function settle(ticket: Ticket, outcome: Prediction | RenderError): Promise<PollResult> {
  const id = ticket.p;
  const cached = cachedResult(id);
  if (cached) return Promise.resolve(cached);
  const pending = settling.get(id);
  if (pending) return pending;

  const work = (async (): Promise<PollResult> => {
    const tag = recipeSlug({ finish: ticket.f, fix: ticket.x });
    const seconds = (Date.now() - ticket.t) / 1000;
    const base = { username: ticket.u, finish: ticket.f, fix: ticket.x, predictionId: id, seconds };

    if (!(outcome instanceof RenderError)) logResult(outcome, tag, Date.now() - ticket.t);
    const url = outcome instanceof RenderError ? null : outputUrl(outcome);

    if (url && !(outcome instanceof RenderError) && outcome.status === "succeeded") {
      const settlement = await settleRender({ ...base, status: "done" });
      if (settlement.previous === "failed") {
        // Already given up on and refunded; the late result doesn't count.
        return {
          status: "failed",
          error: "This render was cancelled and its credit returned. Render the photo again.",
          credits: await currentCredits(ticket.u),
        };
      }
      return { status: "done", url: await copyOutput(url) };
    }

    const message =
      outcome instanceof RenderError
        ? outcome.message
        : outcome.status === "succeeded"
          ? "The render finished without an image. Try again."
          : failureMessage(outcome);
    const detail = outcome instanceof RenderError ? (outcome.detail ?? outcome.message) : message;
    const settlement = await settleRender({ ...base, status: "failed", error: detail });
    if (settlement.first && ticket.c) await refundCredit(ticket.u);
    console.error(`[stylize] ${ticket.u} / ${tag}: ${detail}`);
    return { status: "failed", error: message, credits: await currentCredits(ticket.u) };
  })();

  settling.set(id, work);
  return work
    .then((result) => {
      remember(id, result);
      return result;
    })
    .finally(() => settling.delete(id));
}
