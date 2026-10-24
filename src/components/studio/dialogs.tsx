"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Modal } from "@/components/modal";
import { Spinner } from "./bits";

export type SupportRequest = { kind: "support" | "report"; draft: string };

export function HelpModal({
  open,
  metered,
  modKey,
  onClose,
}: {
  open: boolean;
  metered: boolean;
  modKey: string;
  onClose: () => void;
}) {
  return (
    <Modal open={open} title="How the studio works" onClose={onClose}>
      <div className="space-y-6 text-sm leading-relaxed text-haze">
        <HelpBlock title="The flow">
          Add up to five photos, pick a look or a photo fix on the right, and
          render. Photos render one at a time. Every render is saved on its photo
          as a version, so you can try several looks on the same shot and switch
          between them. Rendering all photos skips any photo that already has
          the chosen look, so adding a new photo renders just the new one.
        </HelpBlock>

        <HelpBlock title="Photo fixes">
          For the shot where someone blinked or looked away. Open a fix and choose
          how to render it: Photo keeps it a real photograph and only changes the
          eyes; any look fixes the eyes and restyles the photo in the same render.
          Switch to <em className="not-italic text-pearl">This photo</em> to fix
          just the shot that needs it.
        </HelpBlock>

        <HelpBlock title="Compare and download">
          Drag the divider on a finished render to compare it with the original,
          or switch to Render to show it full size. Renders are kept for about an
          hour, so download the ones you want before closing the tab.
        </HelpBlock>

        {metered ? (
          <HelpBlock title="Daily renders">
            The account has a fixed number of renders per day, shown at the top.
            Every render uses one, fixes included. A render that fails gives its
            credit straight back. The count resets at midnight UTC.
          </HelpBlock>
        ) : null}

        <HelpBlock title="What renders well">
          Sharp, well-lit photos where faces fill a good part of the frame. Groups
          of six or more only work when the shot is tight and detailed. Eye fixes
          need faces big enough to see the eyes clearly. Rotate vertical photos
          upright before uploading.
        </HelpBlock>

        <HelpBlock title="When something looks off">
          The model occasionally invents an extra person or softens a face. Render
          the same photo again, switch looks, or crop tighter. Roughly one render
          in twenty needs a second pass.
        </HelpBlock>

        <HelpBlock title="What tends to sell">
          Anime leads by a wide margin, 3D animated follows, and comic stays niche.
          Learn which of your photos the model likes before a big event.
        </HelpBlock>

        <div>
          <h3 className="text-sm font-semibold text-pearl">Shortcuts</h3>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt>
              <span className="kbd">←</span> <span className="kbd">→</span>
            </dt>
            <dd>Previous or next photo</dd>
            <dt>
              <span className="kbd">{modKey} ↵</span>
            </dt>
            <dd>Render</dd>
            <dt>
              <span className="kbd">{modKey} V</span>
            </dt>
            <dd>Paste a photo</dd>
          </dl>
        </div>
      </div>
    </Modal>
  );
}

function HelpBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-pearl">{title}</h3>
      <p className="mt-1.5">{children}</p>
    </div>
  );
}

export function SupportModal({
  request,
  username,
  onClose,
}: {
  request: SupportRequest | null;
  username: string;
  onClose: () => void;
}) {
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Each time the dialog opens, start from that request's draft. A pending
  // auto-close from the previous message must not close the new one.
  useEffect(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    if (request) {
      setMessage(request.draft);
      setState("idle");
    }
  }, [request]);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    []
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState("sending");
    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, topic: request?.kind ?? "support" }),
      });
      if (!response.ok) throw new Error();
      setState("sent");
      closeTimer.current = setTimeout(onClose, 1400);
    } catch {
      setState("error");
    }
  }

  const report = request?.kind === "report";

  return (
    <Modal
      open={request !== null}
      title={report ? "Report a problem" : "Contact support"}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm leading-relaxed text-haze">
          Sending as <span className="font-semibold text-pearl">{username}</span>.{" "}
          {report
            ? "The photo and look are filled in below. Add what looked wrong."
            : "Questions, account problems, or ideas are all welcome."}
        </p>
        <label className="block">
          <span className="sr-only">Message</span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={6}
            required
            maxLength={5000}
            placeholder="What's going on?"
            className="field w-full rounded-xl px-4 py-3 text-sm leading-relaxed"
          />
        </label>
        {state === "error" ? (
          <p role="alert" className="text-sm text-coral">
            That didn&apos;t send. Check your connection and try again.
          </p>
        ) : null}
        <button
          type="submit"
          disabled={state === "sending" || state === "sent" || !message.trim()}
          className="btn-primary px-5 py-3 text-sm"
        >
          {state === "sending" ? <Spinner className="h-4 w-4" tone="ink" /> : null}
          {state === "sent" ? <Check className="h-4 w-4" /> : null}
          {state === "sent" ? "Sent" : state === "sending" ? "Sending" : "Send message"}
        </button>
      </form>
    </Modal>
  );
}
