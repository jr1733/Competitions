"use client";

import { useSyncExternalStore } from "react";

const subscribeNever = () => () => {};

/**
 * A value that only exists in the browser (user agent, display mode…).
 * Returns `serverValue` during prerendering and hydration. `get` must return
 * a primitive or a stable reference.
 */
export function useClientValue<T>(get: () => T, serverValue: T): T {
  return useSyncExternalStore(subscribeNever, get, () => serverValue);
}
