"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Callers pass inline arrows, so read the latest one through a ref. Keying
  // the effect on it would re-run focus handling on every parent render and
  // pull focus out of whatever field the user is typing in.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    // Move focus into the dialog and hand it back to whatever opened it.
    const opener = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => dialogRef.current?.focus({ preventScroll: true }));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      opener?.focus?.({ preventScroll: true });
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          // Flex with an auto-margin child: centered when it fits, and when it
          // doesn't, it starts at the top and scrolls instead of being clipped.
          className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-void/75 px-4 py-10 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            initial={{ opacity: 0, y: 16, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="panel my-auto h-fit w-full max-w-xl rounded-2xl p-6 shadow-lift outline-none sm:p-8"
          >
            <div className="flex items-start justify-between gap-6">
              <h2 className="wide text-xl font-semibold text-pearl">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="btn-ghost -mr-2 -mt-1 grid h-9 w-9 shrink-0 place-items-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5">{children}</div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
