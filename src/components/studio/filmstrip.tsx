"use client";

import {
  AlertCircle,
  Check,
  Clock3,
  Download,
  Flag,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { recipeLabel } from "@/lib/catalog";
import { Spinner } from "./bits";
import {
  activeVersion,
  downloadHref,
  downloadName,
  shotStatus,
  type Shot,
  type Version,
  type VersionStatus,
  type ViewMode,
} from "./types";

/* -------------------------------------------------------------------------- */
/* the row under the viewer: this photo's renders and what to do with them     */
/* -------------------------------------------------------------------------- */

const VIEW_LABELS: Record<ViewMode, string> = {
  original: "Original",
  compare: "Compare",
  result: "Render",
};

export function VersionBar({
  shot,
  shotIndex,
  total,
  viewMode,
  onViewMode,
  onPickVersion,
  onReport,
}: {
  shot: Shot;
  shotIndex: number;
  total: number;
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
  onPickVersion: (versionId: string) => void;
  onReport: (version: Version) => void;
}) {
  const active = activeVersion(shot);
  const finished = active?.status === "done" && active.url ? active : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 max-w-full items-center gap-3">
        <p className="flex shrink-0 items-baseline gap-2 text-xs">
          <span className="tnum text-haze">
            Photo {shotIndex + 1} of {total}
          </span>
          <span className="max-w-[9rem] truncate text-dim" title={shot.name}>
            {shot.name}
          </span>
        </p>
        {shot.versions.length ? (
          <div
            role="group"
            aria-label="Renders of this photo"
            className="thin-scroll -my-1 flex min-w-0 gap-1.5 overflow-x-auto py-1"
          >
            {shot.versions.map((version) => (
              <button
                key={version.id}
                type="button"
                aria-pressed={version.id === shot.activeVersionId}
                onClick={() => onPickVersion(version.id)}
                className="chip shrink-0 px-2.5 py-1 text-xs"
              >
                <StatusIcon status={version.status} />
                {recipeLabel(version.recipe)}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-xs text-dim">No renders yet</span>
        )}
      </div>

      {finished ? (
        <div className="flex items-center gap-2">
          <div className="seg" role="group" aria-label="View">
            {(Object.keys(VIEW_LABELS) as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={viewMode === mode}
                onClick={() => onViewMode(mode)}
                className="text-xs"
              >
                {VIEW_LABELS[mode]}
              </button>
            ))}
          </div>
          <a
            href={downloadHref(finished.url as string, downloadName(shotIndex, finished))}
            download={downloadName(shotIndex, finished)}
            className="btn px-3 py-[0.4375rem] text-xs"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
          <button
            type="button"
            onClick={() => onReport(finished)}
            className="btn-ghost grid h-8 w-8 place-items-center"
            aria-label="Report a problem with this render"
            title="Report a problem with this render"
          >
            <Flag className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* filmstrip                                                                   */
/* -------------------------------------------------------------------------- */

export function Filmstrip({
  shots,
  selectedId,
  maxShots,
  locked,
  finishedCount,
  onSelect,
  onRemove,
  onAdd,
  onDownloadAll,
  onClear,
}: {
  shots: Shot[];
  selectedId: string | null;
  maxShots: number;
  /** True while a batch runs: photos can't be removed mid-render. */
  locked: boolean;
  finishedCount: number;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  onDownloadAll: () => void;
  onClear: () => void;
}) {
  return (
    <section aria-labelledby="photos-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="photos-heading" className="text-sm font-semibold text-pearl">
          Photos{" "}
          <span className="tnum font-normal text-dim">
            {shots.length} of {maxShots}
          </span>
        </h2>
        <div className="flex items-center gap-1">
          {finishedCount ? (
            <button
              type="button"
              onClick={onDownloadAll}
              className="btn-ghost px-2.5 py-1.5 text-xs"
            >
              <Download className="h-3.5 w-3.5" />
              Download all ({finishedCount})
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClear}
            disabled={locked}
            className="btn-ghost px-2.5 py-1.5 text-xs"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>
        </div>
      </div>

      <ol className="thin-scroll mt-2 flex gap-3 overflow-x-auto pb-1.5 pr-2 pt-2.5">
        {shots.map((shot, index) => (
          <FilmTile
            key={shot.id}
            shot={shot}
            index={index}
            selected={shot.id === selectedId}
            locked={locked}
            onSelect={() => onSelect(shot.id)}
            onRemove={() => onRemove(shot.id)}
          />
        ))}
        {shots.length < maxShots ? (
          <li className="shrink-0">
            <button
              type="button"
              onClick={onAdd}
              className="flex h-[4.5rem] w-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-rim-strong text-haze transition-colors hover:border-reef/60 hover:text-pearl"
            >
              <Plus className="h-4 w-4" />
              <span className="text-[0.6875rem] font-medium">Add photos</span>
            </button>
          </li>
        ) : null}
      </ol>

      {finishedCount ? (
        <p className="mt-2 text-xs text-dim">
          Renders are kept for about an hour. Download the ones you want to keep.
        </p>
      ) : null}
    </section>
  );
}

const STATUS_TEXT: Record<VersionStatus | "idle", string> = {
  idle: "not rendered yet",
  queued: "queued",
  working: "rendering",
  done: "rendered",
  error: "render failed",
};

function FilmTile({
  shot,
  index,
  selected,
  locked,
  onSelect,
  onRemove,
}: {
  shot: Shot;
  index: number;
  selected: boolean;
  locked: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const status = shotStatus(shot);
  const active = activeVersion(shot);
  const thumb = active?.status === "done" && active.url ? active.url : shot.dataUrl;
  const waiting = status === "working" || status === "queued";

  return (
    <li className="group relative shrink-0">
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        aria-label={`Photo ${index + 1}, ${STATUS_TEXT[status]}`}
        className={`relative block h-[4.5rem] w-24 overflow-hidden rounded-lg border-2 transition-[border-color,box-shadow] ${
          selected
            ? "border-reef shadow-[0_0_18px_rgba(25,191,211,0.25)]"
            : "border-transparent hover:border-rim-strong"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb}
          alt=""
          draggable={false}
          className={`h-full w-full object-cover transition-[filter] ${waiting ? "brightness-[0.55]" : ""}`}
        />
        <span className="tnum absolute left-1 top-1 rounded bg-void/80 px-1.5 text-[0.6875rem] font-semibold leading-[1.125rem] text-pearl">
          {index + 1}
        </span>
        {status !== "idle" ? (
          <span className="absolute bottom-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-void/85">
            <StatusIcon status={status} />
          </span>
        ) : null}
      </button>
      {!locked ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove photo ${index + 1}`}
          className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full border border-rim-strong bg-trench text-haze shadow-lift transition hover:text-pearl focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </li>
  );
}

export function StatusIcon({ status }: { status: VersionStatus }) {
  switch (status) {
    case "working":
      return <Spinner className="h-3 w-3" />;
    case "queued":
      return <Clock3 aria-hidden="true" className="h-3 w-3 text-haze" />;
    case "done":
      return <Check aria-hidden="true" className="h-3 w-3 text-seaglass" strokeWidth={3} />;
    case "error":
      return <AlertCircle aria-hidden="true" className="h-3 w-3 text-coral" />;
  }
}
