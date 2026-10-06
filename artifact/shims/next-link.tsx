"use client";

import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { navigate } from "../router";

/** Stand-in for next/link inside the artifact: same props, in-page navigation. */
export default function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      href={href}
      {...rest}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        navigate(href);
      }}
    />
  );
}
