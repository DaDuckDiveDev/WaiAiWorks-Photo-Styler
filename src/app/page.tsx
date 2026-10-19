import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, isAdmin, verifySession } from "@/lib/auth";
import { dailyCredits, getUsage } from "@/lib/usage";
import { Studio } from "@/components/studio";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const jar = await cookies();
  const username = await verifySession(jar.get(SESSION_COOKIE)?.value);

  // Middleware already gates this, but the page shouldn't assume it.
  if (!username) redirect("/login");

  const usage = await getUsage(username);

  return (
    <Studio
      username={username}
      credits={usage?.credits ?? null}
      allowance={dailyCredits()}
      admin={isAdmin(username)}
    />
  );
}
