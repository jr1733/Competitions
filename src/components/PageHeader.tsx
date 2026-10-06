import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="pt-safe sticky top-0 z-30 border-b border-zinc-200/70 bg-[#f6f5fa]/90 backdrop-blur-xl dark:border-zinc-800/70 dark:bg-[#0d0c12]/90">
      <div className="flex items-center gap-3 px-4 pt-3 pb-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <div className="truncate text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</div>}
        </div>
        {actions}
      </div>
      {children && <div className="pb-3">{children}</div>}
    </header>
  );
}
