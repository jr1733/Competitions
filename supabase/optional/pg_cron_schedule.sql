-- OPTIONAL: run Comper's scheduled jobs from Supabase instead of Vercel Cron.
--
-- Use this on Vercel's Hobby plan, which only allows cron jobs that run once a
-- day (so the 6-hourly feed refresh and 15-minute notification check can't
-- run there). Also remove the "crons" block from vercel.json, or Hobby
-- deployments will fail.
--
-- 1. Replace YOUR-APP and YOUR_CRON_SECRET below.
-- 2. Run this in the Supabase SQL editor.
-- To remove later: select cron.unschedule('comper-fetch-feeds'); select cron.unschedule('comper-notify');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'comper-fetch-feeds',
  '0 */6 * * *',
  $$
  select net.http_get(
    url := 'https://YOUR-APP.vercel.app/api/cron/fetch-feeds',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET'),
    timeout_milliseconds := 60000
  );
  $$
);

select cron.schedule(
  'comper-notify',
  '*/15 * * * *',
  $$
  select net.http_get(
    url := 'https://YOUR-APP.vercel.app/api/cron/notify',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET'),
    timeout_milliseconds := 60000
  );
  $$
);
