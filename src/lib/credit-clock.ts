/**
 * When "today" ends for the daily render allowance.
 *
 * The old Flask app reset credits at midnight Chicago time, where the studio's
 * photographers work, so that's the default. Set NEXT_PUBLIC_CREDIT_TIMEZONE
 * (an IANA name such as "UTC" or "Europe/Belgrade") before building to change
 * it; the server and the studio's wording both follow it.
 */

function validZone(zone: string | undefined): string | null {
  if (!zone) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}

export const CREDIT_TIMEZONE = validZone(process.env.NEXT_PUBLIC_CREDIT_TIMEZONE) ?? "America/Chicago";

/** "midnight Chicago time", for every message about the reset. */
export const RESET_LABEL =
  CREDIT_TIMEZONE === "UTC"
    ? "midnight UTC"
    : `midnight ${(CREDIT_TIMEZONE.split("/").pop() ?? CREDIT_TIMEZONE).replace(/_/g, " ")} time`;
