import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  authenticate,
  createSession,
} from "@/lib/auth";
import { clientIp, rateLimit, resetLimit } from "@/lib/rate-limit";
import { recordLogin } from "@/lib/usage";

export const runtime = "nodejs";

// Two windows, because they defend against different things. The per-IP window
// stops one host spraying the whole user list; the per-username window stops a
// distributed guess at a single account.
const IP_LIMIT = { limit: 20, windowMs: 15 * 60_000, blockMs: 15 * 60_000 };
const USER_LIMIT = { limit: 8, windowMs: 15 * 60_000, blockMs: 15 * 60_000 };

export async function POST(request: Request) {
  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const username = (body.username ?? "").trim();
  const password = body.password ?? "";

  if (!username || !password) {
    return NextResponse.json(
      { error: "Enter both a username and password." },
      { status: 400 }
    );
  }

  const ip = clientIp(request);
  const ipKey = `login:ip:${ip}`;
  const userKey = `login:user:${username.toLowerCase()}`;

  for (const [key, options] of [
    [ipKey, IP_LIMIT],
    [userKey, USER_LIMIT],
  ] as const) {
    const check = rateLimit(key, options);
    if (!check.ok) {
      return NextResponse.json(
        {
          error: `Too many sign-in attempts. Try again in ${Math.ceil(
            check.retryAfterSeconds / 60
          )} minutes.`,
        },
        { status: 429, headers: { "Retry-After": String(check.retryAfterSeconds) } }
      );
    }
  }

  const user = await authenticate(username, password);
  if (!user) {
    console.warn(`[auth] failed sign-in for "${username}" from ${ip}`);
    return NextResponse.json(
      { error: "That username and password combination didn't work." },
      { status: 401 }
    );
  }

  let session: string;
  try {
    session = await createSession(user);
  } catch {
    return NextResponse.json(
      { error: "Sign-in is misconfigured on the server." },
      { status: 500 }
    );
  }

  resetLimit(ipKey);
  resetLimit(userKey);
  await recordLogin(user);

  const response = NextResponse.json({ username: user });
  response.cookies.set(SESSION_COOKIE, session, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}
