"use client";

import { Gift, ListChecks, Settings, Trophy, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { entriesResource } from "@/lib/client/data";
import { useResource } from "@/lib/client/resource";
import { useNow } from "@/lib/client/use-now";
import { isDue } from "@/lib/entries";

const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Feed", icon: Gift },
  { href: "/entered", label: "Entered", icon: ListChecks },
  { href: "/wins", label: "Wins", icon: Trophy },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();
  const { data: entries } = useResource(entriesResource);
  const now = useNow();
  const due = entries?.filter((e) => isDue(e, now)).length ?? 0;

  return (
    <nav
      aria-label="Main"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200/80 bg-white/90 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/90"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-4">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href) || (href === "/settings" && pathname === "/add");
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition ${
                  active ? "text-violet-600 dark:text-violet-400" : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                <Icon className="size-6" strokeWidth={active ? 2.4 : 2} aria-hidden />
                {label}
                {href === "/entered" && due > 0 && (
                  <span className="absolute top-2 left-1/2 ml-2 min-w-5 rounded-full bg-amber-500 px-1.5 text-center text-[11px] leading-5 font-bold text-white">
                    {due}
                    <span className="sr-only"> re-entries due</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
