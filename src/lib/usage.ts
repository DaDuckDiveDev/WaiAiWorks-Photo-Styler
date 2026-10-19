/**
 * Usage tracking and daily credits, backed by Postgres.
 *
 * This is the successor to the Flask app's `UserTracking` model and keeps the
 * same column names, so an existing Render database carries over untouched.
 *
 * Two rules govern everything below:
 *
 *  1. Tracking is optional. With no DATABASE_URL the app runs fine, it just
 *     stops counting and stops enforcing credits. That keeps local dev cheap.
 *  2. Tracking never breaks a render. Every call fails open — if Postgres is
 *     unreachable, a user still gets their photos back and we log the problem.
 */

import { Pool, type QueryResultRow } from "pg";

export const DEFAULT_DAILY_CREDITS = 20;

export type Usage = {
  username: string;
  uploads: number;
  downloads: number;
  stylizations: number;
  credits: number;
  lastCreditRefresh: string | null;
  lastLogin: string | null;
};

export type CountableEvent = "uploads" | "downloads" | "stylizations";

export function trackingEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function dailyCredits(): number {
  const raw = Number(process.env.DAILY_CREDITS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_DAILY_CREDITS;
}

/* -------------------------------------------------------------------------- */
/* connection                                                                  */
/* -------------------------------------------------------------------------- */

// Next reloads modules in dev; stash the pool on globalThis so we don't leak a
// new pool on every hot reload.
const globalForPg = globalThis as unknown as {
  __kaielStylerPool?: Pool;
  __kaielStylerSchema?: Promise<void>;
};

function getPool(): Pool {
  if (!globalForPg.__kaielStylerPool) {
    const connectionString = process.env.DATABASE_URL as string;
    // Render's internal connection string doesn't need TLS; the external one
    // does, and presents a cert Node won't chain on its own.
    const external = !/@[^/]*\.internal|localhost|127\.0\.0\.1/.test(connectionString);
    globalForPg.__kaielStylerPool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
      ssl: external ? { rejectUnauthorized: false } : undefined,
    });
    globalForPg.__kaielStylerPool.on("error", (error) => {
      console.error("[usage] idle client error:", error.message);
    });
  }
  return globalForPg.__kaielStylerPool;
}

