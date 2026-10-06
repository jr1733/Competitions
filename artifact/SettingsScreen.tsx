"use client";

import { BellRing, CircleCheck, LoaderCircle, Plus, RefreshCw, Rss, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AddCompetitionForm } from "@/components/AddCompetitionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { PageHeader } from "@/components/PageHeader";
import { Switch } from "@/components/Switch";
import { errorText } from "@/lib/client/network";
import { toast } from "@/lib/client/toast";
import { ENTRY_TYPE_LABELS } from "@/lib/constants";
import { timeAgo } from "@/lib/dates";
import type { CompetitionDraft } from "@/lib/feed/normalise";
import { hostOf } from "@/lib/feed/url";
import type { Feed } from "@/lib/types";
import { capability, FETCH_CONNECTOR, type PermissionState } from "./claude";
import {
  addFeed,
  checkFeeds,
  deleteFeed,
  feedsResource,
  previewFeed,
  reportCheck,
  statsResource,
  updateFeed,
  winsResource,
} from "./data";
import { useResource } from "./resource";

function Section({ id, title, children, description }: { id: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20">
      <h2 id={`${id}-title`} className="section-title mb-2">
        {title}
      </h2>
      {description && <p className="mb-3 px-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>}
      {children}
    </section>
  );
}

function feedStatus(feed: Feed): { text: string; tone: "ok" | "warn" | "muted" } {
  switch (feed.last_status) {
    case "ok":
    case "not_modified":
      return { text: `${feed.last_new_items ?? 0} new · checked ${timeAgo(feed.last_fetched_at)}`, tone: "ok" };
    case "blocked_by_robots":
      return { text: `Skipped: ${feed.last_error ?? "robots.txt doesn't allow it"}`, tone: "warn" };
    case "error":
      return { text: feed.last_error ?? "Error", tone: "warn" };
    default:
      return { text: "Not checked yet", tone: "muted" };
  }
}

/** Whether the page may use the fetch connector, read without prompting. */
function useConnectorState(): [PermissionState | null, () => void] {
  const [state, setState] = useState<PermissionState | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    void capability("permissions").then(async (p) => {
      const s = p ? await p.state(`mcp:${FETCH_CONNECTOR}`).catch(() => "unavailable" as const) : "unavailable";
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
  }, [tick]);
  return [state, () => setTick((t) => t + 1)];
}

function ConnectorNote({ state, onChange }: { state: PermissionState | null; onChange: () => void }) {
  if (state === null || state === "granted") return null;
  if (state === "prompt") {
    return (
      <p className="mb-3 flex gap-2 rounded-xl bg-violet-50 p-3 text-sm text-violet-900 dark:bg-violet-950/50 dark:text-violet-200">
        <ShieldCheck className="size-5 shrink-0" aria-hidden />
        Comper reads feeds through your {FETCH_CONNECTOR} connector. Claude will ask you to allow it the first time you test or check a feed.
      </p>
    );
  }
  if (state === "denied") {
    return (
      <div className="mb-3 flex flex-col gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
        <p>{FETCH_CONNECTOR} is turned off for Comper, so feeds can&apos;t be checked.</p>
        <button
          type="button"
          className="btn btn-secondary self-start"
          onClick={async () => {
            const p = await capability("permissions");
            await p?.manage().catch(() => toast("Open this page's Permissions menu to turn it back on."));
            onChange();
          }}
        >
          Manage permissions
        </button>
      </div>
    );
  }
  return (
    <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
      Checking feeds needs the {FETCH_CONNECTOR} connector. Add it in claude.ai under Settings → Connectors, then reopen Comper. You can still add
      competitions by hand below.
    </p>
  );
}

type Preview = Awaited<ReturnType<typeof previewFeed>>;

function AddFeedForm({ onUsedConnector }: { onUsedConnector: () => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [terms, setTerms] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<Preview | { ok: false; blockedByRobots: false; error: string } | null>(null);

  async function test() {
    setTesting(true);
    setResult(null);
    try {
      const r = await previewFeed(url.trim());
      setResult(r);
      if (r.ok && r.title && !name) setName(r.title.slice(0, 80));
    } catch (error) {
      setResult({ ok: false, blockedByRobots: false, error: errorText(error) });
    } finally {
      setTesting(false);
      onUsedConnector();
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    let parsed: URL;
    try {
      parsed = new URL(url.trim());
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
    } catch {
      toast("Enter the feed's full web address, starting with https://", { tone: "error" });
      return;
    }
    setSaving(true);
    try {
      const feed = await addFeed({ name: name.trim() || hostOf(parsed.toString()), url: parsed.toString() });
      setName("");
      setUrl("");
      setTerms(false);
      setResult(null);
      toast("Feed added. Checking it now…");
      reportCheck(await checkFeeds([feed.id]));
    } catch (error) {
      toast(errorText(error), { tone: "error" });
    } finally {
      setSaving(false);
      onUsedConnector();
    }
  }

  return (
    <form onSubmit={onSubmit} className="card flex flex-col gap-3 p-4">
      <h3 className="font-semibold">Add a feed</h3>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">RSS or Atom feed URL</span>
        <input
          id="feed-url"
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
        <input id="feed-name" className="input" maxLength={80} placeholder="Shown on each card" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex items-start gap-3 py-1">
        <input
          id="feed-terms"
          type="checkbox"
          required
          className="mt-0.5 size-5 shrink-0 accent-violet-600"
          checked={terms}
          onChange={(e) => setTerms(e.target.checked)}
        />
        <span className="text-sm">I&apos;ve checked this site&apos;s terms, and they allow personal use of its RSS feed.</span>
      </label>

      {result && (
        <div
          role="status"
          className={`rounded-xl p-3 text-sm ${
            result.ok ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200" : "bg-red-50 text-red-800 dark:bg-red-950/60 dark:text-red-200"
          }`}
        >
          {result.ok ? (
            <>
              <p className="font-semibold">
                ✓ {result.title || "Feed"}: {result.itemCount} items, {result.openCount} still open
              </p>
              <p className="mt-0.5 opacity-80">robots.txt allows reading it.</p>
              {!!result.sample.length && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5">
                  {result.sample.map((s: CompetitionDraft) => (
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
  const stats = useResource(statsResource).data;
  const [checking, setChecking] = useState(false);
  const [connector, recheckConnector] = useConnectorState();

  async function checkAll() {
    setChecking(true);
    try {
      reportCheck(await checkFeeds());
    } catch (error) {
      toast(errorText(error), { tone: "error", durationMs: 6000 });
    } finally {
      setChecking(false);
      recheckConnector();
    }
  }

  return (
    <Section
      id="feeds"
      title="RSS feeds"
      description="Checked when you open Comper, at most every 6 hours, or whenever you tap Check. Comper reads RSS only, follows each site's robots.txt, and never visits competition pages for you."
    >
      <ConnectorNote state={connector} onChange={recheckConnector} />
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
              <Switch checked={feed.enabled} label={`Check ${feed.name}`} onChange={(enabled) => updateFeed(feed.id, { enabled })} />
              <ConfirmButton label={`Remove the feed ${feed.name}`} confirmText="Remove?" className="-mr-2" onConfirm={() => deleteFeed(feed.id)}>
                <Trash2 className="size-5" aria-hidden />
              </ConfirmButton>
            </div>
          );
        })}
        {feeds && feeds.length > 0 && (
          <button type="button" className="btn btn-secondary" onClick={checkAll} disabled={checking}>
            <RefreshCw className={`size-5 ${checking ? "animate-spin" : ""}`} aria-hidden />
            {checking ? "Checking feeds…" : `Check all feeds now${stats?.lastCheckAt ? ` · last ${timeAgo(stats.lastCheckAt)}` : ""}`}
          </button>
        )}
        <AddFeedForm onUsedConnector={recheckConnector} />
      </div>
    </Section>
  );
}

export function SettingsScreen() {
  const stats = useResource(statsResource).data;
  const winCount = useResource(winsResource).data?.length ?? 0;

  return (
    <>
      <PageHeader title="Settings" />
      <main className="flex flex-col gap-8 px-4 pt-4 pb-6">
        <FeedsSection />

        <Section id="reminders" title="Reminders">
          <div className="card flex gap-3 p-4 text-sm">
            <BellRing className="size-5 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden />
            <p className="text-zinc-600 dark:text-zinc-300">
              Pages inside Claude can&apos;t send push notifications, so Comper shows what needs doing when you open it. The{" "}
              <strong>Entered</strong> tab badge counts re-entries due now, due ones sit at the top of that tab, and the Feed is sorted so
              competitions closing soonest come first.
            </p>
          </div>
        </Section>

        <Section
          id="add"
          title="Add a competition"
          description="Found one elsewhere? Paste its link. Comper won't visit the page: add the details you want on the card."
        >
          <div className="card p-4">
            <AddCompetitionForm allowPaste={false} />
          </div>
        </Section>

        <Section id="data" title="Your data">
          <div className="card flex items-start gap-3 p-4 text-sm">
            <CircleCheck className="size-5 shrink-0 text-emerald-600" aria-hidden />
            <p className="text-zinc-600 dark:text-zinc-300">
              {stats ? `${stats.competitions} competitions and ${winCount} win${winCount === 1 ? "" : "s"} saved` : "Saved"} privately to your Claude
              account. Only you can see them, even if you share this page, and they sync to every device where you open Comper.
            </p>
          </div>
        </Section>

        <p className="px-1 text-xs leading-relaxed text-zinc-500">
          Comper helps you find and track competitions. It never submits entries, fills in forms or solves CAPTCHAs: every entry is yours.
        </p>
      </main>
    </>
  );
}
