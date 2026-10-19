import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, isAdmin, verifySession } from "@/lib/auth";
import { rendersSince } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = [
  "created_at_utc",
  "username",
  "finish",
  "fix",
  "status",
  "seconds",
  "error",
  "replicate_prediction_id",
] as const;

// Prefix anything a spreadsheet would treat as a formula; error text comes
// from an outside service and this file gets opened in Excel.
function cell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Every render attempt from the last 90 days. */
export async function GET() {
  const jar = await cookies();
  const user = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const rows = await rendersSince(since);
  const body = [
    HEADERS.join(","),
    ...rows.map((row) =>
      [row.createdAt, row.username, row.finish, row.fix, row.status, row.seconds, row.error, row.predictionId]
        .map(cell)
        .join(",")
    ),
  ].join("\n");

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kaiel-styler-renders-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
