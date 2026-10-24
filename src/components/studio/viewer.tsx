"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, ChevronsLeftRight, Flag, ImagePlus, RotateCcw } from "lucide-react";
import { recipeLabel } from "@/lib/catalog";
import { Elapsed, Spinner, useSecondsSince } from "./bits";
import type { Shot, Version, ViewMode } from "./types";

/*
 * The photo is sized by its own height cap; everything else wraps around it.
 * The minimum width only matters for tiny images (screenshots, thumbnails),
 * which would otherwise be too small to hold the status overlays.
 */
const PHOTO_SIZE = "max-h-[56vh] min-w-[16rem] lg:max-h-[calc(100vh-22rem)]";

export function Viewer({
  shot,
  version,
  viewMode,
  dragging,
  modKey,
  onChoose,
  onRetry,
  onReport,
  retryDisabled,
}: {
  shot: Shot | null;
  version: Version | null;
  viewMode: ViewMode;
  dragging: boolean;
  modKey: string;
  onChoose: () => void;
  onRetry: (version: Version) => void;
  onReport: (version: Version) => void;
  retryDisabled: boolean;
}) {
  return (
    <div
      className={`relative flex flex-1 items-center justify-center overflow-hidden rounded-2xl border border-rim bg-[#03080f] px-5 sm:px-10 lg:min-h-[24rem] lg:py-10 ${
        shot ? "py-8" : "min-h-[52vh] py-10"
      }`}
    >
      {shot ? (
        <Frame
          shot={shot}
          version={version}
          viewMode={viewMode}
          dragging={dragging}
          onRetry={onRetry}
          onReport={onReport}
          retryDisabled={retryDisabled}
        />
      ) : (
        <EmptyState dragging={dragging} modKey={modKey} onChoose={onChoose} />
      )}
    </div>
  );
}

function EmptyState({
  dragging,
  modKey,
  onChoose,
}: {
  dragging: boolean;
  modKey: string;
  onChoose: () => void;
}) {
  return (
    <div className="relative w-full max-w-2xl">
      <div
        className={`thirds thirds-fade absolute inset-0 transition-opacity ${dragging ? "opacity-100" : "opacity-70"}`}
      />
      <div className={`viewfinder absolute inset-0 ${dragging ? "is-live" : ""}`} />
      <div className="relative flex flex-col items-center px-6 py-14 text-center sm:py-20">
        <span
          className={`grid h-12 w-12 place-items-center rounded-full border transition-colors ${
            dragging ? "border-reef bg-reef/15 text-reef" : "border-rim-strong bg-trench text-skyline"
          }`}
        >
          <ImagePlus className="h-5 w-5" />
        </span>
        <h2 className="wide mt-6 text-3xl font-semibold leading-[1.1] tracking-[-0.01em] sm:text-[2.6rem]">
          {dragging ? (
            "Release to add"
          ) : (
            <>
              <span className="sm:hidden">Add photos to start</span>
              <span className="hidden sm:inline">Drop photos to start</span>
            </>
          )}
        </h2>
        <p className="mt-4 max-w-sm text-[0.9375rem] leading-relaxed text-haze">
          Up to 5 photos per batch, JPG or PNG. Then pick a look or a photo fix
          and render.
        </p>
        <button type="button" onClick={onChoose} className="btn-primary mt-8 px-5 py-3 text-sm">
          Choose photos
        </button>
        <p className="mt-4 hidden text-xs text-dim sm:block">
          or paste a photo with <span className="kbd">{modKey} V</span>
        </p>
      </div>
    </div>
  );
}

function Frame({
  shot,
  version,
  viewMode,
  dragging,
  onRetry,
  onReport,
  retryDisabled,
}: {
  shot: Shot;
  version: Version | null;
  viewMode: ViewMode;
  dragging: boolean;
  onRetry: (version: Version) => void;
  onReport: (version: Version) => void;
  retryDisabled: boolean;
}) {
  const status = version?.status;
  const waiting = status === "working" || status === "queued";
  const finished = status === "done" && version?.url ? version : null;

  return (
    <figure className="relative m-0 inline-flex max-w-full">
      <div
        className={`viewfinder absolute -inset-3 sm:-inset-4 ${waiting || dragging ? "is-live" : ""}`}
      />

      {finished ? (
        <Compare
          key={finished.id}
          original={shot.dataUrl}
          result={finished.url as string}
          resultLabel={recipeLabel(finished.recipe)}
          name={shot.name}
          viewMode={viewMode}
          animateIn={Boolean(finished.finishedAt && Date.now() - finished.finishedAt < 2500)}
        />
      ) : (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={shot.dataUrl}
            alt={shot.name}
            draggable={false}
            className={`block w-auto max-w-full rounded-md object-contain ${PHOTO_SIZE} ${waiting ? "developing" : ""}`}
          />
          {waiting ? (
            <div className="absolute inset-0 overflow-hidden rounded-md">
              <div className="thirds absolute inset-0" />
              {status === "working" ? <div className="scan" /> : null}
            </div>
          ) : null}
          <Label className="left-3 top-3">
            {waiting && version ? recipeLabel(version.recipe) : "Original"}
          </Label>
        </div>
      )}

      {status === "working" && version ? <WorkingHud version={version} /> : null}

      {status === "queued" ? (
        <Hud>
          <span className="h-2 w-2 shrink-0 rounded-full bg-haze" />
          <span className="font-semibold">Queued</span>
          <span className="text-haze">Photos render one at a time.</span>
        </Hud>
      ) : null}

      {status === "error" && version ? (
        <div
          role="alert"
          className="absolute inset-x-3 bottom-3 rounded-lg border border-coral/40 bg-void/90 p-3 backdrop-blur-md sm:right-auto sm:max-w-sm"
        >
          <p className="flex items-start gap-2 text-sm text-coral">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{version.error ?? "The render failed."}</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2 pl-6">
            <button
              type="button"
              onClick={() => onRetry(version)}
              disabled={retryDisabled}
              className="btn px-3 py-1.5 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Try again
            </button>
            <button
              type="button"
              onClick={() => onReport(version)}
              className="btn-ghost px-2.5 py-1.5 text-xs"
            >
              <Flag className="h-3.5 w-3.5" />
              Report it
            </button>
          </div>
        </div>
      ) : null}
    </figure>
  );
}

