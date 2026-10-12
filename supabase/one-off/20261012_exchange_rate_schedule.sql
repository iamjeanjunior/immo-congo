-- ImmoCongo — PRODUCTION ONLY: the daily exchange-rate update (never run on the local test database:
-- it calls the production URL). Applied on 2026-10-12 through the Supabase connector (execute_sql).
-- Needs migration 20261012194058_exchange_rates (table + pg_cron + pg_net) and the Edge Function
-- update-exchange-rate (supabase/functions/update-exchange-rate, deployed with verify_jwt = false).
--
-- The source publishes new rates once a day around 00:00 UTC. We ask at 01:30 UTC (03:30 in Lubumbashi),
-- and again at 13:30 UTC in case the first try failed. The function does nothing when the stored rate
-- is less than 20 hours old, so the second call only downloads when the first one failed.
-- cron.schedule with an existing job name replaces that job, so this file can be run again safely.

select cron.schedule(
  'update-exchange-rate',
  '30 1 * * *',
  $job$
  select net.http_post(
    url := 'https://nnkrofhjhjyyprqhwbjv.supabase.co/functions/v1/update-exchange-rate',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  )
  $job$
);

select cron.schedule(
  'update-exchange-rate-retry',
  '30 13 * * *',
  $job$
  select net.http_post(
    url := 'https://nnkrofhjhjyyprqhwbjv.supabase.co/functions/v1/update-exchange-rate',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  )
  $job$
);

-- Check:   select jobname, schedule, active from cron.job;
--          select * from cron.job_run_details order by start_time desc limit 5;
--          select * from public.exchange_rates;
-- Undo:    select cron.unschedule('update-exchange-rate'); select cron.unschedule('update-exchange-rate-retry');
