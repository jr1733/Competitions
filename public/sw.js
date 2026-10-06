/* Comper service worker: offline app shell, cached static assets, Web Push. */

const VERSION = "v1";
const PAGES = `comper-pages-${VERSION}`;
const STATIC = `comper-static-${VERSION}`;
const ASSETS = `comper-assets-${VERSION}`;
const SHELL_ROUTES = ["/", "/entered", "/wins", "/settings", "/add"];
const NETWORK_TIMEOUT_MS = 3000;
const MAX_STATIC_ENTRIES = 400;

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PAGES, STATIC, ASSETS]);
      for (const key of await caches.keys()) if (key.startsWith("comper-") && !keep.has(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

/** Cache each tab's HTML plus the JS/CSS it references, so a cold start works offline. */
async function precacheShell() {
  const pages = await caches.open(PAGES);
  const statics = await caches.open(STATIC);
  const assetUrls = new Set(["/manifest.webmanifest", "/icons/icon-192.png", "/icons/badge-96.png", "/icon.svg"]);
  await Promise.all(
    SHELL_ROUTES.map(async (route) => {
      try {
        const res = await fetch(route, { cache: "reload", credentials: "same-origin" });
        if (!res.ok) return;
        const html = await res.clone().text();
        await pages.put(route, res);
        for (const match of html.matchAll(/["'](\/_next\/static\/[^"'?#\s]+)["']/g)) assetUrls.add(match[1]);
      } catch {
        // Offline during install: pages get cached as they're visited instead.
      }
    }),
  );
  await Promise.all(
    [...assetUrls].map(async (url) => {
      try {
        const res = await fetch(url, { credentials: "same-origin" });
        if (res.ok) await (url.startsWith("/_next/static/") ? statics : await caches.open(ASSETS)).put(url, res);
      } catch {
        // ignore
      }
    }),
  );
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (const request of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(request);
}

/** Pages: network first (fresh deploys), falling back to the cached shell when offline or slow. */
async function handleNavigation(request) {
  const cache = await caches.open(PAGES);
  const url = new URL(request.url);
  const key = SHELL_ROUTES.includes(url.pathname) ? url.pathname : null;

  const network = fetch(request).then(async (res) => {
    if (res.ok && key) await cache.put(key, res.clone());
    return res;
  });

  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS));
  try {
    const res = await Promise.race([network, timeout]);
    if (res) return res;
  } catch {
    // Offline: fall through to the cache.
  }
  const cached = (key && (await cache.match(key))) || (await cache.match("/"));
  if (cached) {
    network.catch(() => undefined); // let the slow request finish and refresh the cache
    return cached;
  }
  return network;
}

/** Hashed build assets never change: cache first. */
async function handleStatic(request) {
  const cache = await caches.open(STATIC);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) {
    await cache.put(request, res.clone());
    void trim(STATIC, MAX_STATIC_ENTRIES);
  }
  return res;
}

/** Icons, manifest: serve cached, refresh in the background. */
async function handleAsset(request) {
  const cache = await caches.open(ASSETS);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then(async (res) => {
      if (res.ok) await cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase etc.: the app caches data itself
  if (url.pathname.startsWith("/api/")) return;
  if (request.headers.get("RSC") || url.searchParams.has("_rsc")) return; // router payloads: let Next handle them

  if (request.mode === "navigate") event.respondWith(handleNavigation(request));
  else if (url.pathname.startsWith("/_next/static/")) event.respondWith(handleStatic(request));
  else if (/\.(png|svg|ico|webmanifest)$/.test(url.pathname) || url.pathname === "/manifest.webmanifest") {
    event.respondWith(handleAsset(request));
  }
});

// ---------------------------------------------------------------------------
// Web Push
// ---------------------------------------------------------------------------

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Comper";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === target.origin && "focus" in client) {
          await client.focus();
          if (target.origin === self.location.origin && "navigate" in client) await client.navigate(target.href);
          return;
        }
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});

// Some browsers rotate push subscriptions. Tell the server about the new one.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription;
      const fresh =
        event.newSubscription ||
        (old && (await self.registration.pushManager.subscribe(old.options).catch(() => null)));
      if (!old || !fresh) return;
      await fetch("/api/push/renew", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldEndpoint: old.endpoint, subscription: fresh.toJSON() }),
      });
    })(),
  );
});
