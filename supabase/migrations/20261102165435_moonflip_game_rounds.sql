create table moonflip_private.game_rounds (
  round_id uuid primary key,
  discord_user_id text not null references moonflip_private.wallets(discord_user_id),
  game_type text not null check (game_type <> ''),
  wager bigint not null check (wager > 0),
  initial_state jsonb not null,
  game_state jsonb not null,
  status text not null default 'active' check (status in ('active', 'settled')),
  payout bigint check (payout >= 0),
  balance_after_wager bigint not null check (balance_after_wager >= 0),
  balance_after_settlement bigint check (balance_after_settlement >= 0),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index game_rounds_user_status_idx on moonflip_private.game_rounds(discord_user_id, status);
alter table moonflip_private.game_rounds enable row level security;
revoke all on moonflip_private.game_rounds from public, anon, authenticated;

create function moonflip_private.start_game_round(p_round uuid, p_user text, p_game text, p_wager bigint, p_state jsonb)
returns table(balance_after bigint, applied boolean)
language plpgsql security invoker set search_path = '' as $$
declare previous moonflip_private.game_rounds%rowtype; current_balance bigint;
begin
  if p_round is null or p_user is null or p_game is null or p_game = '' or p_wager is null or p_wager <= 0 or p_state is null then
    raise exception 'invalid game round';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_round::text, 1));
  select * into previous from moonflip_private.game_rounds r where r.round_id = p_round;
  if found then
    if previous.discord_user_id <> p_user or previous.game_type <> p_game or previous.wager <> p_wager or previous.initial_state <> p_state then
      raise exception 'round id already used with different parameters';
    end if;
    return query select previous.balance_after_wager, false;
    return;
  end if;
  insert into moonflip_private.wallets(discord_user_id) values (p_user) on conflict (discord_user_id) do nothing;
  select w.balance into current_balance from moonflip_private.wallets w where w.discord_user_id = p_user for update;
  if current_balance < p_wager then raise exception 'insufficient balance'; end if;
  update moonflip_private.wallets w set balance = w.balance - p_wager, total_bet = w.total_bet + p_wager,
    games_played = w.games_played + 1, updated_at = now()
    where w.discord_user_id = p_user returning w.balance into current_balance;
  insert into moonflip_private.game_rounds(round_id, discord_user_id, game_type, wager, initial_state, game_state, balance_after_wager)
    values (p_round, p_user, p_game, p_wager, p_state, p_state, current_balance);
  return query select current_balance, true;
end $$;

create function moonflip_private.settle_game_round(p_round uuid, p_user text, p_payout bigint)
returns table(balance_after bigint, applied boolean)
language plpgsql security invoker set search_path = '' as $$
declare round_data moonflip_private.game_rounds%rowtype; current_balance bigint;
begin
  if p_round is null or p_user is null or p_payout is null or p_payout < 0 then raise exception 'invalid settlement'; end if;
  select * into round_data from moonflip_private.game_rounds r where r.round_id = p_round and r.discord_user_id = p_user for update;
  if not found then raise exception 'round not found'; end if;
  if round_data.status = 'settled' then
    if round_data.payout <> p_payout then raise exception 'round already settled with different payout'; end if;
    return query select round_data.balance_after_settlement, false;
    return;
  end if;
  update moonflip_private.wallets w set balance = w.balance + p_payout, total_won = w.total_won + p_payout, updated_at = now()
    where w.discord_user_id = p_user returning w.balance into current_balance;
  update moonflip_private.game_rounds r set status = 'settled', payout = p_payout,
    balance_after_settlement = current_balance, settled_at = now() where r.round_id = p_round;
  return query select current_balance, true;
end $$;
revoke all on function moonflip_private.start_game_round(uuid, text, text, bigint, jsonb) from public, anon, authenticated;
revoke all on function moonflip_private.settle_game_round(uuid, text, bigint) from public, anon, authenticated;
