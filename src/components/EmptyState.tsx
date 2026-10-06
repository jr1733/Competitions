import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-8 py-16 text-center">
      <div className="mb-4 rounded-2xl bg-violet-100 p-4 text-violet-600 dark:bg-violet-950 dark:text-violet-300">
        <Icon className="size-8" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {children && <div className="mt-2 max-w-xs text-sm text-zinc-500 dark:text-zinc-400">{children}</div>}
    </div>
  );
}