// Both tables are created on first use, so a fresh empty database just works.
// render_log keeps one row per render attempt: what was asked for and how it
// went. Photos, prompts, and output links are never stored.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS user_tracking (
    username            VARCHAR(50) PRIMARY KEY,
    uploads             INTEGER NOT NULL DEFAULT 0,
    downloads           INTEGER NOT NULL DEFAULT 0,
    stylizations        INTEGER NOT NULL DEFAULT 0,
    credits             INTEGER NOT NULL DEFAULT 20,
    last_credit_refresh DATE,
    last_login          TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS render_log (
    id            BIGSERIAL PRIMARY KEY,
    username      VARCHAR(50) NOT NULL,
    finish        VARCHAR(16) NOT NULL,
    fix           VARCHAR(24),
    status        VARCHAR(8)  NOT NULL,
    seconds       NUMERIC(7, 1),
    error         VARCHAR(300),
    prediction_id VARCHAR(64),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS render_log_created_at ON render_log (created_at DESC);
`;

function ensureSchema(): Promise<void> {
  if (!globalForPg.__kaielStylerSchema) {
    globalForPg.__kaielStylerSchema = getPool()
      .query(SCHEMA)
      .then(() => undefined)
      .catch((error) => {
        // Let the next call retry rather than caching the failure forever.
        globalForPg.__kaielStylerSchema = undefined;
        throw error;
      });
  }
  return globalForPg.__kaielStylerSchema;
}

async function query<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  await ensureSchema();
  const result = await getPool().query<T>(sql, params);
  return result.rows;
}

/* -------------------------------------------------------------------------- */
/* reads and writes                                                            */
/* -------------------------------------------------------------------------- */

type Row = {
  username: string;
  uploads: number;
  downloads: number;
  stylizations: number;
  credits: number;
  last_credit_refresh: Date | string | null;
  last_login: Date | string | null;
};

function toUsage(row: Row): Usage {
  const asIso = (value: Date | string | null) =>
    value instanceof Date ? value.toISOString() : value;
  return {
    username: row.username,
    uploads: row.uploads ?? 0,
    downloads: row.downloads ?? 0,
    stylizations: row.stylizations ?? 0,
    credits: row.credits ?? 0,
    lastCreditRefresh: asIso(row.last_credit_refresh)?.slice(0, 10) ?? null,
    lastLogin: asIso(row.last_login),
  };
}

/**
 * Create the row if it's missing and roll the daily credit allowance over if
 * this is the user's first request of the day. One statement, so two
 * simultaneous renders can't both reset the balance.
 */
async function refresh(username: string): Promise<Usage | null> {
  if (!trackingEnabled()) return null;
  const rows = await query<Row>(
    `
    INSERT INTO user_tracking (username, credits, last_credit_refresh)
    VALUES ($1, $2, CURRENT_DATE)
    ON CONFLICT (username) DO UPDATE SET
      credits = CASE
        WHEN user_tracking.last_credit_refresh IS NULL
          OR user_tracking.last_credit_refresh <> CURRENT_DATE
        THEN $2 ELSE user_tracking.credits END,
      last_credit_refresh = CURRENT_DATE
    RETURNING *;
    `,
    [username, dailyCredits()]
  );
  return rows[0] ? toUsage(rows[0]) : null;
}

/** Current balance and counters. Returns null when tracking is off. */
export async function getUsage(username: string): Promise<Usage | null> {
  try {
    return await refresh(username);
  } catch (error) {
    console.error("[usage] getUsage failed:", (error as Error).message);
    return null;
  }
}

export async function recordLogin(username: string): Promise<void> {
  if (!trackingEnabled()) return;
  try {
    await refresh(username);
    await query(
      "UPDATE user_tracking SET last_login = NOW() WHERE username = $1",
      [username]
    );
  } catch (error) {
    console.error("[usage] recordLogin failed:", (error as Error).message);
  }
}

export async function recordEvent(
  username: string,
  event: CountableEvent,
  count = 1
): Promise<void> {
  if (!trackingEnabled() || count <= 0) return;
  try {
    await refresh(username);
    // `event` is a union of three literals, never user input — safe to inline.
    await query(
      `UPDATE user_tracking SET ${event} = ${event} + $2 WHERE username = $1`,
      [username, count]
    );
  } catch (error) {
    console.error(`[usage] recordEvent(${event}) failed:`, (error as Error).message);
  }
}

export type CreditClaim =
  | { ok: true; remaining: number | null }
  | { ok: false; remaining: number };

/**
 * Atomically take one credit and count the stylization. Returns ok:false only
 * when the balance is genuinely exhausted — a database outage returns ok:true
 * with a null balance so renders keep working.
 */
export async function claimCredit(username: string): Promise<CreditClaim> {
  if (!trackingEnabled()) return { ok: true, remaining: null };
  try {
    await refresh(username);
    const rows = await query<{ credits: number }>(
      `
      UPDATE user_tracking
      SET credits = credits - 1, stylizations = stylizations + 1
      WHERE username = $1 AND credits > 0
      RETURNING credits;
      `,
      [username]
    );
    if (rows.length) return { ok: true, remaining: rows[0].credits };
    return { ok: false, remaining: 0 };
  } catch (error) {
    console.error("[usage] claimCredit failed:", (error as Error).message);
    return { ok: true, remaining: null };
  }
}

/** Hand a credit back when a render fails, so failures are free. */
export async function refundCredit(username: string): Promise<void> {
  if (!trackingEnabled()) return;
  try {
    await query(
      `UPDATE user_tracking
       SET credits = credits + 1, stylizations = GREATEST(stylizations - 1, 0)
       WHERE username = $1`,
      [username]
    );
  } catch (error) {
    console.error("[usage] refundCredit failed:", (error as Error).message);
  }
}

/** Every row, for the admin dashboard. */
export async function listUsage(): Promise<Usage[]> {
  if (!trackingEnabled()) return [];
  try {
    const rows = await query<Row>(
      "SELECT * FROM user_tracking ORDER BY username ASC"
    );
    return rows.map(toUsage);
  } catch (error) {
    console.error("[usage] listUsage failed:", (error as Error).message);
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/* render log                                                                  */
/* -------------------------------------------------------------------------- */

export type RenderLogEntry = {
  id: number;
  username: string;
  finish: string;
  fix: string | null;
  status: "done" | "failed";
  seconds: number | null;
  error: string | null;
  predictionId: string | null;
  createdAt: string;
};

type RenderRow = {
  id: string | number;
  username: string;
  finish: string;
  fix: string | null;
  status: string;
  seconds: string | number | null;
  error: string | null;
  prediction_id: string | null;
  created_at: Date | string;
};

function toEntry(row: RenderRow): RenderLogEntry {
  return {
    id: Number(row.id),
    username: row.username,
    finish: row.finish,
    fix: row.fix,
    status: row.status === "done" ? "done" : "failed",
    seconds: row.seconds === null ? null : Number(row.seconds),
    error: row.error,
    predictionId: row.prediction_id,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

/** Records one render attempt. Fails open like everything else here. */
export async function logRender(entry: {
  username: string;
  finish: string;
  fix: string | null;
  status: "done" | "failed";
  seconds: number;
  error?: string | null;
  predictionId?: string | null;
}): Promise<void> {
  if (!trackingEnabled()) return;
  try {
    await query(
      `INSERT INTO render_log (username, finish, fix, status, seconds, error, prediction_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.username,
        entry.finish,
        entry.fix,
        entry.status,
        Math.round(entry.seconds * 10) / 10,
        entry.error ? entry.error.slice(0, 300) : null,
        entry.predictionId ?? null,
      ]
    );
  } catch (error) {
    console.error("[usage] logRender failed:", (error as Error).message);
  }
}

