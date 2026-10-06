"use client";

import { useEffect } from "react";
import { toast } from "@/lib/client/toast";

/** Registers /sw.js in production. In development any old worker is removed so caching never gets in the way. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
      return;
    }

    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };

    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((registration) => {
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          // A new version is ready and an old one is still in charge: offer to switch.
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            toast("A new version of Comper is ready", {
              durationMs: 15_000,
              action: {
                label: "Reload",
                onClick: () => {
                  navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
                  worker.postMessage({ type: "SKIP_WAITING" });
                },
              },
            });
          }
        });
      });
      // Check for updates whenever the app comes back to the foreground.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void registration.update().catch(() => undefined);
      });
    });
  }, []);

  return null;
}