function WorkingHud({ version }: { version: Version }) {
  const seconds = useSecondsSince(version.startedAt);
  return (
    <Hud live>
      <Spinner />
      <span className="font-semibold">Rendering</span>
      {version.startedAt ? <Elapsed since={version.startedAt} /> : null}
      <span className="hidden min-w-0 truncate text-haze sm:inline">
        {seconds < 45
          ? "Usually under a minute."
          : "Taking longer than usual. Keep this tab open."}
      </span>
    </Hud>
  );
}

function Hud({ children, live = false }: { children: React.ReactNode; live?: boolean }) {
  return (
    <div
      aria-live={live ? "polite" : undefined}
      className="absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] items-center gap-2.5 whitespace-nowrap rounded-lg bg-void/80 px-3 py-2 text-[0.8125rem] backdrop-blur-md"
    >
      {children}
    </div>
  );
}

function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`pointer-events-none absolute max-w-[45%] truncate rounded-md bg-void/70 px-2 py-1 text-xs font-medium text-pearl backdrop-blur-md ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * Before/after wipe. The original sits underneath; the render is clipped to
 * everything right of the divider. A fresh render sweeps in from the right
 * edge and settles at the midpoint — the one bit of choreography in the app.
 */
function Compare({
  original,
  result,
  resultLabel,
  name,
  viewMode,
  animateIn,
}: {
  original: string;
  result: string;
  resultLabel: string;
  name: string;
  viewMode: ViewMode;
  animateIn: boolean;
}) {
  // Fixed at mount: a later re-render shouldn't cancel the sweep midway.
  const [sweep] = useState(animateIn);
  const [split, setSplit] = useState(sweep ? 100 : 50);
  const [settling, setSettling] = useState(sweep);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    if (!sweep) return;
    // Two frames so the starting position paints before the transition runs.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setSplit(50));
    });
    const done = setTimeout(() => setSettling(false), 1300);
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      clearTimeout(done);
    };
  }, [sweep]);

  const comparing = viewMode === "compare";
  const shown = viewMode === "original" ? 100 : viewMode === "result" ? 0 : split;

  function moveTo(clientX: number) {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const percent = ((clientX - rect.left) / rect.width) * 100;
    setSplit(Math.min(100, Math.max(0, percent)));
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const step = event.shiftKey ? 10 : 4;
    const moves: Record<string, number> = {
      ArrowLeft: split - step,
      ArrowRight: split + step,
      Home: 0,
      End: 100,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    setSettling(false);
    setSplit(Math.min(100, Math.max(0, moves[event.key])));
  }

  return (
    <div
      ref={frameRef}
      className={`compare ${settling ? "is-settling" : ""} ${comparing ? "cursor-ew-resize" : ""}`}
      style={{ "--split": `${shown}%` } as React.CSSProperties}
      onPointerDown={(event) => {
        if (!comparing || event.button !== 0) return;
        dragging.current = true;
        setSettling(false);
        event.currentTarget.setPointerCapture(event.pointerId);
        moveTo(event.clientX);
      }}
      onPointerMove={(event) => {
        if (dragging.current) moveTo(event.clientX);
      }}
      onPointerUp={(event) => {
        dragging.current = false;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={original}
        alt={`${name}, original`}
        draggable={false}
        className={`block w-auto max-w-full rounded-md object-contain ${PHOTO_SIZE} ${
          viewMode === "result" ? "invisible" : ""
        }`}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={result}
        alt={`${name}, ${resultLabel} render`}
        draggable={false}
        // The model can return a slightly different aspect ratio. Compare lines
        // the two up; the Render view shows the whole render, uncropped.
        className={`compare-result rounded-md ${viewMode === "result" ? "compare-result-whole" : ""}`}
      />

      {comparing ? (
        <>
          <div className="compare-line" />
          <div
            role="slider"
            tabIndex={0}
            aria-label="Divider between the original and the render"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(split)}
            aria-valuetext={`${Math.round(100 - split)} percent of the render showing`}
            onKeyDown={onKeyDown}
            className="compare-knob"
          >
            <ChevronsLeftRight className="h-4 w-4" />
          </div>
        </>
      ) : null}

      {viewMode !== "result" ? <Label className="left-3 top-3">Original</Label> : null}
      {viewMode !== "original" ? <Label className="right-3 top-3">{resultLabel}</Label> : null}
    </div>
  );
}
