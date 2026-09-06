import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, isAdmin, verifySession } from "@/lib/auth";
import { listUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = [
  "username",
  "uploads",
  "stylizations",
  "downloads",
  "credits",
  "last_credit_refresh",
  "last_login",
] as const;

// Prefix anything a spreadsheet would treat as a formula. Usernames come from
// an env var we control, but this endpoint is a file people open in Excel.
function cell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET() {
  const jar = await cookies();
  const user = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const rows = await listUsage();
  const body = [
    HEADERS.join(","),
    ...rows.map((row) =>
      [
        row.username,
        row.uploads,
        row.stylizations,
        row.downloads,
        row.credits,
        row.lastCreditRefresh,
        row.lastLogin,
      ]
        .map(cell)
        .join(",")
    ),
  ].join("\n");

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kaiel-styler-usage-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
