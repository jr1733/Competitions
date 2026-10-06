"use client";

import { X } from "lucide-react";
import { useEffect, useId, type ReactNode } from "react";

/** A bottom sheet dialog: thumb-reachable on phones. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" role="presentation">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="pb-safe relative max-h-[88dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl dark:bg-zinc-900"
      >
        <div className="sticky top-0 z-10 flex items-center gap-2 bg-white/95 px-5 pt-3 pb-2 backdrop-blur dark:bg-zinc-900/95">
          <div className="absolute top-2 left-1/2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-zinc-300 dark:bg-zinc-700" />
          <h2 id={titleId} className="mt-3 flex-1 text-lg font-bold">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="mt-3 -mr-2 rounded-full p-2.5 text-zinc-500" aria-label="Close">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="px-5 pt-2 pb-6">{children}</div>
      </div>
    </div>
  );
}
