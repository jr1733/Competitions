/** True when an error looks like "no connection" rather than a real failure. */
export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const message =
    typeof error === "object" && error !== null && "message" in error ? String((error as { message: unknown }).message) : String(error);
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed|err_internet/i.test(message);
}

export function errorText(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) return String((error as { message: unknown }).message);
  return String(error);
}
