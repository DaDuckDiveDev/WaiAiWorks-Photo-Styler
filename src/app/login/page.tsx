"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, LockKeyhole } from "lucide-react";
import { LogoMark } from "@/components/logo-mark";

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
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Sign-in failed.");
        setBusy(false);
        return;
      }

      router.replace(params.get("next") ?? "/");
      router.refresh();
    } catch {
      setError("Network trouble. Try again.");
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="glass-card w-full max-w-md p-8 sm:p-10"
    >
      <div className="relative z-[2]">
        <LogoMark />

        <h1 className="font-display mt-8 text-3xl font-semibold leading-tight">
          <span className="liquid-text">Sign in to the studio</span>
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-pacific/70">
          Upload your photos, pick a style, and get illustrated renders back in
          about a minute.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-pacific/60">
              Username
            </span>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              className="glass-input mt-2 w-full rounded-xl px-4 py-3 text-pacific outline-none transition placeholder:text-pacific/35 focus:ring-2 focus:ring-skyline/50"
              placeholder="your-username"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-pacific/60">
              Password
            </span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="glass-input mt-2 w-full rounded-xl px-4 py-3 text-pacific outline-none transition placeholder:text-pacific/35 focus:ring-2 focus:ring-skyline/50"
              placeholder="••••••••"
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
            className="glass-btn-primary flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LockKeyhole className="h-4 w-4" />
            )}
            {busy ? "Signing in" : "Enter the studio"}
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-pacific/45">
          A Kaiel Systems tool · access is issued per account
        </p>
      </div>
    </motion.div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-16">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
