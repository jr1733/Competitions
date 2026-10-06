"use client";

import {
  Bell,
  BellOff,
  CircleCheck,
  LoaderCircle,
  LogOut,
  Plus,
  RefreshCw,
  Rss,
  Send,
  Share,
  Smartphone,
  SquarePlus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { apiFetch } from "@/lib/client/api";
import {
  addFeed,
  deleteFeed,
  feedResource,
  feedsResource,
  saveSettings,
  settingsResource,
  updateFeed,
  type SettingsPatch,
} from "@/lib/client/data";
import { errorText } from "@/lib/client/network";
import { currentSubscription, pushSupport, subscribeThisDevice, unsubscribeThisDevice, type PushSupport } from "@/lib/client/push";
import { useResource } from "@/lib/client/resource";
import { useClientValue } from "@/lib/client/use-client-value";
import { toast } from "@/lib/client/toast";
import { ENTRY_TYPE_LABELS } from "@/lib/constants";
import { timeAgo, trimSeconds } from "@/lib/dates";
import type { CompetitionDraft } from "@/lib/feed/normalise";
import { hostOf } from "@/lib/feed/url";
import type { Feed } from "@/lib/types";
import { AddCompetitionForm } from "../AddCompetitionForm";
import { useAuth } from "../AuthGate";
import { ConfirmButton } from "../ConfirmButton";
import { PageHeader } from "../PageHeader";
import { Switch } from "../Switch";

function Section({ id, title, children, description }: { id?: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id ?? title}-title`} className="scroll-mt-24">
      <h2 id={`${id ?? title}-title`} className="section-title mb-2">
        {title}
      </h2>
      {description && <p className="mb-3 px-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>}
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Feeds
// ---------------------------------------------------------------------------

function feedStatus(feed: Feed): { text: string; tone: "ok" | "warn" | "muted" } {
  switch (feed.last_status) {
    case "ok":
      return { text: `${feed.last_new_items ?? 0} new · checked ${timeAgo(feed.last_fetched_at)}`, tone: "ok" };
    case "not_modified":
      return { text: `No changes · checked ${timeAgo(feed.last_fetched_at)}`, tone: "ok" };
    case "blocked_by_robots":
      return { text: `Skipped: ${feed.last_error ?? "robots.txt doesn't allow it"}`, tone: "warn" };
    case "error":
      return { text: feed.last_error ?? "Error", tone: "warn" };
    default:
      return { text: "Not fetched yet", tone: "muted" };
  }
}

interface TestResult {
  ok: boolean;
  error?: string;
  blockedByRobots?: boolean;
  title?: string;
  itemCount?: number;
  openCount?: number;
  sample?: CompetitionDraft[];
}

interface RefreshSummary {
  newItems: number;
  feeds: { status: string }[];
}

async function refreshFeeds(feedIds?: string[]) {
  const summary = await apiFetch<RefreshSummary>("/api/feeds/refresh", feedIds ? { feedIds } : {});
  await Promise.all([feedsResource.refresh(), feedResource.refresh()]);
  return summary;
}

function AddFeedForm() {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [terms, setTerms] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  async function test() {
    setTesting(true);
    setResult(null);
    try {
      const r = await apiFetch<TestResult>("/api/feeds/test", { url: url.trim() });
      setResult(r);
      if (r.ok && r.title && !name) setName(r.title.slice(0, 80));
    } catch (error) {
      setResult({ ok: false, error: errorText(error) });
    } finally {
      setTesting(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const feed = await addFeed({ name: name.trim() || hostOf(url), url: url.trim() });
      setName("");
      setUrl("");
      setTerms(false);
      setResult(null);
      toast("Feed added. Fetching it now…");
      const summary = await refreshFeeds([feed.id]);
      toast(`${summary.newItems} new competition${summary.newItems === 1 ? "" : "s"} from ${feed.name}`, { tone: "success" });
    } catch (error) {
      toast(`Feed saved, but the first fetch failed: ${errorText(error)}`, { tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card flex flex-col gap-3 p-4">
      <h3 className="font-semibold">Add a feed</h3>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">RSS or Atom feed URL</span>
        <input
          className="input"
          type="url"
          inputMode="url"
          required
          placeholder="https://example.co.uk/feed/"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setResult(null);
          }}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Name</span>
        <input className="input" maxLength={80} placeholder="Shown on each card" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex items-start gap-3 py-1">
        <input type="checkbox" required className="mt-0.5 size-5 shrink-0 accent-violet-600" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
        <span className="text-sm">
          I&apos;ve checked this site&apos;s terms, and they allow personal use of its RSS feed.
        </span>
      </label>

      {result && (
        <div
          className={`rounded-xl p-3 text-sm ${
            result.ok ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200" : "bg-red-50 text-red-800 dark:bg-red-950/60 dark:text-red-200"
          }`}
          role="status"
        >
          {result.ok ? (
            <>
              <p className="font-semibold">
                ✓ {result.title || "Feed"}: {result.itemCount} items, {result.openCount} still open
              </p>
              <p className="mt-0.5 opacity-80">robots.txt allows Comper to read it.</p>
              {!!result.sample?.length && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5">
                  {result.sample.map((s) => (
                    <li key={s.url}>
                      {s.prize} <span className="opacity-70">· {ENTRY_TYPE_LABELS[s.entry_type]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p>
              {result.blockedByRobots ? "Blocked: " : ""}
              {result.error}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn btn-secondary" disabled={!url || testing} onClick={test}>
          {testing ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : null}
          Test feed
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving || result?.ok === false}>
          {saving ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Plus className="size-5" aria-hidden />}
          Add
        </button>
      </div>
    </form>
  );
}

function FeedsSection() {
  const { data: feeds } = useResource(feedsResource);
  const [refreshing, setRefreshing] = useState(false);

  async function refreshAll() {
    setRefreshing(true);
    try {
      const summary = await refreshFeeds();
      toast(`${summary.newItems} new competition${summary.newItems === 1 ? "" : "s"}`, { tone: "success" });
    } catch (error) {
      toast(`Refresh failed: ${errorText(error)}`, { tone: "error" });
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <Section
      id="feeds"
      title="RSS feeds"
      description="Checked every 6 hours. Comper reads RSS only, follows each site's robots.txt, and never visits competition pages for you."
    >
      <div className="flex flex-col gap-3">
        {feeds?.map((feed) => {
          const status = feedStatus(feed);
          return (
            <div key={feed.id} className="card flex items-center gap-3 p-4">
              <Rss className="size-5 shrink-0 text-orange-500" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{feed.name}</div>
                <div className="truncate text-xs text-zinc-500">{hostOf(feed.url)}</div>
                <div
                  className={`mt-0.5 line-clamp-2 text-xs ${
                    status.tone === "warn" ? "text-red-600 dark:text-red-400" : status.tone === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-500"
                  }`}
                >
                  {status.tone === "warn" && <TriangleAlert className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />}
                  {status.text}
                </div>
              </div>
              <Switch checked={feed.enabled} label={`Fetch ${feed.name}`} onChange={(enabled) => updateFeed(feed.id, { enabled })} />
              <ConfirmButton label={`Remove the feed ${feed.name}`} confirmText="Remove?" className="-mr-2" onConfirm={() => deleteFeed(feed.id)}>
                <Trash2 className="size-5" aria-hidden />
              </ConfirmButton>
            </div>
          );
        })}
        {feeds && feeds.length > 0 && (
          <button type="button" className="btn btn-secondary" onClick={refreshAll} disabled={refreshing}>
            <RefreshCw className={`size-5 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
            {refreshing ? "Checking feeds…" : "Check all feeds now"}
          </button>
        )}
        <AddFeedForm />
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

