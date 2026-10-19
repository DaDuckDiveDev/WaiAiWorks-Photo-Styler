"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, BookOpen, LifeBuoy, LogOut, X } from "lucide-react";
import { LogoMark } from "@/components/logo-mark";
import {
  DEFAULT_RECIPE,
  parseRecipe,
  recipeLabel,
  type FixId,
  type Recipe,
} from "@/lib/catalog";
import { prepareImage } from "@/lib/image";
import { Elapsed, Spinner, useModKey } from "./bits";
import { HelpModal, SupportModal, type SupportRequest } from "./dialogs";
import { Filmstrip, VersionBar } from "./filmstrip";
import { RecipePicker, RecipeSummary, RenderControls } from "./inspector";
import {
  activeVersion,
  downloadHref,
  downloadName,
  newId,
  type Batch,
  type Scope,
  type Shot,
  type Version,
  type ViewMode,
} from "./types";
import { Viewer } from "./viewer";

const MAX_SHOTS = 5;
const PREFS_KEY = "kaiel-styler:prefs";
const REVEAL_DWELL_MS = 2600;

type Outcome = "done" | "failed" | "exhausted" | "throttled" | "signed-out";
type Toast = {
  id: number;
  message: string;
  tone: "info" | "warn";
  action?: { label: string; href: string };
};

