"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { LogoMark } from "@/components/logo-mark";

function safeNext(value: string | null): string {
  // Only same-site paths; never bounce a fresh session to another origin.
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? "Sign-in failed. Try again.");
        setBusy(false);
        return;
      }

      router.replace(safeNext(params.get("next")));
      router.refresh();
    } catch {
      setError("Couldn't reach the studio. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full max-w-[26rem]"
    >
      <div className="viewfinder absolute -inset-4 sm:-inset-6" aria-hidden="true" />
      <div className="panel relative rounded-2xl p-7 shadow-lift sm:p-9">
        <LogoMark draw />

        <h1 className="wide mt-10 text-[2rem] font-semibold leading-[1.08] tracking-[-0.01em]">
          Sign in to the studio
        </h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-haze">
          Restyle group photos and fix closed eyes, usually in under a minute.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-haze">Username</span>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              className="field mt-1.5 w-full rounded-xl px-4 py-3"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-haze">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="field mt-1.5 w-full rounded-xl px-4 py-3"
            />
          </label>

          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-coral/40 bg-coral/10 px-4 py-3 text-sm text-coral"
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="btn-primary w-full px-5 py-3.5 text-[0.9375rem]"
          >
            {busy ? (
              <span
                aria-hidden="true"
                className="ring-spin h-4 w-4 rounded-full border-2 border-void/25 border-t-void"
              />
            ) : null}
            {busy ? "Signing in" : "Sign in"}
          </button>
        </form>

        <p className="mt-8 text-xs text-dim">A Kaiel Systems tool.</p>
      </div>
    </motion.div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
