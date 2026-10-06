import { Logo } from "./Logo";

export function SetupNeeded() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6 py-12">
      <Logo className="size-14 rounded-2xl" />
      <h1 className="text-2xl font-bold">Almost there</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        Comper needs its Supabase settings. Add <code className="font-mono text-sm">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="font-mono text-sm">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to your environment (Vercel → Project → Settings →
        Environment Variables), then redeploy.
      </p>
      <p className="text-zinc-600 dark:text-zinc-400">The README walks through every step.</p>
    </main>
  );
}
