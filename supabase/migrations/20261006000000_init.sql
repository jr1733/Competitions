-- Comper: initial schema
-- Run this in the Supabase SQL editor (or `supabase db push`).
--
-- Model
--   feeds               RSS/Atom sources the cron job reads (per user)
--   competitions        Parsed feed items, shared, de-duplicated by URL
--   entries             What *you* did with a competition: entered or skipped
--   wins                Prizes you've won
--   user_settings       Notification preferences + digest bookkeeping
--   push_subscriptions  Web Push endpoints for your devices
--   notification_log    Stops the same "closing soon" alert being sent twice

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- feeds
-- ---------------------------------------------------------------------------

create table public.feeds (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 80),
  url             text not null check (url ~* '^https?://'),
  enabled         boolean not null default true,
  -- You confirmed the source's terms allow personal use of its RSS feed.
  terms_checked   boolean not null default false,
  -- Conditional GET so we only download a feed when it has changed.
  etag            text,
  last_modified   text,
  last_fetched_at timestamptz,
  last_status     text check (last_status in ('ok', 'not_modified', 'blocked_by_robots', 'error')),
  last_error      text,
  last_new_items  integer,
  created_at      timestamptz not null default now(),
  unique (user_id, url)
);

-- ---------------------------------------------------------------------------
-- competitions
-- ---------------------------------------------------------------------------

create table public.competitions (
  id           uuid primary key default gen_random_uuid(),
  url          text not null unique, -- normalised; this is the de-duplication key
  title        text not null,
  prize        text not null,
  summary      text,
  closes_at    timestamptz,
  entry_type   text not null default 'online'
               check (entry_type in ('online', 'social', 'email', 'postal')),
  category     text not null default 'other'
               check (category in ('cash', 'tech', 'travel', 'food', 'home', 'fashion',
                                   'motoring', 'experiences', 'family', 'vouchers', 'other')),
  reentry      text not null default 'none' check (reentry in ('none', 'daily', 'weekly')),
  source       text not null,
  feed_id      uuid references public.feeds (id) on delete set null,
  added_by     uuid references auth.users (id) on delete cascade, -- set for manual adds
  published_at timestamptz,
  created_at   timestamptz not null default now()
);

create index competitions_closes_at_idx on public.competitions (closes_at);
create index competitions_created_at_idx on public.competitions (created_at desc);

-- ---------------------------------------------------------------------------
-- entries (one row per competition you've acted on)
-- ---------------------------------------------------------------------------

create table public.entries (
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  competition_id  uuid not null references public.competitions (id) on delete cascade,
  status          text not null check (status in ('entered', 'skipped')),
  -- Copied from the competition when you enter, and editable afterwards.
  reentry         text not null default 'none' check (reentry in ('none', 'daily', 'weekly')),
  entry_count     integer not null default 0 check (entry_count >= 0),
  last_entered_at timestamptz,
  next_due_at     timestamptz, -- null unless reentry is daily/weekly
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, competition_id)
);

create index entries_due_idx on public.entries (user_id, next_due_at)
  where status = 'entered' and reentry <> 'none';

create trigger entries_updated_at
  before update on public.entries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- wins
-- ---------------------------------------------------------------------------

create table public.wins (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  competition_id uuid references public.competitions (id) on delete set null,
  prize          text not null check (char_length(prize) between 1 and 300),
  value_gbp      numeric(10, 2) check (value_gbp >= 0),
  won_on         date not null default current_date,
  url            text,
  entry_type     text check (entry_type in ('online', 'social', 'email', 'postal')),
  notes          text,
  created_at     timestamptz not null default now()
);

create index wins_user_won_on_idx on public.wins (user_id, won_on desc);

-- ---------------------------------------------------------------------------
-- user_settings (times are UK local time, Europe/London)
-- ---------------------------------------------------------------------------

create table public.user_settings (
  user_id         uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  digest_enabled  boolean not null default true,
  digest_time     time not null default '08:00',
  reentry_enabled boolean not null default true,
  reentry_time    time not null default '09:00',
  closing_enabled boolean not null default true,
  -- Closing-soon alerts are held back during quiet hours.
  quiet_start     time not null default '22:00',
  quiet_end       time not null default '07:00',
  -- Bookkeeping for the notify cron so each daily push goes out once.
  last_digest_on  date,
  last_digest_at  timestamptz,
  last_reentry_on date,
  updated_at      timestamptz not null default now()
);

create trigger user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

-- Create a settings row for every new user, and for any that already exist.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.user_settings (user_id)
select id from auth.users
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- push_subscriptions
-- ---------------------------------------------------------------------------

create table public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- notification_log (server only)
-- ---------------------------------------------------------------------------

create table public.notification_log (
  user_id        uuid not null references auth.users (id) on delete cascade,
  kind           text not null check (kind in ('closing')),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  sent_at        timestamptz not null default now(),
  primary key (user_id, kind, competition_id)
);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.feeds              enable row level security;
alter table public.competitions       enable row level security;
alter table public.entries            enable row level security;
alter table public.wins               enable row level security;
alter table public.user_settings      enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_log   enable row level security; -- no policies: service role only

create policy "Own feeds" on public.feeds
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Signed-in users can read competitions" on public.competitions
  for select to authenticated
  using (true);

create policy "Add competitions manually" on public.competitions
  for insert to authenticated
  with check (added_by = (select auth.uid()) and feed_id is null);

create policy "Edit own manual competitions" on public.competitions
  for update to authenticated
  using (added_by = (select auth.uid()))
  with check (added_by = (select auth.uid()));

create policy "Delete own manual competitions" on public.competitions
  for delete to authenticated
  using (added_by = (select auth.uid()));

create policy "Own entries" on public.entries
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Own wins" on public.wins
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Own settings" on public.user_settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Own push subscriptions" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Feed view: open competitions you haven't entered or skipped yet
-- ---------------------------------------------------------------------------

create view public.feed_items
with (security_invoker = true) as
select c.*
from public.competitions c
where (c.closes_at is null or c.closes_at > now())
  and not exists (
    select 1
    from public.entries e
    where e.competition_id = c.id
      and e.user_id = (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Housekeeping: drop competitions that closed a while ago and that you never
-- entered or won. Called by the feed cron with the service role.
-- ---------------------------------------------------------------------------

create or replace function public.prune_competitions(older_than interval default '30 days')
returns integer
language sql
security definer
set search_path = ''
as $$
  with deleted as (
    delete from public.competitions c
    where c.closes_at < now() - older_than
      and not exists (
        select 1 from public.entries e
        where e.competition_id = c.id and e.status = 'entered'
      )
      and not exists (
        select 1 from public.wins w where w.competition_id = c.id
      )
    returning 1
  )
  select count(*)::integer from deleted;
$$;

revoke execute on function public.prune_competitions(interval) from public, anon, authenticated;
