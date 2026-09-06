"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  Check,
  Download,
  ImagePlus,
  LifeBuoy,
  Loader2,
  LogOut,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { LogoMark } from "@/components/logo-mark";
import { Modal } from "@/components/modal";
import { STYLE_PRESETS, type StyleId } from "@/lib/styles";
import { prepareImage, type PreparedImage } from "@/lib/image";

const MAX_IMAGES = 5;

type RenderState =
  | { status: "idle" }
  | { status: "working" }
  | { status: "done"; url: string; style: StyleId }
  | { status: "error"; message: string };

type Shot = PreparedImage & { render: RenderState };

export function Studio({
  username,
  credits: initialCredits,
  admin,
}: {
  username: string;
  /** Null when usage tracking is off, in which case renders are unmetered. */
  credits: number | null;
  admin: boolean;
}) {
  const [credits, setCredits] = useState<number | null>(initialCredits);
  const [shots, setShots] = useState<Shot[]>([]);
  const [style, setStyle] = useState<StyleId>("anime");
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState<null | "support" | "report">(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList?.length) return;
      setNotice(null);

      const incoming = Array.from(fileList).filter((file) =>
        file.type.startsWith("image/")
      );
      if (!incoming.length) {
        setNotice("Those files aren't images.");
        return;
      }

      const room = MAX_IMAGES - shots.length;
      if (room <= 0) {
        setNotice(`You can work on ${MAX_IMAGES} photos at a time.`);
        return;
      }
      if (incoming.length > room) {
        setNotice(`Only the first ${room} were added — ${MAX_IMAGES} photos max per batch.`);
      }

      const prepared = await Promise.all(
        incoming.slice(0, room).map(async (file) => {
          const image = await prepareImage(file);
          return { ...image, render: { status: "idle" } as RenderState };
        })
      );
      setShots((current) => [...current, ...prepared]);
    },
    [shots.length]
  );

  function removeShot(id: string) {
    setShots((current) => current.filter((shot) => shot.id !== id));
  }

  function clearAll() {
    setShots([]);
    setNotice(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  type RenderOutcome = "done" | "failed" | "exhausted";

  async function renderOne(shot: Shot, chosen: StyleId): Promise<RenderOutcome> {
    setShots((current) =>
      current.map((item) =>
        item.id === shot.id ? { ...item, render: { status: "working" } } : item
      )
    );

    try {
      const response = await fetch("/api/stylize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: shot.dataUrl, style: chosen }),
      });
      const data = await response.json();

      // The server is the source of truth on the balance, including refunds.
      if (typeof data.credits === "number") setCredits(data.credits);

      if (!response.ok) {
        const message = data.error ?? "Render failed.";
        setShots((current) =>
          current.map((item) =>
            item.id === shot.id ? { ...item, render: { status: "error", message } } : item
          )
        );
        // 402 is the daily allowance running out; 429 is the burst guard.
        return response.status === 402 || response.status === 429
          ? "exhausted"
          : "failed";
      }

      setShots((current) =>
        current.map((item) =>
          item.id === shot.id
            ? { ...item, render: { status: "done", url: data.url, style: chosen } }
            : item
        )
      );
      return "done";
    } catch (error) {
      const message = error instanceof Error ? error.message : "Render failed.";
      setShots((current) =>
        current.map((item) =>
          item.id === shot.id ? { ...item, render: { status: "error", message } } : item
        )
      );
      return "failed";
    }
  }

  async function renderAll() {
    if (!shots.length || running) return;
    setRunning(true);
    setNotice(null);

    // Sequential on purpose: keeps Replicate concurrency predictable and lets
    // each result land in the grid as it finishes.
    for (const shot of shots) {
      const outcome = await renderOne(shot, style);
      if (outcome === "exhausted") {
        // No point burning through the rest of the batch to collect the same
        // error five times over.
        setNotice("Stopped early — you're out of renders for now.");
        break;
      }
    }
    setRunning(false);
  }

  const finished = shots.filter(
    (shot): shot is Shot & { render: Extract<RenderState, { status: "done" }> } =>
      shot.render.status === "done"
  );

  function downloadAll() {
    finished.forEach((shot, index) => {
      setTimeout(() => {
        const link = document.createElement("a");
        link.href = downloadHref(shot.render.url, shot.render.style, index);
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }, index * 700);
    });
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-24 pt-8 sm:px-8">
      <header className="glass-card flex flex-wrap items-center justify-between gap-4 px-6 py-5">
        <div className="relative z-[2] flex items-center gap-4">
          <LogoMark />
          <span className="hidden h-8 w-px bg-pacific/10 sm:block" />
          <p className="hidden text-sm text-pacific/70 sm:block">
            Signed in as <span className="font-semibold text-pacific">{username}</span>
          </p>
        </div>

        <div className="relative z-[2] flex items-center gap-2">
          {credits !== null ? (
            <span
              title="Renders remaining today. Resets at midnight UTC."
              className={`hidden items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold sm:flex ${
                credits <= 3
                  ? "border-coral/40 bg-coral/10 text-coral"
                  : "border-white/60 bg-white/40 text-pacific/75"
              }`}
            >
              <Sparkles className="h-4 w-4" />
              <span className="tabular-nums">{credits}</span>
              <span className="font-normal opacity-70">left today</span>
            </span>
          ) : null}
          {admin ? (
            <Link
              href="/admin/stats"
              className="glass-btn flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
            >
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Usage</span>
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="glass-btn flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
          >
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">How to use</span>
          </button>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="glass-btn flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </form>
        </div>
      </header>

      <section className="mt-10">
        <h1 className="font-display text-4xl font-semibold leading-[1.1] sm:text-5xl">
          <span className="liquid-text">Turn photos into artwork</span>
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-pacific/70">
          Drop in up to {MAX_IMAGES} photos, choose a look, and the studio renders
          each one. Originals stay on the left, finished art appears on the right.
        </p>
      </section>

      {/* ---- 1. photos ---- */}
      <section className="mt-10">
        <StepLabel step="01" title="Add photos" />

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void addFiles(event.dataTransfer.files);
          }}
          className={`glass-card mt-4 grid place-items-center px-6 py-12 text-center transition ${
            dragging ? "ring-2 ring-skyline/60" : ""
          }`}
        >
          <div className="relative z-[2]">
            <div className="float-y mx-auto grid h-14 w-14 place-items-center rounded-full border border-white/70 bg-white/40 shadow-glass backdrop-blur-xl">
              <ImagePlus className="h-6 w-6 text-ocean" />
            </div>
            <p className="mt-5 text-sm text-pacific/70">
              Drag photos here, or pick them from your device
            </p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="glass-btn mt-5 rounded-xl px-5 py-3 text-sm font-semibold"
            >
              Choose images
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(event) => void addFiles(event.target.files)}
            />
            <p className="mt-4 text-xs text-pacific/45">
              JPG, PNG, HEIC · up to {MAX_IMAGES} at a time
            </p>
          </div>
        </div>

        <AnimatePresence>
          {notice ? (
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 flex items-center gap-2 rounded-xl border border-skyline/40 bg-glacier/60 px-4 py-3 text-sm text-ocean"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              {notice}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </section>

      {/* ---- 2. style ---- */}
      <section className="mt-12">
        <StepLabel step="02" title="Choose a style" />

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STYLE_PRESETS.map((preset) => {
            const active = preset.id === style;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setStyle(preset.id)}
                aria-pressed={active}
                className={`glass-card p-5 text-left transition ${
                  active ? "ring-2 ring-skyline/70" : "hover:-translate-y-0.5"
                }`}
              >
                <span className="relative z-[2] block">
                  <span className="flex items-center justify-between">
                    <span className="font-display text-lg font-semibold text-pacific">
                      {preset.label}
                    </span>
                    {active ? (
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-ocean text-white">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-2 block text-sm leading-relaxed text-pacific/65">
                    {preset.blurb}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ---- 3. render ---- */}
      <section className="mt-12">
        <StepLabel step="03" title="Render" />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={renderAll}
            disabled={!shots.length || running}
            className="glass-btn-primary flex items-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {running
              ? "Rendering"
              : `Stylize ${shots.length || ""} ${shots.length === 1 ? "photo" : "photos"}`.trim()}
          </button>

          {finished.length ? (
            <button
              type="button"
              onClick={downloadAll}
              className="glass-btn flex items-center gap-2 rounded-xl px-5 py-3.5 text-sm font-semibold"
            >
              <Download className="h-4 w-4" />
              Download all ({finished.length})
            </button>
          ) : null}

          {shots.length ? (
            <button
              type="button"
              onClick={clearAll}
              disabled={running}
              className="glass-btn flex items-center gap-2 rounded-xl px-5 py-3.5 text-sm font-semibold disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Clear
            </button>
          ) : null}
        </div>

        {finished.length ? (
          <p className="mt-4 text-xs text-pacific/50">
            Finished renders are served from Replicate and expire after about an
            hour. Download anything you want to keep before you close the tab.
          </p>
        ) : null}

        <div className="mt-6 space-y-5">
          <AnimatePresence initial={false}>
            {shots.map((shot) => (
              <motion.article
                key={shot.id}
                layout
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="glass-card p-5"
              >
                <div className="relative z-[2] grid gap-5 md:grid-cols-2">
                  <Pane label="Original">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={shot.dataUrl}
                      alt={shot.name}
                      className="h-full w-full rounded-2xl object-cover"
                    />
                  </Pane>

                  <Pane label={styleLabel(shot.render, style)}>
                    <RenderPane
                      shot={shot}
                      onRetry={() => void renderOne(shot, style)}
                      busy={running}
                    />
                  </Pane>
                </div>

                <div className="relative z-[2] mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="truncate text-xs text-pacific/50">
                    {shot.name} · {shot.width}×{shot.height}
                  </p>
                  <div className="flex items-center gap-2">
                    {shot.render.status === "done" ? (
                      <a
                        href={downloadHref(shot.render.url, shot.render.style, 0)}
                        className="glass-btn flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => removeShot(shot.id)}
                      disabled={running}
                      className="glass-btn flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  </div>
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
        </div>
      </section>

      {/* ---- floating support ---- */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setSupportOpen("report")}
          className="glass-btn flex items-center gap-2 rounded-full px-4 py-3 text-xs font-semibold shadow-lift"
        >
          <AlertCircle className="h-4 w-4" />
          Report issue
        </button>
        <button
          type="button"
          onClick={() => setSupportOpen("support")}
          className="glass-btn flex items-center gap-2 rounded-full px-4 py-3 text-xs font-semibold shadow-lift"
        >
          <LifeBuoy className="h-4 w-4" />
          Support
        </button>
      </div>

      <HelpModal
        open={helpOpen}
        credits={credits}
        onClose={() => setHelpOpen(false)}
      />
      <SupportModal
        kind={supportOpen}
        username={username}
        onClose={() => setSupportOpen(null)}
      />
    </main>
  );
}

/* ---------- pieces ---------- */

function StepLabel({ step, title }: { step: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="glass-pill rounded-full px-3 py-1 text-xs font-semibold tracking-[0.16em] text-ocean">
        {step}
      </span>
      <h2 className="font-display text-xl font-semibold text-pacific">{title}</h2>
    </div>
  );
}

function Pane({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-pacific/50">
        {label}
      </p>
      <div className="aspect-[4/5] overflow-hidden rounded-2xl border border-white/60 bg-white/30 sm:aspect-[4/3]">
        {children}
      </div>
    </div>
  );
}

function RenderPane({
  shot,
  onRetry,
  busy,
}: {
  shot: Shot;
  onRetry: () => void;
  busy: boolean;
}) {
  if (shot.render.status === "done") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={shot.render.url}
        alt={`Stylized ${shot.name}`}
        className="h-full w-full object-cover"
      />
    );
  }

  if (shot.render.status === "working") {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div>
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-ocean" />
          <RenderProgress />
        </div>
      </div>
    );
  }

  if (shot.render.status === "error") {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div>
          <AlertCircle className="mx-auto h-6 w-6 text-coral" />
          <p className="mt-3 text-sm text-coral">{shot.render.message}</p>
          <button
            type="button"
            onClick={onRetry}
            disabled={busy}
            className="glass-btn mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <p className="text-sm text-pacific/45">Waiting to render</p>
    </div>
  );
}

function HelpModal({
  open,
  credits,
  onClose,
}: {
  open: boolean;
  credits: number | null;
  onClose: () => void;
}) {
  return (
    <Modal open={open} title="How to use the studio" onClose={onClose}>
      <div className="space-y-6 text-sm leading-relaxed text-pacific/75">
        <div>
          <h3 className="font-display text-base font-semibold text-pacific">The flow</h3>
          <p className="mt-2">
            Add up to five photos, pick a style, and hit stylize. Renders run one
            after another and land in the grid as they finish — you can download
            each one individually or grab the whole batch at the end.
          </p>
        </div>

        {credits !== null ? (
          <div>
            <h3 className="font-display text-base font-semibold text-pacific">
              Your daily renders
            </h3>
            <p className="mt-2">
              Each account gets a fixed number of renders per day, shown in the
              header. A render that fails doesn&apos;t cost you anything — the
              credit goes straight back. The allowance resets at midnight UTC.
            </p>
          </div>
        ) : null}

        <div>
          <h3 className="font-display text-base font-semibold text-pacific">
            What renders well
          </h3>
          <p className="mt-2">
            Sharp, well-lit photos where faces fill a good part of the frame. Everyone
            looking toward the camera gives the cleanest results — side profiles and
            closed eyes raise the odds of a bad render. Groups of six or more only work
            when the shot is tight and detailed. Vertical photos should already be
            rotated upright before you upload them.
          </p>
        </div>

        <div>
          <h3 className="font-display text-base font-semibold text-pacific">
            When something looks off
          </h3>
          <p className="mt-2">
            The model occasionally invents an extra person or softens a face. Re-run the
            same photo, switch styles, or crop tighter and try again. Roughly one render
            in twenty needs a second pass — that&apos;s normal.
          </p>
        </div>

        <div>
          <h3 className="font-display text-base font-semibold text-pacific">
            What tends to sell
          </h3>
          <p className="mt-2">
            Anime leads by a wide margin, 3D animated follows, and comic stays niche.
            Worth learning which of your photos the model likes before a big event.
          </p>
        </div>
      </div>
    </Modal>
  );
}

function SupportModal({
  kind,
  username,
  onClose,
}: {
  kind: null | "support" | "report";
  username: string;
  onClose: () => void;
}) {
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState("sending");
    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, topic: kind }),
      });
      if (!response.ok) throw new Error();
      setState("sent");
      setMessage("");
      setTimeout(() => {
        setState("idle");
        onClose();
      }, 1400);
    } catch {
      setState("error");
    }
  }

  return (
    <Modal
      open={kind !== null}
      title={kind === "report" ? "Report an issue" : "Get support"}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-pacific/65">
          Sending as <span className="font-semibold text-pacific">{username}</span>. Include
          the style and roughly when it happened if you&apos;re reporting a bad render.
        </p>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={6}
          required
          placeholder="What's going on?"
          className="glass-input w-full rounded-xl px-4 py-3 text-sm text-pacific outline-none transition placeholder:text-pacific/35 focus:ring-2 focus:ring-skyline/50"
        />
        {state === "error" ? (
          <p className="text-sm text-coral">That didn&apos;t send. Try again in a moment.</p>
        ) : null}
        <button
          type="submit"
          disabled={state === "sending" || state === "sent"}
          className="glass-btn-primary flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold disabled:opacity-60"
        >
          {state === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {state === "sent" ? <Check className="h-4 w-4" /> : null}
          {state === "sent" ? "Sent" : state === "sending" ? "Sending" : "Send message"}
        </button>
      </form>
    </Modal>
  );
}

/* ---------- helpers ---------- */

function RenderProgress() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <p className="mt-3 text-sm text-pacific/60">
      {seconds < 30
        ? `Rendering — ${seconds}s elapsed`
        : `Still waiting for your image — ${seconds}s elapsed. Some renders take a few minutes; please keep this page open.`}
    </p>
  );
}

function styleLabel(render: RenderState, fallback: StyleId): string {
  const id = render.status === "done" ? render.style : fallback;
  return STYLE_PRESETS.find((preset) => preset.id === id)?.label ?? "Stylized";
}

function downloadHref(url: string, style: StyleId, index: number): string {
  const name = `kaiel-${style}-${index + 1}.jpg`;
  return `/api/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`;
}
