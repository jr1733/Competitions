const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "_ga",
  "_gl",
  "ref_src",
  "yclid",
]);

/**
 * Canonical form used to de-duplicate competitions: lower-case host, no
 * fragment, no tracking parameters, sorted query, no trailing slash.
 * Returns null for anything that isn't an http(s) URL.
 */
export function normaliseUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
    url.port = "";
  }

  const kept = [...url.searchParams.entries()]
    .filter(([key]) => {
      const k = key.toLowerCase();
      return !k.startsWith("utm_") && !TRACKING_PARAMS.has(k);
    })
    .sort(([a], [b]) => a.localeCompare(b));
  url.search = "";
  for (const [key, value] of kept) url.searchParams.append(key, value);

  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  return url.toString();
}

export function hostOf(input: string): string {
  try {
    return new URL(input).hostname.replace(/^www\./, "");
  } catch {
    return input;
  }
}

/**
 * Feeds must be public http(s) URLs. Loopback, private and link-local
 * addresses are refused so the server can't be pointed at internal services.
 */
export function isPublicHttpUrl(input: string): boolean {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return false;
  }
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
  }
  if (host.includes(":")) {
    if (host === "::" || host === "::1" || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || host.startsWith("::ffff:")) {
      return false;
    }
  }
  return true;
}
