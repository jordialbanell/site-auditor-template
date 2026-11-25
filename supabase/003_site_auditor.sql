-- Site Auditor in the shared database (11 Oct 2026): saved audits + a week-long page cache. Replaces Upstash Redis.
-- Safe to run twice. RLS on, no policies, no anon/authenticated grants.

create table if not exists public.site_auditor_audits (
  id text primary key,
  created_at timestamptz not null default now(),
  url text not null,
  meta jsonb not null,
  data jsonb not null
);

create table if not exists public.site_auditor_page_cache (
  url text primary key,
  html text not null,
  fetched_at timestamptz not null default now()
);

alter table public.site_auditor_audits enable row level security;
alter table public.site_auditor_page_cache enable row level security;
revoke all on public.site_auditor_audits from anon, authenticated;
revoke all on public.site_auditor_page_cache from anon, authenticated;