function TimeField({ label, value, onSave }: { label: string; value: string; onSave: (time: string) => void }) {
  const [local, setLocal] = useState(trimSeconds(value));
  const [synced, setSynced] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pick up changes saved elsewhere (another device, a refresh).
  if (synced !== value) {
    setSynced(value);
    setLocal(trimSeconds(value));
  }

  function change(next: string) {
    setLocal(next);
    if (timer.current) clearTimeout(timer.current);
    if (next) timer.current = setTimeout(() => next !== trimSeconds(value) && onSave(next), 700);
  }

  return (
    <input
      type="time"
      aria-label={label}
      className="input w-36 shrink-0 text-center"
      value={local}
      onChange={(e) => change(e.target.value)}
    />
  );
}

function SettingRow({
  title,
  description,
  control,
  children,
}: {
  title: string;
  description: string;
  control: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="px-4 py-3.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium">{title}</div>
          <div className="text-sm text-zinc-500 dark:text-zinc-400">{description}</div>
        </div>
        {control}
      </div>
      {children && <div className="mt-2.5 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">{children}</div>}
    </div>
  );
}

function NotificationsSection() {
  const { userId } = useAuth();
  const { data: settings } = useResource(settingsResource);
  const support = useClientValue<PushSupport | null>(pushSupport, null);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (support === "supported") void currentSubscription().then((sub) => setSubscribed(!!sub));
  }, [support]);

  async function enable() {
    setBusy(true);
    try {
      await subscribeThisDevice(userId);
      setSubscribed(true);
      toast("Notifications are on for this device", { tone: "success" });
    } catch (error) {
      toast(errorText(error), { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await unsubscribeThisDevice();
      setSubscribed(false);
      toast("Notifications are off for this device");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      const r = await apiFetch<{ sent: number }>("/api/push/test", {});
      toast(r.sent ? `Test sent to ${r.sent} device${r.sent === 1 ? "" : "s"}` : "No devices are subscribed yet", {
        tone: r.sent ? "success" : "default",
      });
    } catch (error) {
      toast(errorText(error), { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const save = (patch: SettingsPatch) => saveSettings(patch);

  return (
    <Section id="notifications" title="Notifications" description="Times are UK time.">
      <div className="card mb-3 p-4">
        {support === "needs-install" && (
          <p className="text-sm">
            <Smartphone className="mr-1 inline size-4 align-[-3px]" aria-hidden />
            On iPhone, notifications only work after you add Comper to your Home Screen (see <a className="underline" href="#install">Install</a>). Then open it from there.
          </p>
        )}
        {support === "unsupported" && <p className="text-sm">This browser doesn&apos;t support push notifications.</p>}
        {support === "supported" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm">
              {subscribed ? (
                <>
                  <CircleCheck className="size-5 text-emerald-600" aria-hidden /> On for this device
                </>
              ) : (
                <>
                  <BellOff className="size-5 text-zinc-400" aria-hidden /> Off for this device
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {subscribed ? (
                <>
                  <button type="button" className="btn btn-secondary" onClick={sendTest} disabled={busy}>
                    <Send className="size-5" aria-hidden /> Send test
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={disable} disabled={busy}>
                    <BellOff className="size-5" aria-hidden /> Turn off
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-primary col-span-2" onClick={enable} disabled={busy}>
                  <Bell className="size-5" aria-hidden /> Turn on notifications
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {settings && (
        <div className="card divide-y divide-zinc-100 dark:divide-zinc-800">
          <SettingRow
            title="Daily digest"
            description="New competitions since the last digest"
            control={<Switch checked={settings.digest_enabled} label="Daily digest" onChange={(v) => save({ digest_enabled: v })} />}
          >
            {settings.digest_enabled && (
              <>
                Send at
                <TimeField label="Digest time" value={settings.digest_time} onSave={(t) => save({ digest_time: t })} />
              </>
            )}
          </SettingRow>
          <SettingRow
            title="Re-entry reminders"
            description="Daily and weekly competitions due today"
            control={<Switch checked={settings.reentry_enabled} label="Re-entry reminders" onChange={(v) => save({ reentry_enabled: v })} />}
          >
            {settings.reentry_enabled && (
              <>
                Send at
                <TimeField label="Re-entry reminder time" value={settings.reentry_time} onSave={(t) => save({ reentry_time: t })} />
              </>
            )}
          </SettingRow>
          <SettingRow
            title="Closing soon"
            description="Competitions you've entered that close within 24 hours"
            control={<Switch checked={settings.closing_enabled} label="Closing soon alerts" onChange={(v) => save({ closing_enabled: v })} />}
          />
          <div className="px-4 py-3.5">
            <div className="font-medium">Quiet hours</div>
            <div className="text-sm text-zinc-500 dark:text-zinc-400">No closing-soon alerts between these times</div>
            <div className="mt-2 flex items-center gap-2">
              <TimeField label="Quiet hours start" value={settings.quiet_start} onSave={(t) => save({ quiet_start: t })} />
              <span className="text-zinc-500">to</span>
              <TimeField label="Quiet hours end" value={settings.quiet_end} onSave={(t) => save({ quiet_end: t })} />
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Install, account
// ---------------------------------------------------------------------------

type Platform = "installed" | "ios" | "android" | "other";

function detectPlatform(): Platform {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const ua = navigator.userAgent;
  return standalone ? "installed" : /iphone|ipad|ipod/i.test(ua) ? "ios" : /android/i.test(ua) ? "android" : "other";
}

function InstallSection() {
  const platform = useClientValue<Platform | null>(detectPlatform, null);

  if (!platform) return null;
  return (
    <Section id="install" title="Install">
      <div className="card p-4 text-sm">
        {platform === "installed" && (
          <p className="flex items-center gap-2">
            <CircleCheck className="size-5 text-emerald-600" aria-hidden /> Comper is installed on this device.
          </p>
        )}
        {platform === "ios" && (
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              Open this page in <strong>Safari</strong>.
            </li>
            <li>
              Tap <Share className="inline size-4 align-[-3px]" aria-label="Share" /> <strong>Share</strong> (or <strong>⋯</strong> then Share), then{" "}
              <SquarePlus className="inline size-4 align-[-3px]" aria-hidden /> <strong>Add to Home Screen</strong>. Keep{" "}
              <strong>Open as Web App</strong> on.
            </li>
            <li>Open Comper from your Home Screen, sign in, and turn on notifications.</li>
          </ol>
        )}
        {(platform === "android" || platform === "other") && (
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              Open this page in <strong>Chrome</strong>.
            </li>
            <li>
              Tap the <strong>⋮</strong> menu, then <strong>Install app</strong> (or <strong>Add to Home screen</strong>).
            </li>
            <li>On Android you can then share links straight into Comper to add competitions.</li>
          </ol>
        )}
      </div>
    </Section>
  );
}

export function SettingsScreen() {
  const { email, signOut } = useAuth();

  useEffect(() => {
    // Scroll to #feeds, #add etc. when linked from elsewhere.
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);

  return (
    <>
      <PageHeader title="Settings" />
      <main className="flex flex-col gap-8 px-4 pt-4 pb-6">
        <FeedsSection />
        <NotificationsSection />
        <Section
          id="add"
          title="Add a competition"
          description="Found one elsewhere? Paste its link. Comper won't visit the page: add the details you want on the card."
        >
          <div className="card p-4">
            <AddCompetitionForm />
          </div>
        </Section>
        <InstallSection />
        <Section title="Account">
          <div className="card flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="text-sm text-zinc-500">Signed in as</div>
              <div className="truncate font-medium">{email ?? "you"}</div>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => void signOut()}>
              <LogOut className="size-5" aria-hidden /> Sign out
            </button>
          </div>
        </Section>
        <p className="px-1 text-xs leading-relaxed text-zinc-500">
          Comper helps you find and track competitions. It never submits entries, fills in forms or solves CAPTCHAs: every entry is yours.
        </p>
      </main>
    </>
  );
}
