# Comper: plan

Comper is a personal, mobile-first PWA for entering UK prize competitions faster.
It collects competitions from RSS feeds and helps you work through them. **You
enter every competition yourself.** The app never submits entries, fills in
forms, or solves CAPTCHAs. The "Enter" button just opens the competition page in
your browser.

## Architecture

```
            ┌──────────────── Vercel ────────────────┐
 RSS/Atom   │  /api/cron/fetch-feeds  (every 6 h)    │      ┌──────────────┐
 feeds  ◄───┤   robots.txt check → fetch → parse →   ├─────►│   Supabase   │
            │   classify → de-dupe → upsert          │      │  Postgres +  │
            │                                        │      │  Auth + RLS  │
 Web Push◄──┤  /api/cron/notify       (every 15 min) │◄────►│              │
            │   digest · re-entry due · closing soon │      └──────▲───────┘
            │                                        │             │ RLS (your rows only)
            │  Static app shell (Next.js App Router) │             │
            └───────────────────┬────────────────────┘             │
                                │ HTML/JS (service-worker cached)  │
                         ┌──────▼──────────────────────────────────┴──┐
                         │  Phone: installed PWA                       │
                         │  IndexedDB cache → render instantly →       │
                         │  refresh from Supabase → offline outbox     │
                         └─────────────────────────────────────────────┘
```

- **Pages are static shells**, prerendered by Next.js and cached by the service
  worker. Data is fetched on the client straight from Supabase. Row Level
  Security limits every query to your own rows.
- **Cache first, then refresh.** Each list (feed, entries, wins, feeds,
  settings) is saved to IndexedDB, so it renders straight from the cache and
  refreshes in the background. Taps like Entered, Skip and Log win update the UI
  at once. If you're offline, they wait in an outbox and sync when you're back
  online.
- **Server-only work** runs in route handlers using the Supabase service key:
  - the feed cron
  - the notification cron
  - "Refresh now"
  - "Test feed"
  - test push notifications
- **Auth** is Supabase email + password for a single user. Sign-ups are turned
  off in the Supabase dashboard. A password works inside an installed iOS PWA,
  where magic links would open in Safari instead.

## Feed ingestion rules

1. Read each enabled feed from `feeds`.
2. Fetch the site's `robots.txt` and skip the feed if our user agent
   (`ComperBot`) is disallowed. If `robots.txt` is unreachable, play safe and
   skip. Honour `Crawl-delay` between feeds on the same host.
3. Conditional GET (`ETag` / `Last-Modified`). Only RSS 2.0, RSS 1.0 (RDF) and
   Atom are accepted. HTML responses are rejected, and item pages are never
   fetched or scraped.
4. Turn each item into: title, URL, prize, summary, closing date, entry type
   (online / social / email / postal), prize category, re-entry frequency
   (none / daily / weekly), and source. Closing dates and types come from
   keyword heuristics on the item text and `<category>` tags.
5. Normalise URLs (strip `utm_*` and similar, the fragment, and the trailing
   slash), de-duplicate by URL, and drop anything past its closing date.
6. Prune competitions that closed more than 30 days ago, unless you entered or
   won them.

## Screens

| Tab      | What it does                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| Feed     | Cards sorted by closing date, with filters for entry type and category, and search. Each card has Enter, Entered and Skip buttons. Swipe right = entered, swipe left = skip, with Undo. |
| Entered  | Everything you've entered, grouped by day. Daily and weekly re-entries are flagged with their next due time, and due ones float to the top. |
| Wins     | Log a win. See totals, value in £ and win rate by entry type.                                                      |
| Settings | Manage RSS feeds (with a terms checkbox and a "Test feed" button), set notification times, add a competition manually, sign out. |

## Notifications

`/api/cron/notify` runs every 15 minutes and, for each user, sends:

- **Daily digest** at the first run after your chosen time: new, unactioned
  competitions since the last digest.
- **Re-entries due today** at the first run after your chosen time.
- **Closing within 24 hours** for competitions you entered, once per
  competition, held back during quiet hours.

## Database schema

The full SQL is in `supabase/migrations/20261006000000_init.sql`.

```
feeds               id, user_id, name, url, enabled, terms_checked, etag,
                    last_modified, last_fetched_at, last_status, last_error,
                    last_new_items, created_at              unique(user_id, url)

competitions        id, url (unique, normalised), title, prize, summary,
                    closes_at, entry_type, category, reentry, source, feed_id,
                    added_by (manual adds), published_at, created_at

entries             (user_id, competition_id) PK, status (entered|skipped),
                    reentry (none|daily|weekly), entry_count, last_entered_at,
                    next_due_at, created_at, updated_at

wins                id, user_id, competition_id, prize, value_gbp, won_on, url,
                    entry_type, notes, created_at

user_settings       user_id PK, digest_enabled, digest_time, reentry_enabled,
                    reentry_time, closing_enabled, quiet_start, quiet_end,
                    last_digest_on, last_digest_at, last_reentry_on

push_subscriptions  endpoint PK, user_id, p256dh, auth, user_agent

notification_log    (user_id, kind, competition_id) PK, sent_at   -- server only

view feed_items     open competitions with no entry row for auth.uid()
fn   prune_competitions(interval)                                -- service role only
```

## Build steps

1. Scaffold, plan and schema.
2. Feed ingestion library (parse, classify, robots, de-dupe) with unit tests,
   and the feed cron route.
3. Client data layer: Supabase client, IndexedDB cache, optimistic store, offline
   outbox, auth gate.
4. Screens: Feed (swipe cards, filters, search), Entered, Wins, Settings,
   Add competition.
5. PWA: manifest, icons, service worker (offline shell + push handlers), share
   target.
6. Web Push: subscriptions, notify cron, test push.
7. README: setup, deployment and phone install.
