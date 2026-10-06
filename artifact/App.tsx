"use client";

import { useEffect, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { Logo } from "@/components/Logo";
import { EnteredScreen } from "@/components/screens/EnteredScreen";
import { FeedScreen } from "@/components/screens/FeedScreen";
import { WinsScreen } from "@/components/screens/WinsScreen";
import { Splash } from "@/components/Splash";
import { Toaster } from "@/components/Toaster";
import { capability, FETCH_CONNECTOR } from "./claude";
import { checkFeeds, connect, statsResource, type ConnectResult } from "./data";
import { useLocation } from "./router";
import { SettingsScreen } from "./SettingsScreen";

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

function NotInClaude({ result }: { result: Exclude<ConnectResult, { ok: true }> }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-3 px-6 py-12">
      <Logo className="mb-3 size-16 rounded-2xl" />
      <h1 className="text-2xl font-bold">Open Comper in Claude</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        {result.reason === "no-user"
          ? "Sign in to Claude to use Comper. Your competitions, entries and wins are saved to your account."
          : result.reason === "error"
            ? `Comper couldn't reach its storage${result.message ? ` (${result.message})` : ""}. Reload the page to try again.`
            : "Comper saves your competitions, entries and wins with Claude, so it only works when opened in Claude while you're signed in."}
      </p>
    </main>
  );
}

/** Check feeds when the app opens if the last check was over 6 hours ago and the connector is already allowed. */
async function autoCheck() {
  const permissions = await capability("permissions");
  const state = await permissions?.state(`mcp:${FETCH_CONNECTOR}`).catch(() => "unavailable" as const);
  if (state !== "granted") return;
  const last = statsResource.getSnapshot().data?.lastCheckAt;
  if (last && Date.now() - new Date(last).getTime() < CHECK_EVERY_MS) return;
  await checkFeeds().catch(() => undefined);
}

export function App() {
  const [result, setResult] = useState<ConnectResult | null>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    let alive = true;
    void connect().then((r) => {
      if (!alive) return;
      setResult(r);
      // Give the first snapshots a moment to arrive before deciding.
      if (r.ok) setTimeout(() => void autoCheck(), 1500);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!result) return <Splash />;
  if (!result.ok) return <NotInClaude result={result} />;

  return (
    <>
      <div className="mx-auto min-h-dvh max-w-xl pb-24">
        <div hidden={pathname !== "/"}>
          <FeedScreen />
        </div>
        <div hidden={pathname !== "/entered"}>
          <EnteredScreen />
        </div>
        <div hidden={pathname !== "/wins"}>
          <WinsScreen />
        </div>
        <div hidden={pathname !== "/settings"}>
          <SettingsScreen />
        </div>
      </div>
      <BottomNav />
      <Toaster />
    </>
  );
}