export function Studio({
  username,
  credits: initialCredits,
  allowance,
  admin,
}: {
  username: string;
  /** Null when usage tracking is off, in which case renders are unmetered. */
  credits: number | null;
  /** Renders per day, for the meter. */
  allowance: number;
  admin: boolean;
}) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<Recipe>(DEFAULT_RECIPE);
  const [expandedFix, setExpandedFix] = useState<FixId | null>(null);
  const [scope, setScope] = useState<Scope>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("compare");
  const [credits, setCredits] = useState<number | null>(initialCredits);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [dragging, setDragging] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [support, setSupport] = useState<SupportRequest | null>(null);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const modKey = useModKey();

  const inputRef = useRef<HTMLInputElement>(null);
  /*
   * Photo counts kept in step synchronously, so two adds in quick succession
   * (a drop and then a paste, say) can't both see the same free room.
   * `shotCount` is what's in the strip; `pendingCount` is still being read.
   */
  const shotCount = useRef(0);
  const pendingCount = useRef(0);
  const batchRef = useRef<Batch | null>(null);
  const stopRef = useRef(false);
  /** The viewer follows the photo being rendered until the user picks one. */
  const followRef = useRef(true);
  /** The batch being followed. Outlives the batch so its last hand-off still lands. */
  const followedBatch = useRef<Batch | null>(null);

  /* ---- remembered choices (per browser, best effort) ---- */

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null");
      const savedRecipe = saved ? parseRecipe(saved.recipe ?? {}) : null;
      if (savedRecipe) {
        setRecipe(savedRecipe);
        if (savedRecipe.fix) setExpandedFix(savedRecipe.fix);
      }
      if (saved?.scope === "one" || saved?.scope === "all") setScope(saved.scope);
    } catch {
      // Private mode or blocked storage: defaults are fine.
    }
    setPrefsLoaded(true);
  }, []);

  useEffect(() => {
    if (!prefsLoaded) return;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ recipe, scope }));
    } catch {
      // Not worth surfacing.
    }
  }, [prefsLoaded, recipe, scope]);

  /* ---- derived ---- */

  const selectedIndex = shots.findIndex((shot) => shot.id === selectedId);
  const selected = selectedIndex >= 0 ? shots[selectedIndex] : null;
  const selectedVersion = activeVersion(selected);
  const finished = useMemo(
    () =>
      shots.flatMap((shot, index) =>
        shot.versions
          .filter((version) => version.status === "done" && version.url)
          .map((version) => ({ index, version }))
      ),
    [shots]
  );

  // Whatever changed the strip, keep a photo that exists selected.
  useEffect(() => {
    if (!shots.length) {
      if (selectedId !== null) setSelectedId(null);
    } else if (!shots.some((shot) => shot.id === selectedId)) {
      setSelectedId(shots[0].id);
    }
  }, [shots, selectedId]);

  const notify = useCallback(
    (message: string, tone: Toast["tone"] = "info", action?: Toast["action"]) =>
      setToast({ id: Date.now(), message, tone, action }),
    []
  );

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.action ? 12_000 : 6_500);
    return () => clearTimeout(timer);
  }, [toast]);

  /* ---- photos ---- */

  const chooseFiles = useCallback(() => inputRef.current?.click(), []);

  const addFiles = useCallback(
    async (files: File[]) => {
      const images = files.filter((file) => file.type.startsWith("image/"));
      if (!images.length) {
        if (files.length) notify("Those files aren't photos. Add JPG or PNG images.", "warn");
        return;
      }

      const room = MAX_SHOTS - shotCount.current - pendingCount.current;
      if (room <= 0) {
        notify(`A batch holds ${MAX_SHOTS} photos. Remove one to add another.`, "warn");
        return;
      }

      const accepted = images.slice(0, room);
      pendingCount.current += accepted.length;
      const results = await Promise.allSettled(accepted.map((file) => prepareImage(file)));
      pendingCount.current -= accepted.length;
      const prepared = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : []
      );
      const unreadable = accepted
        .filter((_, index) => results[index].status === "rejected")
        .map((file) => file.name);

      if (prepared.length) {
        shotCount.current = Math.min(MAX_SHOTS, shotCount.current + prepared.length);
        setShots((current) =>
          [
            ...current,
            ...prepared.map((image) => ({ ...image, versions: [], activeVersionId: null })),
          ].slice(0, MAX_SHOTS)
        );
        setSelectedId(prepared[0].id);
      }

      if (unreadable.length) {
        notify(
          `Couldn't read ${unreadable.join(", ")}. Save it as JPG or PNG and try again.`,
          "warn"
        );
      } else if (images.length > room) {
        notify(`Added ${room}. A batch holds ${MAX_SHOTS} photos.`);
      }
    },
    [notify]
  );

  const selectShot = useCallback((id: string) => {
    if (batchRef.current) followRef.current = false;
    setSelectedId(id);
  }, []);

  function removeShot(id: string) {
    const index = shots.findIndex((shot) => shot.id === id);
    const remaining = shots.filter((shot) => shot.id !== id);
    shotCount.current = remaining.length;
    setShots(remaining);
    if (selectedId === id) {
      setSelectedId(remaining[Math.min(index, remaining.length - 1)]?.id ?? null);
    }
  }

  function clearAll() {
    shotCount.current = 0;
    setShots([]);
    setSelectedId(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  /* ---- rendering ---- */

  const patchVersion = useCallback(
    (shotId: string, versionId: string, patch: Partial<Version>) =>
      setShots((current) =>
        current.map((shot) =>
          shot.id !== shotId
            ? shot
            : {
                ...shot,
                versions: shot.versions.map((version) =>
                  version.id === versionId ? { ...version, ...patch } : version
                ),
              }
        )
      ),
    []
  );

  /** Removes versions that never started, e.g. after Stop or running out. */
  const dropVersions = useCallback((versionIds: string[]) => {
    const drop = new Set(versionIds);
    setShots((current) =>
      current.map((shot) => {
        if (!shot.versions.some((version) => drop.has(version.id))) return shot;
        const versions = shot.versions.filter((version) => !drop.has(version.id));
        const activeVersionId =
          shot.activeVersionId && drop.has(shot.activeVersionId)
            ? (versions.at(-1)?.id ?? null)
            : shot.activeVersionId;
        return { ...shot, versions, activeVersionId };
      })
    );
  }, []);

  const runVersion = useCallback(
    async (shotId: string, versionId: string, chosen: Recipe, image: string): Promise<Outcome> => {
      patchVersion(shotId, versionId, { status: "working", startedAt: Date.now() });

      let response: Response;
      try {
        response = await fetch("/api/stylize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image, finish: chosen.finish, fix: chosen.fix }),
        });
      } catch {
        patchVersion(shotId, versionId, {
          status: "error",
          error: "Couldn't reach the studio. Check your connection and try again.",
          finishedAt: Date.now(),
        });
        return "failed";
      }

      // A proxy timeout can answer with HTML, so don't assume JSON.
      const data = (await response.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
        credits?: number | null;
      };

      // The server is the source of truth on the balance, including refunds.
      if (typeof data.credits === "number") setCredits(data.credits);

      if (!response.ok || !data.url) {
        patchVersion(shotId, versionId, {
          status: "error",
          error:
            data.error ??
            (response.status === 504
              ? "The render took too long to come back. Try again."
              : `The render failed (${response.status}). Try again.`),
          finishedAt: Date.now(),
        });
        if (response.status === 401) return "signed-out";
        // 402 is the daily allowance running out; 429 is the burst guard.
        if (response.status === 402) return "exhausted";
        if (response.status === 429) return "throttled";
        return "failed";
      }

      patchVersion(shotId, versionId, { status: "done", url: data.url, finishedAt: Date.now() });
      return "done";
    },
    [patchVersion]
  );

  const runBatch = useCallback(
    async (targets: Shot[], chosen: Recipe) => {
      if (batchRef.current || !targets.length) return;

      const jobs = targets.map((shot) => ({ shotId: shot.id, versionId: newId() }));
      const next: Batch = { jobs, done: 0, startedAt: Date.now(), stopping: false };
      batchRef.current = next;
      followedBatch.current = next;
      stopRef.current = false;
      followRef.current = true;
      setBatch(next);
      setToast(null);
      setViewMode("compare");
      setShots((current) =>
        current.map((shot) => {
          const job = jobs.find((candidate) => candidate.shotId === shot.id);
          if (!job) return shot;
          const queued: Version = { id: job.versionId, recipe: chosen, status: "queued" };
          return { ...shot, versions: [...shot.versions, queued], activeVersionId: job.versionId };
        })
      );

      // Sequential on purpose: keeps Replicate concurrency predictable and lets
      // each result land on its photo as it finishes.
      let stopped: "user" | "exhausted" | "throttled" | "signed-out" | null = null;
      for (let index = 0; index < jobs.length; index += 1) {
        const job = jobs[index];
        if (stopRef.current) {
          stopped = "user";
          dropVersions(jobs.slice(index).map((rest) => rest.versionId));
          break;
        }
        const shot = targets.find((target) => target.id === job.shotId) as Shot;
        if (index === 0) {
          if (followRef.current) setSelectedId(job.shotId);
        } else {
          // Let the photo that just finished hold the viewer long enough to
          // see its result before moving on to the one now rendering.
          setTimeout(() => {
            if (followRef.current && followedBatch.current === next) setSelectedId(job.shotId);
          }, REVEAL_DWELL_MS);
        }

        const outcome = await runVersion(job.shotId, job.versionId, chosen, shot.dataUrl);
        setBatch((current) => (current ? { ...current, done: current.done + 1 } : current));

        if (outcome === "exhausted" || outcome === "throttled" || outcome === "signed-out") {
          stopped = outcome;
          dropVersions(jobs.slice(index + 1).map((rest) => rest.versionId));
          break;
        }
      }

      batchRef.current = null;
      setBatch(null);

      if (stopped === "exhausted") {
        notify("Stopped early: no renders left for today. They reset at midnight UTC.", "warn");
      } else if (stopped === "throttled") {
        notify("Paused: too many renders in the last minute. Wait a moment, then render again.", "warn");
      } else if (stopped === "signed-out") {
        notify("Your session expired, so the batch stopped.", "warn", {
          label: "Sign in again",
          href: "/login",
        });
      } else if (stopped === "user") {
        notify("Batch stopped. Photos that hadn't started weren't charged.");
      }
    },
    [dropVersions, notify, runVersion]
  );

  /**
   * True if a render may start. A zero balance is re-checked with the server
   * first: the allowance resets at midnight UTC while the tab may stay open.
   */
  const hasCredit = useCallback(async (): Promise<boolean> => {
    if (credits === null || credits > 0) return true;
    let balance: number | null = credits;
    try {
      const response = await fetch("/api/usage", { cache: "no-store" });
      if (response.ok) {
        const data = (await response.json()) as { credits?: number | null };
        if (typeof data.credits === "number" || data.credits === null) balance = data.credits;
      }
    } catch {
      // Offline: fall through with the balance we have.
    }
    setCredits(balance);
    if (balance !== null && balance <= 0) {
      notify("No renders left for today. They reset at midnight UTC.", "warn");
      return false;
    }
    return true;
  }, [credits, notify]);

  const startRender = useCallback(async () => {
    if (batchRef.current) return;
    if (!shots.length) {
      chooseFiles();
      return;
    }
    const targets = scope === "one" || shots.length === 1 ? (selected ? [selected] : []) : shots;
    const chosen = recipe;
    if (!(await hasCredit())) return;
    void runBatch(targets, chosen);
  }, [chooseFiles, hasCredit, recipe, runBatch, scope, selected, shots]);

  function stopBatch() {
    stopRef.current = true;
    setBatch((current) => (current ? { ...current, stopping: true } : current));
  }

  async function retry(version: Version) {
    if (batchRef.current || !selected) return;
    const shot = selected;
    if (!(await hasCredit())) return;
    // Replace the failed attempt rather than stacking failures up.
    dropVersions([version.id]);
    void runBatch([shot], version.recipe);
  }

  function report(version: Version) {
    const at = version.finishedAt
      ? new Date(version.finishedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : "just now";
    const lines = [
      `Photo ${selectedIndex + 1} (${selected?.name ?? "unknown"}), ${recipeLabel(version.recipe)}, at ${at}.`,
      version.error ? `Error shown: ${version.error}` : null,
      "",
      "What looked wrong: ",
    ].filter((line) => line !== null);
    setSupport({ kind: "report", draft: lines.join("\n") });
  }

  function downloadAll() {
    finished.forEach(({ index, version }, order) => {
      setTimeout(() => {
        const name = downloadName(index, version);
        const link = document.createElement("a");
        link.href = downloadHref(version.url as string, name);
        link.download = name;
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }, order * 700);
    });
  }

  /* ---- leaving mid-batch ---- */

  const rendering = batch !== null;
  useEffect(() => {
    if (!rendering) return;
    // Results live only in this tab; warn before a reload or close drops them.
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [rendering]);

  /* ---- keyboard and paste ---- */

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (helpOpen || support) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;

      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void startRender();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      // The compare divider uses the arrow keys itself.
      if (target?.closest("[role='slider']")) return;
      if (shots.length < 2) return;

      event.preventDefault();
      const step = event.key === "ArrowRight" ? 1 : -1;
      const from = selectedIndex < 0 ? 0 : selectedIndex;
      selectShot(shots[(from + step + shots.length) % shots.length].id);
    }

    function onPaste(event: ClipboardEvent) {
      if (helpOpen || support) return;
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
        file.type.startsWith("image/")
      );
      if (!files.length) return;
      event.preventDefault();
      void addFiles(files);
    }

    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("paste", onPaste);
    };
  }, [addFiles, helpOpen, selectShot, selectedIndex, shots, startRender, support]);

  /* ---- layout ---- */

  const dropHandlers = {
    onDragEnter: (event: React.DragEvent) => {
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      setDragging(true);
    },
    onDragOver: (event: React.DragEvent) => {
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      if (!dragging) setDragging(true);
    },
    onDragLeave: (event: React.DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
    },
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      void addFiles(Array.from(event.dataTransfer.files));
    },
  };

  const renderProps = {
    total: shots.length,
    scope,
    onScope: setScope,
    recipe,
    credits,
    batch,
    modKey,
    onRender: startRender,
    onStop: stopBatch,
  };

  return (
    <div className="flex min-h-screen flex-col">
      <h1 className="sr-only">Kaiel Styler studio</h1>

      <header className="sticky top-0 z-30 border-b border-rim bg-void/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-6">
          <LogoMark />
          <nav aria-label="Studio" className="flex items-center gap-0.5 sm:gap-1">
            {credits !== null ? <CreditMeter credits={credits} allowance={allowance} /> : null}
            {admin ? (
              <Link
                href="/admin/stats"
                target="_blank"
                rel="noopener"
                aria-label="Usage, opens in a new tab"
                className="btn-ghost px-2.5 py-2 text-sm"
              >
                <BarChart3 className="h-4 w-4" />
                <span className="hidden md:inline">Usage</span>
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              aria-label="How it works"
              className="btn-ghost px-2.5 py-2 text-sm"
            >
              <BookOpen className="h-4 w-4" />
              <span className="hidden md:inline">How it works</span>
            </button>
            <button
              type="button"
              onClick={() => setSupport({ kind: "support", draft: "" })}
              aria-label="Support"
              className="btn-ghost px-2.5 py-2 text-sm"
            >
              <LifeBuoy className="h-4 w-4" />
              <span className="hidden md:inline">Support</span>
            </button>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                aria-label="Sign out"
                title={`Signed in as ${username}`}
                className="btn-ghost px-2.5 py-2 text-sm"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden md:inline">Sign out</span>
              </button>
            </form>
          </nav>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1600px] flex-1 gap-5 px-4 pb-40 pt-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6 lg:pb-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <main
          className="flex min-w-0 flex-col gap-4 lg:min-h-[calc(100vh-6.5rem)]"
          {...dropHandlers}
        >
          <Viewer
            shot={selected}
            version={selectedVersion}
            viewMode={viewMode}
            dragging={dragging}
            modKey={modKey}
            onChoose={chooseFiles}
            onRetry={retry}
            onReport={report}
            retryDisabled={batch !== null}
          />

          {selected ? (
            <VersionBar
              shot={selected}
              shotIndex={selectedIndex}
              total={shots.length}
              viewMode={viewMode}
              onViewMode={setViewMode}
              onPickVersion={(versionId) =>
                setShots((current) =>
                  current.map((shot) =>
                    shot.id === selected.id ? { ...shot, activeVersionId: versionId } : shot
                  )
                )
              }
              onReport={report}
            />
          ) : null}

          {shots.length ? (
            <Filmstrip
              shots={shots}
              selectedId={selectedId}
              maxShots={MAX_SHOTS}
              locked={batch !== null}
              finishedCount={finished.length}
              onSelect={selectShot}
              onRemove={removeShot}
              onAdd={chooseFiles}
              onDownloadAll={downloadAll}
              onClear={clearAll}
            />
          ) : null}
        </main>

        <aside aria-label="Render settings" className="lg:sticky lg:top-20 lg:h-[calc(100vh-6.5rem)]">
          <div className="panel flex h-full flex-col rounded-2xl">
            <div className="thin-scroll scroll-fade flex-1 overflow-y-auto p-5 lg:pb-9">
              <RecipePicker
                recipe={recipe}
                onRecipe={setRecipe}
                expandedFix={expandedFix}
                onExpandFix={setExpandedFix}
              />
            </div>
            <div className="hidden border-t border-rim p-5 lg:block">
              <RenderControls {...renderProps} />
            </div>
          </div>
        </aside>
      </div>

      <MobileRenderBar {...renderProps} />

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          void addFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />

      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-44 z-40 flex justify-center px-4 lg:bottom-6"
      >
        <AnimatePresence>
          {toast ? (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className={`pointer-events-auto flex max-w-lg items-center gap-3 rounded-xl border py-2.5 pl-4 pr-2 text-sm shadow-lift ${
                toast.tone === "warn"
                  ? "border-coral/40 bg-[#1b1016] text-pearl"
                  : "border-rim-strong bg-trench text-pearl"
              }`}
            >
              <p>{toast.message}</p>
              {toast.action ? (
                <a href={toast.action.href} className="shrink-0 font-semibold text-reef hover:underline">
                  {toast.action.label}
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => setToast(null)}
                aria-label="Dismiss"
                className="btn-ghost grid h-7 w-7 shrink-0 place-items-center"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <HelpModal
        open={helpOpen}
        metered={credits !== null}
        modKey={modKey}
        onClose={() => setHelpOpen(false)}
      />
      <SupportModal request={support} username={username} onClose={() => setSupport(null)} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function CreditMeter({ credits, allowance }: { credits: number; allowance: number }) {
  const low = credits <= 3;
  const percent = Math.max(0, Math.min(100, (credits / Math.max(allowance, 1)) * 100));
  return (
    <div
      className="mr-1 flex items-center gap-2.5 sm:mr-2"
      title="Renders left today. The count resets at midnight UTC."
    >
      <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-shelf sm:block">
        <span
          className={`block h-full rounded-full ${low ? "bg-coral" : "bg-gradient-to-r from-reef to-skyline"}`}
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className={`tnum text-sm ${low ? "text-coral" : "text-pearl"}`}>
        <span className="font-semibold">{credits}</span>
        <span className={low ? "" : "text-haze"}>
          {" "}
          left<span className="hidden sm:inline"> today</span>
        </span>
      </span>
    </div>
  );
}

function MobileRenderBar({
  total,
  scope,
  onScope,
  recipe,
  credits,
  batch,
  onRender,
  onStop,
}: {
  total: number;
  scope: Scope;
  onScope: (scope: Scope) => void;
  recipe: Recipe;
  credits: number | null;
  batch: Batch | null;
  onRender: () => void;
  onStop: () => void;
}) {
  const count = scope === "one" || total <= 1 ? Math.min(total, 1) : total;
  const outOfCredits = credits !== null && credits <= 0;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-rim bg-abyss/95 px-4 pt-3 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: "max(0.875rem, env(safe-area-inset-bottom))" }}
    >
      {batch ? (
        <div className="flex items-center gap-3" aria-live="polite">
          <Spinner />
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">
            {batch.jobs.length === 1
              ? "Rendering 1 photo"
              : `Rendering ${Math.min(batch.done + 1, batch.jobs.length)} of ${batch.jobs.length}`}
            <span className="ml-2 font-normal text-haze">
              <Elapsed since={batch.startedAt} />
            </span>
          </p>
          <button
            type="button"
            onClick={onStop}
            disabled={batch.stopping || batch.done + 1 >= batch.jobs.length}
            className="btn shrink-0 px-3 py-2 text-xs"
          >
            {batch.stopping ? "Stopping" : "Stop"}
          </button>
        </div>
      ) : (
        <>
          {total > 1 ? (
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="seg" role="group" aria-label="Photos to render">
                <button
                  type="button"
                  aria-pressed={scope === "one"}
                  onClick={() => onScope("one")}
                  className="text-xs"
                >
                  This photo
                </button>
                <button
                  type="button"
                  aria-pressed={scope === "all"}
                  onClick={() => onScope("all")}
                  className="text-xs"
                >
                  All {total}
                </button>
              </div>
              {credits !== null ? (
                <p className={`tnum text-xs ${outOfCredits ? "text-coral" : "text-dim"}`}>
                  {credits} left today
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <RecipeSummary recipe={recipe} />
            </div>
            <button
              type="button"
              onClick={onRender}
              className="btn-primary shrink-0 px-5 py-3 text-sm"
            >
              {total === 0 ? "Add photos" : count > 1 ? `Render ${count}` : "Render"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
