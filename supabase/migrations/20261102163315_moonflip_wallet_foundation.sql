create schema if not exists moonflip_private;
revoke all on schema moonflip_private from public, anon, authenticated;
create table moonflip_private.wallets (
 discord_user_id text primary key check (discord_user_id ~ '^[0-9]{1,20}$'),
 balance bigint not null default 1000 check (balance >= 0),
 total_bet bigint not null default 0 check (total_bet >= 0),
 total_won bigint not null default 0 check (total_won >= 0),
 games_played bigint not null default 0 check (games_played >= 0),
 last_daily timestamptz,
 xp bigint not null default 0 check (xp >= 0),
 level integer not null default 1 check (level >= 1),
 username text,
 avatar_url text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table moonflip_private.wallet_operations (
 operation_id uuid primary key,
 discord_user_id text not null references moonflip_private.wallets(discord_user_id),
 kind text not null,
 delta bigint not null,
 balance_after bigint not null check (balance_after >= 0),
 created_at timestamptz not null default now()
);
create index wallet_operations_user_created_idx on moonflip_private.wallet_operations(discord_user_id, created_at desc);
alter table moonflip_private.wallets enable row level security;
alter table moonflip_private.wallet_operations enable row level security;
revoke all on all tables in schema moonflip_private from public, anon, authenticated;
