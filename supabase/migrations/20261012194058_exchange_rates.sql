-- Exchange rates (design refresh, 2026-10-12). Visitors choose USD or CDF, and prices are converted
-- with the day's rate. The Edge Function `update-exchange-rate` stores the rate here once a day
-- (scheduled with pg_cron), so visitors' browsers never call a third-party site.
-- Everyone may read the rate; only the server (service role) can write it.
-- Additive: the live site before the design refresh ignores this table.

create table if not exists public.exchange_rates (
  base text not null default 'USD',
  quote text not null,
  rate numeric not null check (rate > 0),
  source text not null default 'open.er-api.com (ExchangeRate-API)',
  source_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (base, quote)
);

comment on table public.exchange_rates is
  '1 base = rate quote (for example 1 USD = 2300 CDF). Written once a day by the Edge Function update-exchange-rate. Read by everyone.';

alter table public.exchange_rates enable row level security;

drop policy if exists "exchange_rates_read_all" on public.exchange_rates;
create policy "exchange_rates_read_all" on public.exchange_rates
  for select to anon, authenticated using (true);

-- Read-only for website users, even if a write policy were ever added by mistake.
revoke insert, update, delete, truncate, references, trigger on public.exchange_rates from anon, authenticated;
grant select on public.exchange_rates to anon, authenticated;

-- For the daily update: pg_net lets the database call the Edge Function, pg_cron runs it on a schedule.
-- The schedule itself is production-only (it calls the production URL):
-- supabase/one-off/20261012_exchange_rate_schedule.sql
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
