import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getUsage } from "@/lib/usage";

export const runtime = "nodejs";

/**
 * The signed-in account's current balance. The studio asks before refusing a
 * render on a zero balance, since the allowance may have reset at midnight UTC
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
