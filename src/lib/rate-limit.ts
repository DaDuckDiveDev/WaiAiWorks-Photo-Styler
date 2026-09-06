/**
 * In-memory sliding-window rate limiter.
 *
 * This works because Render runs one long-lived Node process per instance. If
 * the service is ever scaled past a single instance, each instance keeps its
 * own window and the effective limit multiplies — move the counters to Postgres
 * or Redis at that point.
 */

type Window = { hits: number[]; blockedUntil: number };

const globalForLimiter = globalThis as unknown as {
  __kaielStylerLimiter?: Map<string, Window>;
};

const buckets =
  globalForLimiter.__kaielStylerLimiter ??
  (globalForLimiter.__kaielStylerLimiter = new Map<string, Window>());

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function rateLimit(
  key: string,
  { limit, windowMs, blockMs = windowMs }: {
    limit: number;
    windowMs: number;
    blockMs?: number;
  }
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { hits: [], blockedUntil: 0 };

  if (bucket.blockedUntil > now) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000),
    };
  }

  bucket.hits = bucket.hits.filter((at) => now - at < windowMs);

  if (bucket.hits.length >= limit) {
    bucket.blockedUntil = now + blockMs;
    buckets.set(key, bucket);
    return { ok: false, remaining: 0, retryAfterSeconds: Math.ceil(blockMs / 1000) };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);

  // Opportunistic sweep so a long-running process doesn't accumulate keys.
  if (buckets.size > 5_000) {
    for (const [k, v] of buckets) {
      if (v.blockedUntil < now && v.hits.every((at) => now - at >= windowMs)) {
        buckets.delete(k);
      }
    }
  }

  return { ok: true, remaining: limit - bucket.hits.length, retryAfterSeconds: 0 };
}

/** Clear a key's history — call after a successful login. */
export function resetLimit(key: string): void {
  buckets.delete(key);
}

/**
 * Best-effort client IP. Render terminates TLS at its proxy and forwards the
 * original address in x-forwarded-for, leftmost entry.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
