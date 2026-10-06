"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { cacheClearUser, setCacheUser } from "@/lib/client/cache";
import { resetAllResources, setDataUser } from "@/lib/client/data";
import { flushOutbox, loadOutbox, resetOutbox } from "@/lib/client/outbox";
import { unsubscribeThisDevice } from "@/lib/client/push";
import { browserClient } from "@/lib/supabase/browser";
import { LoginScreen } from "./LoginScreen";
import { SetupNeeded } from "./SetupNeeded";
import { Splash } from "./Splash";

const LAST_USER_KEY = "comper:last-user";

type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; userId: string; email: string | null };

interface AuthContextValue {
  userId: string;
  email: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthGate>");
  return ctx;
}

let activeUserId: string | null = null;

/** Point the cache, data layer and outbox at this user (and drop anything from another user). */
function activateUser(userId: string) {
  if (activeUserId === userId) return;
  activeUserId = userId;
  setCacheUser(userId);
  setDataUser(userId);
  resetAllResources();
  resetOutbox();
  void loadOutbox().then(() => flushOutbox());
}

function readLastUser(): { id: string; email: string | null } | null {
  try {
    const raw = localStorage.getItem(LAST_USER_KEY);
    return raw ? (JSON.parse(raw) as { id: string; email: string | null }) : null;
  } catch {
    return null;
  }
}

/**
 * Shows the app only to a signed-in user. Offline with an expired session we
 * still let the last user in, so the cached lists are usable without signal.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    const sb = browserClient();
    if (!sb) return;
    let active = true;

    const apply = (session: Session | null) => {
      if (!active) return;
      if (session) {
        const { id, email } = session.user;
        activateUser(id);
        try {
          localStorage.setItem(LAST_USER_KEY, JSON.stringify({ id, email: email ?? null }));
        } catch {
          // ignore
        }
        setState((prev) =>
          prev.status === "signedIn" && prev.userId === id ? prev : { status: "signedIn", userId: id, email: email ?? null },
        );
        return;
      }
      const last = readLastUser();
      if (last && !navigator.onLine) {
        activateUser(last.id);
        setState({ status: "signedIn", userId: last.id, email: last.email });
        return;
      }
      setState({ status: "signedOut" });
    };

    sb.auth
      .getSession()
      .then(({ data }) => apply(data.session))
      .catch(() => apply(null));
    const { data } = sb.auth.onAuthStateChange((event, session) => {
      if (event !== "INITIAL_SESSION") apply(session);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    await unsubscribeThisDevice().catch(() => undefined);
    await cacheClearUser();
    resetAllResources();
    resetOutbox();
    activeUserId = null;
    try {
      localStorage.removeItem(LAST_USER_KEY);
    } catch {
      // ignore
    }
    await browserClient()?.auth.signOut();
    setState({ status: "signedOut" });
  }, []);

  const value = useMemo<AuthContextValue | null>(
    () => (state.status === "signedIn" ? { userId: state.userId, email: state.email, signOut } : null),
    [state, signOut],
  );

  // NEXT_PUBLIC_* values are inlined at build time, so this is the same on server and client.
  if (!browserClient()) return <SetupNeeded />;
  if (state.status === "loading") return <Splash />;
  if (state.status === "signedOut" || !value) return <LoginScreen />;
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
