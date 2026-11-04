-- Chat content is private to the backend; the web API controls reads and writes.
create table moonflip_private.live_chat_messages (
  message_id uuid primary key,
  discord_user_id text not null references moonflip_private.wallets(discord_user_id),
  message_text text not null check (char_length(message_text) between 1 and 500),
  username text not null,
  avatar_url text,
  level integer not null check (level >= 2),
  origin text not null check (origin in ('web', 'discord')),
  discord_message_id text unique,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index live_chat_messages_time_idx on moonflip_private.live_chat_messages (created_at desc, message_id desc);
create index live_chat_messages_user_time_idx on moonflip_private.live_chat_messages (discord_user_id, created_at desc);
alter table moonflip_private.live_chat_messages enable row level security;
revoke all on moonflip_private.live_chat_messages from public, anon, authenticated;

-- Outbox is committed with each web message, so an offline Discord client
-- cannot discard a message that the web API has accepted.
create table moonflip_private.live_chat_discord_outbox (
  message_id uuid primary key references moonflip_private.live_chat_messages(message_id),
  state text not null default 'pending' check (state in ('pending','delivered')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  discord_message_id text,
  delivered_at timestamptz
);
alter table moonflip_private.live_chat_discord_outbox enable row level security;
revoke all on moonflip_private.live_chat_discord_outbox from public, anon, authenticated;

create table moonflip_private.live_chat_rains (
  period_start timestamptz primary key,
  created_at timestamptz not null default now(),
  total_amount bigint not null check (total_amount >= 0)
);
create table moonflip_private.live_chat_rain_awards (
  period_start timestamptz not null references moonflip_private.live_chat_rains(period_start),
  discord_user_id text not null references moonflip_private.wallets(discord_user_id),
  amount bigint not null check (amount > 0),
  eligible_wager bigint not null check (eligible_wager >= 1000),
  operation_id uuid not null unique,
  primary key (period_start, discord_user_id)
);
create index live_chat_rain_awards_user_idx on moonflip_private.live_chat_rain_awards (discord_user_id, period_start desc);
alter table moonflip_private.live_chat_rains enable row level security;
alter table moonflip_private.live_chat_rain_awards enable row level security;
revoke all on moonflip_private.live_chat_rains, moonflip_private.live_chat_rain_awards from public, anon, authenticated;

create table moonflip_private.live_chat_discord_cursors (
  channel_id text primary key,
  last_message_id text not null,
  updated_at timestamptz not null default now()
);
alter table moonflip_private.live_chat_discord_cursors enable row level security;
revoke all on moonflip_private.live_chat_discord_cursors from public, anon, authenticated;
