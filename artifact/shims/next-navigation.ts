"use client";

import { navigate, useLocation } from "../router";

/** Stand-ins for the next/navigation hooks the shared screens use. */

export function usePathname(): string {
  return useLocation().pathname;
}

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams(useLocation().search);
}

export function useRouter() {
  return {
    push: (href: string) => navigate(href),
    replace: (href: string) => navigate(href),
    back: () => navigate("/"),
    forward: () => undefined,
    refresh: () => undefined,
    prefetch: () => undefined,
  };
}
