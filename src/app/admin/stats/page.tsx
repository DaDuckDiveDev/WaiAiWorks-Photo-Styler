import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { SESSION_COOKIE, isAdmin, verifySession } from "@/lib/auth";
import { LogoMark } from "@/components/logo-mark";
import { parseRecipe, recipeLabel } from "@/lib/catalog";
import {
  dailyCredits,
  databaseStatus,
  listUsage,
  recentRenders,
  renderBreakdown,
  trackingEnabled,
  type DatabaseStatus,
  type RenderLogEntry,
} from "@/lib/usage";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Usage · Kaiel Styler",
};

function DatabaseBadge({ status }: { status: DatabaseStatus }) {
  if (status.state === "off") return null;
  if (status.state === "connected") {
    return (
      <p className="mt-6 inline-flex items-center gap-2 text-sm text-haze" role="status">
        <span className="h-2 w-2 rounded-full bg-seaglass" aria-hidden />
        Database connected
      </p>
    );
  }
  return (
    <div className="panel mt-8 rounded-2xl border-coral/40 p-6 text-sm" role="alert">
      <p className="flex items-center gap-2 font-semibold text-coral">
        <span className="h-2 w-2 rounded-full bg-coral" aria-hidden />
        Database not connected — nothing is being recorded
      </p>
      <p className="mt-3 text-pearl">{status.hint}</p>
      <p className="mt-2 break-words font-mono text-xs text-haze">{status.message}</p>
      <p className="mt-3 text-xs text-dim">
        Renders still work while this is broken; they just aren&rsquo;t counted.
      </p>
    </div>
  );
}

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

  // Status first: it creates the tables, so the reads below don't race it.
  const status = await databaseStatus();
  const [rows, breakdown, recent] = await Promise.all([
    listUsage(),
    renderBreakdown(30),
    recentRenders(50),
  ]);
  const totals = rows.reduce(
    (acc, row) => ({
      uploads: acc.uploads + row.uploads,
      downloads: acc.downloads + row.downloads,
      stylizations: acc.stylizations + row.stylizations,
    }),
    { uploads: 0, downloads: 0, stylizations: 0 }
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <LogoMark />
        <Link
          href="/"
          className="btn px-4 py-2.5 text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to the studio
        </Link>
      </div>

      <div className="mt-10">
        <h1 className="wide text-3xl font-semibold leading-tight sm:text-4xl">Usage</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-haze">
          Every account, with lifetime counters and today&rsquo;s remaining
          balance. Credits reset to {dailyCredits()} on each user&rsquo;s first
          request after midnight UTC.
        </p>
      </div>

      <DatabaseBadge status={status} />

      {!trackingEnabled() ? (
        <p className="panel mt-8 rounded-2xl p-6 text-sm text-haze">
          Tracking is off — no <code className="text-reef">DATABASE_URL</code>{" "}
          is set on this environment, so nothing is being recorded.
        </p>
      ) : status.state === "error" ? null : rows.length === 0 ? (
        <p className="panel mt-8 rounded-2xl p-6 text-sm text-haze">
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

          <div className="panel mt-6 overflow-hidden rounded-2xl">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-rim text-xs text-haze">
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
                      className="border-b border-rim transition last:border-0 hover:bg-trench"
                    >
                      <td className="py-3.5 pl-6 pr-4 font-medium text-pearl">
                        {row.username}
                      </td>
                      <Td>{row.uploads}</Td>
                      <Td>{row.stylizations}</Td>
                      <Td>{row.downloads}</Td>
                      <td className="px-4 py-3.5 text-right tabular-nums">
                        <span
                          className={
                            row.credits <= 3 ? "font-semibold text-coral" : "text-pearl"
                          }
                        >
                          {row.credits}
                        </span>
                      </td>
                      <td className="py-3.5 pl-4 pr-6 text-haze">
                        {formatDateTime(row.lastLogin)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <a href="/api/admin/usage.csv" className="btn px-4 py-2.5 text-sm">
              <Download className="h-4 w-4" />
              Download usage CSV
            </a>
            <a href="/api/admin/renders.csv" className="btn px-4 py-2.5 text-sm">
              <Download className="h-4 w-4" />
              Download render log CSV
            </a>
          </div>

          <RenderSections breakdown={breakdown} recent={recent} />
        </>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel rounded-2xl p-5">
      <p className="text-sm text-haze">
        {label}
      </p>
      <p className="wide mt-2 text-3xl font-semibold tabular-nums text-pearl">
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
    <td className="px-4 py-3.5 text-right tabular-nums text-pearl">
      {children}
    </td>
  );
}

/* -------------------------------------------------------------------------- */
/* render log                                                                  */
/* -------------------------------------------------------------------------- */

function labelFor(finish: string, fix: string | null): string {
  const recipe = parseRecipe({ finish, fix });
  return recipe ? recipeLabel(recipe) : fix ? `${finish}, ${fix}` : finish;
}

function RenderSections({
  breakdown,
  recent,
}: {
  breakdown: Awaited<ReturnType<typeof renderBreakdown>>;
  recent: RenderLogEntry[];
}) {
  const done = breakdown.reduce((sum, row) => sum + row.done, 0);
  const failed = breakdown.reduce((sum, row) => sum + row.failed, 0);

  return (
    <>
      <section className="mt-14" aria-labelledby="looks-heading">
        <h2 id="looks-heading" className="wide text-xl font-semibold">
          Renders in the last 30 days
        </h2>
        <p className="mt-2 text-sm text-haze">
          {done.toLocaleString()} finished, {failed.toLocaleString()} failed. Failed renders
          don&rsquo;t use a credit.
        </p>
        {breakdown.length === 0 ? (
          <p className="panel mt-5 rounded-2xl p-6 text-sm text-haze">
            No renders logged yet. Each render shows up here as soon as it finishes.
          </p>
        ) : (
          <div className="panel mt-5 overflow-hidden rounded-2xl">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-rim text-xs text-haze">
                    <Th className="pl-6">Look and fix</Th>
                    <Th align="right">Finished</Th>
                    <Th align="right">Failed</Th>
                    <Th align="right" className="pr-6">
                      Average time
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((row) => (
                    <tr key={`${row.finish}-${row.fix ?? ""}`} className="border-b border-rim last:border-0">
                      <td className="py-3.5 pl-6 pr-4 font-medium text-pearl">
                        {labelFor(row.finish, row.fix)}
                      </td>
                      <Td>{row.done}</Td>
                      <td className="px-4 py-3.5 text-right tabular-nums">
                        <span className={row.failed ? "text-coral" : "text-pearl"}>{row.failed}</span>
                      </td>
                      <td className="py-3.5 pl-4 pr-6 text-right tabular-nums text-haze">
                        {row.avgSeconds === null ? "—" : `${row.avgSeconds}s`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="mt-14" aria-labelledby="recent-heading">
        <h2 id="recent-heading" className="wide text-xl font-semibold">
          Latest renders
        </h2>
        <p className="mt-2 text-sm text-haze">
          The last {recent.length} attempts, newest first. The Replicate ID finds a render
          in your Replicate dashboard.
        </p>
        {recent.length === 0 ? null : (
          <div className="panel mt-5 overflow-hidden rounded-2xl">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[58rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-rim text-xs text-haze">
                    <Th className="pl-6">When</Th>
                    <Th>Who</Th>
                    <Th>Look and fix</Th>
                    <Th>Result</Th>
                    <Th align="right">Time</Th>
                    <Th className="pr-6">Replicate ID</Th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((entry) => (
                    <tr key={entry.id} className="border-b border-rim align-top last:border-0">
                      <td className="whitespace-nowrap py-3.5 pl-6 pr-4 text-haze">
                        {formatDateTime(entry.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-haze">{entry.username}</td>
                      <td className="px-4 py-3.5 font-medium text-pearl">
                        {labelFor(entry.finish, entry.fix)}
                      </td>
                      <td className="px-4 py-3.5">
                        {entry.status === "done" ? (
                          <span className="text-seaglass">Finished</span>
                        ) : (
                          <span className="text-coral">
                            Failed
                            {entry.error ? (
                              <span className="mt-0.5 block max-w-xs text-xs text-haze">
                                {entry.error}
                              </span>
                            ) : null}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-haze">
                        {entry.seconds === null ? "—" : `${entry.seconds}s`}
                      </td>
                      <td className="py-3.5 pl-4 pr-6 font-mono text-xs text-dim">
                        {entry.predictionId ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
