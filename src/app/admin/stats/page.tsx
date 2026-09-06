import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { SESSION_COOKIE, isAdmin, verifySession } from "@/lib/auth";
import { LogoMark } from "@/components/logo-mark";
import { dailyCredits, listUsage, trackingEnabled } from "@/lib/usage";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Usage · Kaiel Styler",
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

export default async function StatsPage() {
  const jar = await cookies();
  const username = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!username) redirect("/login");

  // 404 rather than 403 — a non-admin has no reason to learn this page exists.
  if (!isAdmin(username)) notFound();

  const rows = await listUsage();
  const totals = rows.reduce(
    (acc, row) => ({
      uploads: acc.uploads + row.uploads,
      downloads: acc.downloads + row.downloads,
      stylizations: acc.stylizations + row.stylizations,
    }),
    { uploads: 0, downloads: 0, stylizations: 0 }
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-12 sm:py-16">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <LogoMark />
        <Link
          href="/"
          className="glass-btn inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to the studio
        </Link>
      </div>

      <div className="mt-10">
        <h1 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">
          <span className="liquid-text">Usage</span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-pacific/70">
          Every account, with lifetime counters and today&rsquo;s remaining
          balance. Credits reset to {dailyCredits()} on each user&rsquo;s first
          request after midnight UTC.
        </p>
      </div>

      {!trackingEnabled() ? (
        <p className="glass-card mt-8 p-6 text-sm text-pacific/70">
          Tracking is off — no <code className="text-skyline">DATABASE_URL</code>{" "}
          is set on this environment, so nothing is being recorded.
        </p>
      ) : rows.length === 0 ? (
        <p className="glass-card mt-8 p-6 text-sm text-pacific/70">
          No activity recorded yet. Rows appear the first time someone signs in.
        </p>
      ) : (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-4">
            <Stat label="Accounts" value={rows.length} />
            <Stat label="Uploads" value={totals.uploads} />
            <Stat label="Renders" value={totals.stylizations} />
            <Stat label="Downloads" value={totals.downloads} />
          </div>

          <div className="glass-card mt-6 overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs uppercase tracking-[0.14em] text-pacific/55">
                    <Th className="pl-6">User</Th>
                    <Th align="right">Uploads</Th>
                    <Th align="right">Renders</Th>
                    <Th align="right">Downloads</Th>
                    <Th align="right">Credits left</Th>
                    <Th className="pr-6">Last sign-in</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.username}
                      className="border-b border-white/5 transition last:border-0 hover:bg-white/[0.04]"
                    >
                      <td className="py-3.5 pl-6 pr-4 font-medium text-pacific">
                        {row.username}
                      </td>
                      <Td>{row.uploads}</Td>
                      <Td>{row.stylizations}</Td>
                      <Td>{row.downloads}</Td>
                      <td className="px-4 py-3.5 text-right tabular-nums">
                        <span
                          className={
                            row.credits <= 3 ? "font-semibold text-coral" : "text-pacific/80"
                          }
                        >
                          {row.credits}
                        </span>
                      </td>
                      <td className="py-3.5 pl-4 pr-6 text-pacific/60">
                        {formatDateTime(row.lastLogin)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-6">
            <a
              href="/api/admin/usage.csv"
              className="glass-btn inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium"
            >
              <Download className="h-4 w-4" />
              Download CSV
            </a>
          </div>
        </>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-card p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-pacific/55">
        {label}
      </p>
      <p className="font-display mt-2 text-3xl font-semibold tabular-nums text-pacific">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function Th({
  children,
  align = "left",
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`px-4 py-3.5 font-semibold ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-4 py-3.5 text-right tabular-nums text-pacific/80">
      {children}
    </td>
  );
}
