-- Backend-only durable state for tickets, settings and leaderboard history.
create table moonflip_private.documents (
  key text primary key check (length(key) between 1 and 200),
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table moonflip_private.documents enable row level security;
revoke all on moonflip_private.documents from public, anon, authenticated;
