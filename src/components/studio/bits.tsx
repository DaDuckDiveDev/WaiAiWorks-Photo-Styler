"use client";

import { useEffect, useState } from "react";
import type { FinishId } from "@/lib/catalog";
import { formatElapsed } from "./types";

// Spelled out in full so Tailwind's class scanner keeps every swatch style.
const SWATCH_CLASSES: Record<FinishId, string> = {
  photo: "swatch-photo",
  anime: "swatch-anime",
  pixar: "swatch-pixar",
  comic: "swatch-comic",
  disney: "swatch-disney",
};

/** A CSS-drawn preview of a finish, so each look reads before you pick it. */
export function Swatch({ finish, className = "" }: { finish: FinishId; className?: string }) {
  return (
    <span aria-hidden="true" className={`swatch ${SWATCH_CLASSES[finish]} block ${className}`} />
  );
}

/** Live m:ss counter. Ticks on its own so the rest of the studio stays still. */
export function Elapsed({ since, until }: { since: number; until?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [until]);
  return <span className="tnum">{formatElapsed((until ?? now) - since)}</span>;
}

/** Seconds since `since`, re-evaluated every second. */
export function useSecondsSince(since: number | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);
  return since ? Math.max(0, Math.floor((now - since) / 1000)) : 0;
}

export function Spinner({
  className = "h-3.5 w-3.5",
  tone = "reef",
}: {
  className?: string;
  /** "ink" for use on the light primary button. */
  tone?: "reef" | "ink";
}) {
  const colors = tone === "ink" ? "border-void/25 border-t-void" : "border-reef/25 border-t-reef";
  return (
    <span
      aria-hidden="true"
      className={`ring-spin inline-block shrink-0 rounded-full border-2 ${colors} ${className}`}
    />
  );
}

/** ⌘ on Apple devices, Ctrl elsewhere. Resolved after mount to match SSR. */
export function useModKey(): string {
  const [key, setKey] = useState("Ctrl");
  useEffect(() => {
    const platform =
      (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
        ?.platform ?? navigator.platform;
    if (/mac|iphone|ipad/i.test(platform)) setKey("⌘");
  }, []);
  return key;
}
