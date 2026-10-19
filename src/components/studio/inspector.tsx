"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Eye, Focus, ScanEye, type LucideIcon } from "lucide-react";
import {
  FINISHES,
  FIXES,
  LOOKS,
  finishLabel,
  getFix,
  type FixId,
  type Recipe,
} from "@/lib/catalog";
import { Elapsed, Spinner, Swatch } from "./bits";
import type { Batch, Scope } from "./types";

const FIX_ICONS: Record<FixId, LucideIcon> = {
  "open-eyes": Eye,
  "eye-contact": Focus,
  "eyes-both": ScanEye,
};

/* -------------------------------------------------------------------------- */
/* looks and fixes                                                             */
/* -------------------------------------------------------------------------- */

/** One line under the grid describing the chosen look, so the cards stay compact. */
function lookBlurb(recipe: Recipe): string {
  if (recipe.fix) return "";
  const look = LOOKS.find((item) => item.id === recipe.finish);
  return look ? `${look.label}: ${look.blurb}` : "";
}

export function RecipePicker({
  recipe,
  onRecipe,
  expandedFix,
  onExpandFix,
}: {
  recipe: Recipe;
  onRecipe: (recipe: Recipe) => void;
  expandedFix: FixId | null;
  onExpandFix: (fix: FixId | null) => void;
}) {
  return (
    <div className="space-y-8">
      <section aria-labelledby="look-heading">
        <h2 id="look-heading" className="text-sm font-semibold text-pearl">
          Look
        </h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {LOOKS.map((look) => {
            const selected = recipe.fix === null && recipe.finish === look.id;
            return (
              <button
                key={look.id}
                type="button"
                aria-pressed={selected}
                title={look.blurb}
                onClick={() => onRecipe({ finish: look.id, fix: null })}
                className={`rounded-xl border p-1 text-left transition-[border-color,background-color,box-shadow] duration-200 ${
                  selected
                    ? "border-reef bg-reef/[0.07] shadow-glow"
                    : "border-rim bg-trench/50 hover:border-rim-strong hover:bg-trench"
                }`}
              >
                <span className="relative block">
                  <Swatch finish={look.id} className="h-11 w-full" />
                  {selected ? (
                    <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-reef text-void">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                  ) : null}
                </span>
                <span className="mt-1.5 block px-1 pb-1 text-[0.8125rem] font-semibold leading-tight text-pearl">
                  {look.label}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2.5 min-h-[1rem] text-xs leading-snug text-haze">{lookBlurb(recipe)}</p>
      </section>

      <section aria-labelledby="fix-heading">
        <h2 id="fix-heading" className="text-sm font-semibold text-pearl">
          Photo fixes
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-haze">
          Fix the eyes, then keep it a photo or give it a look.
        </p>
        <ul className="mt-3 overflow-hidden rounded-xl border border-rim bg-trench/30">
          {FIXES.map((fix, index) => {
            const Icon = FIX_ICONS[fix.id];
            const expanded = expandedFix === fix.id;
            const active = recipe.fix === fix.id;
            return (
              <li key={fix.id} className={index > 0 ? "border-t border-rim" : ""}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={`fix-${fix.id}`}
                  onClick={() => onExpandFix(expanded ? null : fix.id)}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-trench/70"
                >
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border transition-colors ${
                      active
                        ? "border-reef bg-reef/15 text-reef"
                        : "border-rim-strong bg-void/40 text-haze"
                    }`}
                  >
                    <Icon className="h-[1.125rem] w-[1.125rem]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-pearl">{fix.label}</span>
                    <span className="block truncate text-xs text-haze">{fix.blurb}</span>
                  </span>
                  {active ? (
                    <span className="shrink-0 rounded-full bg-reef/15 px-2 py-0.5 text-[0.6875rem] font-semibold text-reef">
                      {finishLabel(recipe.finish)}
                    </span>
                  ) : null}
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-dim transition-transform duration-200 ${
                      expanded ? "rotate-180" : ""
                    }`}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {expanded ? (
                    <motion.div
                      id={`fix-${fix.id}`}
                      key="finishes"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="pb-4 pl-[3.75rem] pr-3">
                        <p id={`fix-${fix.id}-label`} className="text-xs text-dim">
                          Render as
                        </p>
                        <div
                          role="group"
                          aria-labelledby={`fix-${fix.id}-label`}
                          className="mt-2 flex flex-wrap gap-1.5"
                        >
                          {FINISHES.map((finish) => (
                            <button
                              key={finish.id}
                              type="button"
                              aria-pressed={active && recipe.finish === finish.id}
                              onClick={() => onRecipe({ finish: finish.id, fix: fix.id })}
                              className="chip py-1 pl-1 pr-2.5 text-xs"
                            >
                              <Swatch finish={finish.id} className="h-4 w-4 rounded-full" />
                              {finish.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* render controls                                                             */
/* -------------------------------------------------------------------------- */

export function RecipeSummary({
  recipe,
  compact = false,
}: {
  recipe: Recipe;
  /** One line, for the desktop panel where the picker is right above it. */
  compact?: boolean;
}) {
  const fix = recipe.fix ? getFix(recipe.fix) : null;
  const FixIcon = fix ? FIX_ICONS[fix.id] : null;

  if (compact) {
    return (
      <p className="flex min-w-0 items-center gap-2.5 text-sm">
        <Swatch finish={recipe.finish} className="h-5 w-5 shrink-0 rounded-[0.3rem]" />
        <span className="truncate">
          <span className="font-semibold text-pearl">{finishLabel(recipe.finish)}</span>
          {fix ? <span className="text-haze">, {fix.outcome}</span> : null}
        </span>
      </p>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      <Swatch finish={recipe.finish} className="h-9 w-12 shrink-0 rounded-md" />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-pearl">
          {recipe.finish === "photo" ? "Photo retouch" : finishLabel(recipe.finish)}
        </p>
        <p className="flex items-center gap-1.5 truncate text-xs text-haze">
          {fix && FixIcon ? (
            <>
              <FixIcon className="h-3.5 w-3.5 shrink-0 text-reef" />
              {fix.label}
            </>
          ) : (
            "No photo fix"
          )}
        </p>
      </div>
    </div>
  );
}

export function renderButtonLabel(count: number, scope: Scope, total: number): string {
  if (total <= 1 || scope === "one") return "Render this photo";
  return `Render all ${count} photos`;
}

export function costLine(count: number, credits: number | null): string | null {
  if (credits === null) return null;
  if (credits <= 0) return "No renders left today. They reset at midnight UTC.";
  if (credits < count) {
    return `${credits} ${credits === 1 ? "render" : "renders"} left today, so this batch stops early.`;
  }
  return `Uses ${count} of your ${credits} renders left today.`;
}

export function RenderControls({
  total,
  scope,
  onScope,
  recipe,
  credits,
  batch,
  modKey,
  onRender,
  onStop,
}: {
  total: number;
  scope: Scope;
  onScope: (scope: Scope) => void;
  recipe: Recipe;
  credits: number | null;
  batch: Batch | null;
  modKey: string;
  onRender: () => void | Promise<void>;
  onStop: () => void;
}) {
  const count = scope === "one" || total <= 1 ? Math.min(total, 1) : total;
  const outOfCredits = credits !== null && credits <= 0;

  if (batch) return <BatchProgress batch={batch} onStop={onStop} />;

  return (
    <div className="space-y-4">
      <RecipeSummary recipe={recipe} compact />

      {total > 1 ? (
        <div className="seg w-full" role="group" aria-label="Photos to render">
          <button
            type="button"
            aria-pressed={scope === "one"}
            onClick={() => onScope("one")}
            className="flex-1 text-xs"
          >
            This photo
          </button>
          <button
            type="button"
            aria-pressed={scope === "all"}
            onClick={() => onScope("all")}
            className="flex-1 text-xs"
          >
            All {total} photos
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => void onRender()}
        className="btn-primary w-full px-5 py-3.5 text-[0.9375rem]"
      >
        {total === 0 ? "Add photos" : renderButtonLabel(count, scope, total)}
        {total > 0 ? <span className="kbd hidden lg:inline-flex">{modKey} ↵</span> : null}
      </button>

      {total > 0 ? (
        <p className={`text-xs leading-relaxed ${outOfCredits ? "text-coral" : "text-dim"}`}>
          {costLine(count, credits) ?? "Renders run one photo at a time."}
        </p>
      ) : null}
    </div>
  );
}

function BatchProgress({ batch, onStop }: { batch: Batch; onStop: () => void }) {
  const total = batch.jobs.length;
  const current = Math.min(batch.done + 1, total);
  return (
    <div className="space-y-4" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2.5 text-sm font-semibold text-pearl">
          <Spinner />
          {total === 1 ? "Rendering 1 photo" : `Rendering photo ${current} of ${total}`}
        </p>
        <p className="text-xs text-haze">
          <Elapsed since={batch.startedAt} />
        </p>
      </div>

      <div className="flex gap-1" aria-hidden="true">
        {batch.jobs.map((job, index) => (
          <span
            key={job.versionId}
            className={`h-1.5 flex-1 rounded-full ${
              index < batch.done
                ? "bg-seaglass"
                : index === batch.done
                  ? "segment-live"
                  : "bg-shelf"
            }`}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={onStop}
        disabled={batch.stopping || current === total}
        className="btn w-full px-4 py-2.5 text-sm"
      >
        {batch.stopping ? "Stopping after this photo" : "Stop after this photo"}
      </button>
      <p className="text-xs leading-relaxed text-dim">
        A render already in progress always finishes. Keep this tab open until
        the batch is done.
      </p>
    </div>
  );
}
