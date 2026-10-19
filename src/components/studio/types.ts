import type { Recipe } from "@/lib/catalog";
import { recipeSlug } from "@/lib/catalog";
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

export function newId(): string {
  return crypto.randomUUID();
}

export function downloadName(shotIndex: number, version: Version): string {
  return `kaiel-photo${shotIndex + 1}-${recipeSlug(version.recipe)}.jpg`;
}

/**
 * Replicate URLs go through /api/download so the file arrives with a proper
 * name. Anything else (a data: URI from a local mock) is used as-is.
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
