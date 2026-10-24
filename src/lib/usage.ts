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
import { CREDIT_TIMEZONE } from "@/lib/credit-clock";

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

// Postgres 15+ doesn't let a non-owner create tables in `public`, and shared
// hosts such as SiteGround hand out databases that way. When `public` turns out
// to be read-only, the tables go in this schema instead, which the app's user
// owns. Where `public` is writable (Render, a local database) it's never created.
const PRIVATE_SCHEMA = "kaiel_styler";

function getPool(): Pool {
  if (!globalForPg.__kaielStylerPool) {
    const connectionString = process.env.DATABASE_URL as string;
    // Render's internal connection string doesn't need TLS; the external one
    // does, and presents a cert Node won't chain on its own.
    const external = !/@[^/]*\.internal|localhost|127\.0\.0\.1/.test(connectionString);
    globalForPg.__kaielStylerPool = new Pool({
      connectionString,
      // Look in the app's own schema first; see ensureSchema().
      options: `-c search_path=${PRIVATE_SCHEMA},public`,
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
  CREATE INDEX IF NOT EXISTS render_log_prediction ON render_log (prediction_id);
`;

function ensureSchema(): Promise<void> {
  if (!globalForPg.__kaielStylerSchema) {
    globalForPg.__kaielStylerSchema = getPool()
      .query(SCHEMA)
      .catch(async (error: Error) => {
        if (!/permission denied for schema public/i.test(error.message)) throw error;
        await getPool().query(
          `CREATE SCHEMA IF NOT EXISTS ${PRIVATE_SCHEMA} AUTHORIZATION CURRENT_USER`
        );
        return getPool().query(SCHEMA);
      })
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
    VALUES ($1, $2, (NOW() AT TIME ZONE $3)::date)
    ON CONFLICT (username) DO UPDATE SET
      credits = CASE
        WHEN user_tracking.last_credit_refresh IS NULL
          OR user_tracking.last_credit_refresh <> (NOW() AT TIME ZONE $3)::date
        THEN $2 ELSE user_tracking.credits END,
      last_credit_refresh = (NOW() AT TIME ZONE $3)::date
    RETURNING *;
    `,
    [username, dailyCredits(), CREDIT_TIMEZONE]
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
      // Capped at the allowance: a refund that lands after the midnight reset
      // shouldn't leave anyone with more than a full day's renders.
      `UPDATE user_tracking
       SET credits = LEAST(credits + 1, $2), stylizations = GREATEST(stylizations - 1, 0)
       WHERE username = $1`,
      [username, dailyCredits()]
    );
  } catch (error) {
    console.error("[usage] refundCredit failed:", (error as Error).message);
  }
}

export type DatabaseStatus =
  | { state: "off" }
  | { state: "connected" }
  | { state: "error"; message: string; hint: string };

// Plain-language next steps for the failures people actually hit.
const HINTS: [RegExp, string][] = [
  [/password authentication failed/i, "The user or password in DATABASE_URL is wrong."],
  [/database "[^"]*" does not exist/i, "The database name in DATABASE_URL is wrong."],
  [/role "[^"]*" does not exist/i, "The user name in DATABASE_URL is wrong."],
  [
    /permission denied/i,
    "The database user isn't allowed to create tables. Give it all privileges on this database in the host's PostgreSQL settings.",
  ],
  [/no pg_hba\.conf entry/i, "The database server refused this connection. Allow it in the host's remote access list."],
  [/ssl/i, "Add ?sslmode=disable to the end of DATABASE_URL."],
  [
    /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|timeout/i,
    "The app can't reach the database server. Check the host and port in DATABASE_URL.",
  ],
];

/** Hide the password if a driver error ever echoes the connection string. */
function scrub(message: string): string {
  try {
    const password = decodeURIComponent(new URL(process.env.DATABASE_URL ?? "").password);
    return password ? message.split(password).join("•••") : message;
  } catch {
    return message;
  }
}

/**
 * Connects, creates the tables if needed, and runs a trivial query, so the
 * admin page can say plainly whether tracking is working and, if not, why.
 */
export async function databaseStatus(): Promise<DatabaseStatus> {
  if (!trackingEnabled()) return { state: "off" };
  try {
    await query("SELECT 1");
    return { state: "connected" };
  } catch (error) {
    const raw = (error as Error).message || "Unknown error";
    console.error("[usage] databaseStatus failed:", raw);
    const message = scrub(raw).slice(0, 300);
    const hint = HINTS.find(([pattern]) => pattern.test(raw))?.[1] ?? "Check DATABASE_URL.";
    return { state: "error", message, hint };
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
  /** "started" until the browser collects the result; it stays that way if nobody does. */
  status: "done" | "failed" | "started";
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
    status: row.status === "done" || row.status === "started" ? row.status : "failed",
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
/**
 * Records a render the moment Replicate accepts it, so the log shows renders
 * that were started but never collected (a closed tab, say) as well as
 * finished ones.
 */
export async function logRenderStart(entry: {
  username: string;
  finish: string;
  fix: string | null;
  predictionId: string;
}): Promise<void> {
  if (!trackingEnabled()) return;
  try {
    await query(
      `INSERT INTO render_log (username, finish, fix, status, prediction_id)
       VALUES ($1, $2, $3, 'started', $4)`,
      [entry.username, entry.finish, entry.fix, entry.predictionId]
    );
  } catch (error) {
    console.error("[usage] logRenderStart failed:", (error as Error).message);
  }
}

export type Settlement = {
  /** This call settled the render; only it may refund. */
  first: boolean;
  /** How an earlier call settled it, when this one didn't. */
  previous: "done" | "failed" | null;
};

/**
 * Marks a started render as done or failed. `first` is true only for the call
 * that actually settled it, so a result collected twice (two polls racing, or
 * a retry after a dropped connection) is logged and refunded once. Without a
 * database there's nothing to double-count, so `first` is true; if the
 * database errors, it's false, so nothing is refunded on a guess.
 */
export async function settleRender(entry: {
  username: string;
  finish: string;
  fix: string | null;
  predictionId: string;
  status: "done" | "failed";
  seconds: number;
  error?: string | null;
}): Promise<Settlement> {
  if (!trackingEnabled()) return { first: true, previous: null };
  const seconds = Math.round(entry.seconds * 10) / 10;
  const error = entry.error ? entry.error.slice(0, 300) : null;
  try {
    const updated = await query<{ id: number }>(
      `UPDATE render_log SET status = $2, seconds = $3, error = $4
       WHERE prediction_id = $1 AND status = 'started'
       RETURNING id`,
      [entry.predictionId, entry.status, seconds, error]
    );
    if (updated.length) return { first: true, previous: null };
    // No open row. Either it's already settled, or the start was never logged.
    const existing = await query<{ status: string }>(
      "SELECT status FROM render_log WHERE prediction_id = $1 LIMIT 1",
      [entry.predictionId]
    );
    if (existing.length) {
      const previous = existing[0].status === "done" ? "done" : "failed";
      return { first: false, previous };
    }
    await query(
      `INSERT INTO render_log (username, finish, fix, status, seconds, error, prediction_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [entry.username, entry.finish, entry.fix, entry.status, seconds, error, entry.predictionId]
    );
    return { first: true, previous: null };
  } catch (error) {
    console.error("[usage] settleRender failed:", (error as Error).message);
    return { first: false, previous: null };
  }
}

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
              COUNT(*) FILTER (WHERE status = 'failed') AS failed,
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
