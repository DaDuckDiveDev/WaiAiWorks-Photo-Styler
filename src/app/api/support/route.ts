import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Support / issue reports.
 *
 * The legacy app hand-rolled SMTP to Gmail. Resend is a single HTTPS call and
 * doesn't need an app password sitting in env, so it's the default here. If
 * RESEND_API_KEY isn't set the message is logged instead of dropped.
 */
export async function POST(request: Request) {
  const jar = await cookies();
  const user = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { message?: string; topic?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const message = (body.message ?? "").trim();
  const topic = body.topic === "report" ? "Issue report" : "Support request";

  if (!message) {
    return NextResponse.json({ error: "Write a message first." }, { status: 400 });
  }
  if (message.length > 5000) {
    return NextResponse.json({ error: "Keep it under 5000 characters." }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.SUPPORT_EMAIL_TO;
  const from = process.env.SUPPORT_EMAIL_FROM;

  if (!apiKey || !to || !from) {
    console.warn(`[support] ${topic} from ${user} (email not configured):\n${message}`);
    return NextResponse.json({ ok: true, delivered: false });
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: to,
      subject: `Kaiel Styler — ${topic} from ${user}`,
      text: `User: ${user}\nType: ${topic}\n\n${message}`,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error(`[support] delivery failed: ${detail.slice(0, 300)}`);
    return NextResponse.json({ error: "Couldn't send that. Try again shortly." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, delivered: true });
}
