import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { recordEvent } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 60;

// Only proxy Replicate's own output hosts — this endpoint must never become
// an open redirect or a general-purpose fetcher.
const ALLOWED_HOSTS = new Set(["replicate.delivery", "pbxt.replicate.delivery"]);

function isAllowed(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    (ALLOWED_HOSTS.has(url.hostname) || url.hostname.endsWith(".replicate.delivery"))
  );
}

export async function GET(request: Request) {
  const jar = await cookies();
  const user = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const raw = params.get("url");
  const name = (params.get("name") ?? "kaiel-styler.jpg").replace(/[^a-zA-Z0-9._-]/g, "");

  if (!raw) {
    return NextResponse.json({ error: "Missing url." }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Invalid url." }, { status: 400 });
  }
  if (!isAllowed(target)) {
    return NextResponse.json({ error: "That host isn't allowed." }, { status: 400 });
  }

  const upstream = await fetch(target, { cache: "no-store" });
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Could not fetch that image." }, { status: 502 });
  }

  await recordEvent(user, "downloads");

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