/** The most recent render attempts, newest first. */
export async function recentRenders(limit = 50): Promise<RenderLogEntry[]> {
  if (!trackingEnabled()) return [];
  try {
    const rows = await query<RenderRow>(
      "SELECT * FROM render_log ORDER BY created_at DESC LIMIT $1",
      [limit]
    );
    return rows.map(toEntry);
  } catch (error) {
    console.error("[usage] recentRenders failed:", (error as Error).message);
    return [];
  }
}

/** Every render attempt since a date, oldest first, for the CSV export. */
export async function rendersSince(since: Date): Promise<RenderLogEntry[]> {
  if (!trackingEnabled()) return [];
  try {
    const rows = await query<RenderRow>(
      "SELECT * FROM render_log WHERE created_at >= $1 ORDER BY created_at ASC",
      [since.toISOString()]
    );
    return rows.map(toEntry);
  } catch (error) {
    console.error("[usage] rendersSince failed:", (error as Error).message);
    return [];
  }
}

export type RenderBreakdown = {
  finish: string;
  fix: string | null;
  done: number;
  failed: number;
  avgSeconds: number | null;
};

/** Counts per look and fix over the last `days` days, busiest first. */
export async function renderBreakdown(days = 30): Promise<RenderBreakdown[]> {
  if (!trackingEnabled()) return [];
  try {
    const rows = await query<{
      finish: string;
      fix: string | null;
      done: string;
      failed: string;
      avg_seconds: string | null;
    }>(
      `SELECT finish, fix,
              COUNT(*) FILTER (WHERE status = 'done')   AS done,
              COUNT(*) FILTER (WHERE status <> 'done')  AS failed,
              AVG(seconds) FILTER (WHERE status = 'done') AS avg_seconds
       FROM render_log
       WHERE created_at >= NOW() - ($1 || ' days')::interval
       GROUP BY finish, fix
       ORDER BY COUNT(*) DESC`,
      [String(days)]
    );
    return rows.map((row) => ({
      finish: row.finish,
      fix: row.fix,
      done: Number(row.done),
      failed: Number(row.failed),
      avgSeconds: row.avg_seconds === null ? null : Math.round(Number(row.avg_seconds) * 10) / 10,
    }));
  } catch (error) {
    console.error("[usage] renderBreakdown failed:", (error as Error).message);
    return [];
  }
}
