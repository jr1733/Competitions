# Comper

Comper is a personal, mobile-first app that helps you work through UK prize
competitions faster. It's an installable PWA built with Next.js, Supabase and
Vercel.

- **Collect.** It reads competition **RSS feeds** every 6 hours.
- **Sort.** It parses each item into a prize, closing date and entry type
  (online form, social, email or postal).
- **Review.** It shows them as cards, soonest closing first.
- **Track.** It records what you entered, reminds you when daily and weekly
  competitions can be entered again, and tracks your wins.

> **You enter every competition yourself.** The **Enter** button opens the
> competition page in your browser, and that's all. Comper never submits
> entries, fills in forms or solves CAPTCHAs. It doesn't visit competition
> pages at all: it reads RSS feeds only, follows each site's `robots.txt`,
> and never scrapes HTML.

## Contents

- [Run it inside Claude (artifact)](#run-it-inside-claude-artifact)
- [Features](#features)
- [How it works](#how-it-works)
- [Setup](#setup)
  1. [Supabase](#1-supabase)
  2. [Push notification (VAPID) keys](#2-push-notification-vapid-keys)
  3. [Environment variables](#3-environment-variables)
  4. [Run it locally](#4-run-it-locally)
  5. [Deploy to Vercel](#5-deploy-to-vercel)
  6. [Scheduled jobs (Vercel Cron)](#6-scheduled-jobs-vercel-cron)
  7. [Add your feeds](#7-add-your-feeds)
- [Install the app on your phone](#install-the-app-on-your-phone)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

## Run it inside Claude (artifact)

Comper also runs as a Claude artifact, with no Supabase, Vercel or deployment
needed. The `artifact/` folder builds the same screens into one self-contained
page:

```bash
npm run build:artifact     # → artifact/dist/comper.html
```

What changes in the artifact version:

- **Storage.** Feeds, competitions, entries and wins are saved in the
  artifact's own database, under your private `data/users/<you>/` area. Nobody
  else can read it, even if you share the page.
- **Feed checking.** The page reads feeds through your **Parallel Search**
  connector in claude.ai. It fetches each site's `robots.txt` first and skips
  disallowed feeds, then parses the RSS in the browser. Feeds are checked when
  you open Comper (at most every 6 hours) or when you tap refresh or **Check
  all feeds now**.
- **Find feeds for me** (Settings). This searches the web for UK competition
  sites, checks each site's robots.txt, then tries their usual feed addresses
  (`/feed/`, `/rss`). It keeps only real RSS feeds whose items look like
  competitions, shows what each contains, and adds one only after you confirm
  you've checked that site's terms. It uses three connector calls per search.
- **No push notifications.** Pages inside Claude can't send them. Re-entries
  due and competitions closing soon show up when you open the app instead.
- **No install.** Pin the artifact in Claude and open it from the Claude app on
  your phone.

## Features

| Screen       | What it does |
| ------------ | ------------ |
| **Feed**     | Competition cards sorted by closing date, soonest first. Each card shows the prize, closing date, entry type badge, category and source, with **Enter**, **Entered** and **Skip** buttons. **Swipe right** marks a card entered and **swipe left** skips it; both can be undone. Filter by entry type and prize category, or search. |
| **Entered**  | Everything you've entered, grouped by day. Daily and weekly competitions are flagged with when they're next due. Due ones move to the top with **Enter again** and **Done** buttons. You can change a competition's re-entry frequency, log a win from it, or move it back to the feed. |
| **Wins**     | Log a win: prize, value in £, date, and the competition (pick from your entries or paste a link). See total wins, total value, value this year, and win rate overall and by entry type. |
| **Settings** | Manage RSS feeds: test a feed before adding it, see each feed's status, and check all feeds now. Turn on push notifications for this device and set the digest and reminder times and quiet hours. Add a competition by pasting its link. Install help and sign out. |

Notifications are sent via Web Push:

- **Daily digest** of new competitions, at a time you choose.
- **Re-entries due today**, at a time you choose.
- **Closing within 24 hours** alerts for competitions you've entered, sent once
  per competition and never during quiet hours.

PWA features:

- Installs to your home screen with its own icon.
- Works offline. The lists load from an on-device cache instantly and then
  refresh, and anything you tap offline syncs when you're back online.
- Light and dark mode follow the system setting.
- On Android you can **share** a link from any app into Comper to add it as a
  competition.

## How it works

```
Vercel Cron ─┬─ every 6h  → /api/cron/fetch-feeds → robots.txt → RSS → parse → de-dupe → Supabase
             └─ every 15m → /api/cron/notify      → digest / re-entries due / closing soon → Web Push

Phone (installed PWA) ⇄ Supabase (Postgres + Auth, Row Level Security)
   └ IndexedDB cache + offline outbox; service worker caches the app shell
```

**Feed ingestion** (`src/lib/feed/`):

- **robots.txt first.** Before every request, including each redirect hop,
  Comper fetches `robots.txt` for the host as `ComperBot`. If the feed is
  disallowed, it's skipped. If `robots.txt` can't be reached (a 5xx or a
  network error), the feed is also skipped and retried next run. A missing
  `robots.txt` (4xx) means fetching is allowed, as RFC 9309 says.
  `Crawl-delay` is honoured between feeds on the same host.
- **Efficient fetching.** Conditional requests (`ETag`, `Last-Modified`) mean a
  feed is only downloaded when it has changed.
- **Feeds only.** RSS 2.0, RSS 1.0 (RDF) and Atom are accepted. A URL that
  returns a web page is rejected. Item pages are never requested, and
  loopback or private addresses are refused.
- **Parsing.** Each item's title, description and `<category>` tags are turned
  into:
  - **Prize:** "WIN a £500 Argos gift card! | Site" becomes "£500 Argos gift
    card".
  - **Closing date:** UK formats such as `9th October 2026`, `31/12/2026 at
    5pm`, `Friday 16 October` and `midnight on 20th November`, read as UK
    time. A date with no time means 23:59:59. Explicit fields such as
    `<closingDate>` take priority.
  - **Entry type:** online form, social, email or postal, guessed from wording
    and tags. The default is online form.
  - **Prize category:** cash, tech, holidays, food and drink, and so on.
  - **Re-entry:** daily or weekly. Newspaper names like the "Daily Mail" are
    ignored.
- **De-duplication.** URLs are normalised (no `utm_*`, no fragment, no trailing
  slash) and de-duplicated. The first copy seen wins. Items past their closing
  date are dropped.
- **Pruning.** Competitions that closed more than 30 days ago are deleted,
  unless you entered or won them.

**Notification timing.** The digest and the re-entry reminder are each sent
once per UK day, at the first notification run on or after your chosen time.
With the 15-minute schedule, a digest set for 08:00 arrives between 08:00 and
08:15.

## Setup

You'll need Node.js 20.9 or later, a free [Supabase](https://supabase.com)
project, and a [Vercel](https://vercel.com) account.

### 1. Supabase

1. **Create a project** at <https://supabase.com/dashboard>. Choose the London
   (eu-west-2) region if you can.
2. **Create the database.** Open **SQL Editor**, paste in all of
   [`supabase/migrations/20261006000000_init.sql`](supabase/migrations/20261006000000_init.sql)
   and click **Run**. If you use the Supabase CLI, `supabase db push` does the
   same.
3. **Create your login.** Go to **Authentication → Users → Add user → Create
   new user**. Enter your email and a strong password, and tick **Auto Confirm
   User**.
4. **Lock it down to just you.** Go to **Authentication → Sign In / Providers**
   and turn off **Allow new users to sign up**. Comper is single-user, and Row
   Level Security limits every row to its owner.
5. **Copy your keys** from **Project Settings → API Keys**:
   - the **Project URL**
   - the **Publishable key** (`sb_publishable_…`). The legacy `anon` key also
     works.
   - the **Secret key** (`sb_secret_…`). The legacy `service_role` key also
     works. Keep it secret: it bypasses Row Level Security and is only used on
     the server.

### 2. Push notification (VAPID) keys

```bash
npx web-push generate-vapid-keys
```

This prints a public key and a private key. The public key goes in
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` and the private key in `VAPID_PRIVATE_KEY`.
Generate them **once** and keep them. If you change them, every device has to
turn notifications on again.

### 3. Environment variables

Copy `.env.example` to `.env.local` and fill it in:

| Variable | Required | What it is |
| -------- | -------- | ---------- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Publishable key (or legacy anon key, as `NEXT_PUBLIC_SUPABASE_ANON_KEY`) |
| `SUPABASE_SECRET_KEY` | yes | Secret key (or legacy service_role key, as `SUPABASE_SERVICE_ROLE_KEY`). **Server only.** |
| `CRON_SECRET` | yes | A long random string, e.g. `openssl rand -hex 32`. Protects the cron endpoints. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | for push | VAPID public key |
| `VAPID_PRIVATE_KEY` | for push | VAPID private key |
| `VAPID_SUBJECT` | for push | `mailto:` plus your email. Push services use it to contact you. |
| `NEXT_PUBLIC_APP_URL` | optional | Your deployed URL. It's added to the feed reader's User-Agent so site owners can see who is fetching. |

`NEXT_PUBLIC_*` values are built into the app, so **redeploy after you change
them**.

### 4. Run it locally

```bash
npm install
npm run dev            # http://localhost:3000
```

Sign in with the user you created. Then trigger a feed fetch, either with
**Settings → Check all feeds now** or with:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/fetch-feeds
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/notify
```

The service worker only registers in production builds, so offline caching
never gets in the way while you develop. To try the full PWA locally, run
`npm run build && npm start`. Push notifications need HTTPS or `localhost`.

### 5. Deploy to Vercel

1. Push this repo to GitHub, then in Vercel choose **Add New… → Project** and
   import it. The framework preset is detected as **Next.js**.
2. Under **Environment Variables**, add everything from step 3 for the
   Production environment. Add it for Preview too if you use preview
   deployments.
3. Click **Deploy**.
4. Open the deployment URL on your phone and sign in.

### 6. Scheduled jobs (Vercel Cron)

`vercel.json` declares two cron jobs:

| Path | Schedule | Job |
| ---- | -------- | --- |
| `/api/cron/fetch-feeds` | `0 */6 * * *` (every 6 hours) | Read every enabled feed and store new competitions |
| `/api/cron/notify` | `*/15 * * * *` (every 15 minutes) | Send the digest, re-entry reminders and closing alerts when due |

Vercel automatically sends `Authorization: Bearer $CRON_SECRET` with each cron
request, so make sure `CRON_SECRET` is set. You can see the jobs, and run them
by hand, under **Project → Settings → Cron Jobs**.

> **Vercel plan note:** the **Hobby** plan only allows cron jobs that run
> **once a day**, and deployments with more frequent schedules fail. The
> schedules above need **Pro**. On Hobby:
>
> 1. Delete the `crons` block from `vercel.json`.
> 2. Run [`supabase/optional/pg_cron_schedule.sql`](supabase/optional/pg_cron_schedule.sql)
>    in the Supabase SQL editor, after filling in your URL and `CRON_SECRET`.
>    Supabase's free `pg_cron` and `pg_net` extensions will then call the same
>    endpoints on the same schedules.
>
> You can also point any external scheduler at the two URLs with the same
> header.

### 7. Add your feeds

In **Settings → RSS feeds**:

1. Paste a feed URL. Many sites use `/feed/` or link an RSS icon.
2. Tap **Test feed**. This checks `robots.txt`, fetches the feed, and shows how
   many items are still open, with a few parsed examples.
3. Tick **I've checked this site's terms** once you've read the site's terms
   and they allow personal use of its RSS feed.
4. Tap **Add**. The feed is fetched immediately and then every 6 hours.

Each feed shows its last status: new items, no changes, skipped by
`robots.txt`, or an error. Use the switch to pause a feed.

You can also add a single competition: paste its link in **Settings → Add a
competition**, or on Android share a link to Comper.

## Install the app on your phone

### iPhone (iOS 16.4 or later)

1. Open your Comper URL in **Safari**.
2. Tap **Share**. In the compact tab layout, tap **⋯** first, then **Share**.
3. Tap **Add to Home Screen**. On iOS 26, keep **Open as Web App** switched on.
4. Tap **Add**.
5. Open Comper **from the Home Screen icon** and sign in. The installed app
   keeps its own login, separate from Safari's.
6. Go to **Settings → Notifications → Turn on notifications** and allow them.
   On iPhone, web push only works in the installed app, not in a Safari tab.

### Android (Chrome)

1. Open your Comper URL in **Chrome**.
2. Tap **Install** when Chrome offers it, or go to **⋮ → Install app** (on some
   phones it's **Add to Home screen**).
3. Open Comper from the home screen, sign in, and go to **Settings →
   Notifications → Turn on notifications**.
4. Bonus: in any app, **Share** a competition link and choose **Comper**. It
   opens **Add competition** with the link filled in.

## Development

```bash
npm run dev         # dev server
npm test            # unit tests (Vitest)
npm run lint        # ESLint
npm run typecheck   # TypeScript
npm run build       # production build
npm run icons       # regenerate PWA icons from the SVG in scripts/generate-icons.mjs
npm run build:artifact  # single-page Claude artifact → artifact/dist/comper.html
```

```
src/
  app/                    routes: / (Feed), /entered, /wins, /settings, /add, manifest, icons
    api/cron/             fetch-feeds, notify: Vercel Cron, CRON_SECRET-protected
    api/feeds/            refresh, test: signed-in user (Bearer access token)
    api/push/             test, renew
  components/             UI: swipe cards, sheets, badges, screens/
  lib/
    feed/                 RSS parsing, classification, closing dates, robots.txt, ingestion
    notify/, push/        notification planning and Web Push sending
    client/               IndexedDB cache, resources, offline outbox, push subscribe
    supabase/             browser client and service-role client (server only)
public/sw.js              service worker: offline shell, push handlers
supabase/migrations/      database schema and RLS
artifact/                 Claude artifact build: data layer on the artifact database, connector feed fetching
docs/PLAN.md              architecture, rules and schema overview
tests/                    Vitest suites
```

## Troubleshooting

- **"Almost there" screen.** The Supabase environment variables weren't present
  at build time. Add them and redeploy.
- **A feed shows "robots.txt unavailable" or "Disallowed by robots.txt".**
  Comper respects the site's wishes and won't read that feed. Choose a
  different source.
- **"This URL returned a web page, not an RSS feed".** Find the site's actual
  RSS URL. It usually ends in `/feed/`, `/rss` or `.xml`.
- **No notifications on iPhone.** Comper must be opened from the Home Screen
  icon, notifications must be turned on inside the app, and Focus modes may
  hold them back. Use **Send test** in Settings.
- **Notifications arrive late.** Check that the notify cron is running: see
  Vercel → Cron Jobs, or `cron.job_run_details` in Supabase if you use
  `pg_cron`.
- **A closing date or entry type looks wrong.** The parser uses heuristics.
  Always check the competition's own terms before entering. You can change a
  competition's re-entry frequency on the Entered screen.
