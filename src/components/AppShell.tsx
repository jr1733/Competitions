"use client";

import type { ReactNode } from "react";
import { AuthGate } from "./AuthGate";
import { BottomNav } from "./BottomNav";
import { ServiceWorkerRegister } from "./ServiceWorkerRegister";
import { Toaster } from "./Toaster";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <AuthGate>
        <div className="mx-auto min-h-dvh max-w-xl pb-[calc(env(safe-area-inset-bottom)+5.5rem)]">{children}</div>
        <BottomNav />
      </AuthGate>
      <Toaster />
      <ServiceWorkerRegister />
    </>
  );
}
