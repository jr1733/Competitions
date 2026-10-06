"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * A destructive action that needs a second tap: the first tap arms it
 * ("Delete?"), the second within three seconds runs it. Works where
 * window.confirm() doesn't (inside a Claude artifact).
 */
export function ConfirmButton({
  label,
  onConfirm,
  children,
  confirmText = "Delete?",
  className = "",
}: {
  label: string;
  onConfirm: () => void;
  children: ReactNode;
  confirmText?: string;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <button
      type="button"
      aria-label={armed ? `Tap again to confirm: ${label}` : label}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
      className={`rounded-full p-2.5 ${armed ? "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300" : "text-zinc-400"} ${className}`}
    >
      {armed ? <span className="px-1 text-sm font-semibold">{confirmText}</span> : children}
    </button>
  );
}
