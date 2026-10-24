import type { Recipe } from "@/lib/catalog";
import { recipeSlug, sameRecipe } from "@/lib/catalog";
import type { PreparedImage } from "@/lib/image";

export type VersionStatus = "queued" | "working" | "done" | "error";

/** One render of one photo. A photo keeps every version made this session. */
export type Version = {
  id: string;
  recipe: Recipe;
  status: VersionStatus;
  url?: string;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
  /** Saved to the device at least once, so clearing it loses nothing. */
  downloaded?: boolean;
};

export type Shot = PreparedImage & {
  versions: Version[];
  activeVersionId: string | null;
};

export type Scope = "one" | "all";
export type ViewMode = "original" | "compare" | "result";

export type Batch = {
  jobs: { shotId: string; versionId: string }[];
  done: number;
  startedAt: number;
  stopping: boolean;
};

export function activeVersion(shot: Shot | null | undefined): Version | null {
  if (!shot?.activeVersionId) return null;
  return shot.versions.find((version) => version.id === shot.activeVersionId) ?? null;
}

/** The state a filmstrip tile should show for a photo. */
export function shotStatus(shot: Shot): VersionStatus | "idle" {
  if (shot.versions.some((version) => version.status === "working")) return "working";
  if (shot.versions.some((version) => version.status === "queued")) return "queued";
  return activeVersion(shot)?.status ?? "idle";
}

/** True if this photo already has, or is getting, a render with this recipe. */
export function hasRecipe(shot: Shot, recipe: Recipe): boolean {
  return shot.versions.some(
    (version) => version.status !== "error" && sameRecipe(version.recipe, recipe)
  );
}

/** What the render button will do right now, so its label never surprises anyone. */
export type RenderPlan = {
  targets: Shot[];
  /** Photos in the strip. */
  total: number;
  /** Rendering just the selected photo. */
  single: boolean;
  /** Photos left out of "All" because they already have this look. */
  skipped: number;
  /** Everything in scope already has this look, so this renders it again. */
  again: boolean;
};

/**
 * "All" means every photo that doesn't have this look yet. Adding a new photo
 * to a strip that's already rendered then renders just the new one, instead of
 * paying again for photos that are done. If every photo already has the look,
 * "All" renders them all again, and the button says so.
 */
export function planRender(
  shots: Shot[],
  selected: Shot | null,
  scope: Scope,
  recipe: Recipe
): RenderPlan {
  const total = shots.length;
  if (!total) return { targets: [], total, single: true, skipped: 0, again: false };
  if (scope === "one" || total === 1) {
    const target = selected ?? shots[0];
    return { targets: [target], total, single: true, skipped: 0, again: hasRecipe(target, recipe) };
  }
  const fresh = shots.filter((shot) => !hasRecipe(shot, recipe));
  if (!fresh.length) return { targets: shots, total, single: false, skipped: 0, again: true };
  return { targets: fresh, total, single: false, skipped: total - fresh.length, again: false };
}

export function newId(): string {
  return crypto.randomUUID();
}

export function downloadName(shotIndex: number, version: Version): string {
  return `kaiel-photo${shotIndex + 1}-${recipeSlug(version.recipe)}.jpg`;
}

/**
 * Renders normally arrive as data: URIs (the server keeps a copy, since
 * Replicate deletes its own after an hour) and download straight from the
 * page. A Replicate link, the fallback when that copy failed, goes through
 * /api/download so the file arrives with a proper name.
 */
export function downloadHref(url: string, name: string): string {
  if (!url.startsWith("https://")) return url;
  return `/api/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`;
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Counts downloads that happen in the browser (data: URIs never reach
 * /api/download, which counts its own). Best effort; never blocks the save.
 */
export function noteDownloads(urls: (string | undefined)[]): void {
  const local = urls.filter((url) => url && !url.startsWith("https://")).length;
  if (!local) return;
  void fetch("/api/usage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "download", count: local }),
    keepalive: true,
  }).catch(() => undefined);
}
