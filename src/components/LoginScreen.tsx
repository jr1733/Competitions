"use client";

import { LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { browserClient } from "@/lib/supabase/browser";
import { Logo } from "./Logo";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const sb = browserClient();
    if (!sb) return;
    setBusy(true);
    setError(null);
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(error.message === "Failed to fetch" ? "You're offline. Connect to sign in." : error.message);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-12">
      <Logo className="mb-6 size-16 rounded-2xl shadow-lg shadow-violet-500/20" />
      <h1 className="text-3xl font-bold tracking-tight">Comper</h1>
      <p className="mt-1 text-zinc-600 dark:text-zinc-400">Enter UK competitions faster.</p>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="btn btn-primary mt-2">
          {busy ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : null}
          Sign in
        </button>
      </form>
      <p className="mt-6 text-sm text-zinc-500">
        Comper is single-user. Create your login in Supabase under Authentication → Users.
      </p>
    </main>
  );
}
