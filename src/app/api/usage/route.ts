import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getUsage, recordEvent } from "@/lib/usage";

export const runtime = "nodejs";

/**
 * The signed-in account's current balance. The studio asks before refusing a
 * render on a zero balance, since the allowance may have reset at midnight
 * while the tab stayed open. Reading it also applies that reset.
 */
export async function GET() {
  const jar = await cookies();
  const user = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const usage = await getUsage(user);
  return NextResponse.json(
    { credits: usage?.credits ?? null },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * Counts downloads saved straight from the page. Renders arrive as data: URIs,
 * so those downloads never pass through /api/download to be counted there.
 */
export async function POST(request: Request) {
  const jar = await cookies();
  const user = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { event?: unknown; count?: unknown } | null;
  if (!body || body.event !== "download") {
    return NextResponse.json({ error: "Unknown event." }, { status: 400 });
  }
  const count = typeof body.count === "number" ? Math.min(Math.max(Math.floor(body.count), 1), 25) : 1;
  await recordEvent(user, "downloads", count);
  return NextResponse.json({ ok: true });
}
