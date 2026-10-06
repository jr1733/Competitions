import { Globe, Mail, Mailbox, Repeat, Users, type LucideIcon } from "lucide-react";
import { ENTRY_TYPE_LABELS, type EntryType, type Reentry } from "@/lib/constants";

const ENTRY_STYLES: Record<EntryType, { icon: LucideIcon; className: string }> = {
  online: { icon: Globe, className: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" },
  social: { icon: Users, className: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300" },
  email: { icon: Mail, className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300" },
  postal: { icon: Mailbox, className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
};

const BADGE = "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold";

export function EntryTypeBadge({ type }: { type: EntryType }) {
  const { icon: Icon, className } = ENTRY_STYLES[type];
  return (
    <span className={`${BADGE} ${className}`}>
      <Icon className="size-3.5" aria-hidden />
      {ENTRY_TYPE_LABELS[type]}
    </span>
  );
}

export function ReentryBadge({ reentry, label }: { reentry: Reentry; label?: string }) {
  if (reentry === "none") return null;
  return (
    <span className={`${BADGE} bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300`}>
      <Repeat className="size-3.5" aria-hidden />
      {label ?? (reentry === "daily" ? "Daily" : "Weekly")}
    </span>
  );
}

export function DueBadge({ text, due }: { text: string; due: boolean }) {
  return (
    <span
      className={`${BADGE} ${
        due ? "bg-amber-500 text-white dark:bg-amber-400 dark:text-amber-950" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
      }`}
    >
      {text}
    </span>
  );
}
