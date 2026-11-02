alter table moonflip_private.game_rounds add column version bigint not null default 0 check (version >= 0);
create table moonflip_private.game_transitions (
  operation_id uuid primary key,
  round_id uuid not null references moonflip_private.game_rounds(round_id),
  discord_user_id text not null,
  expected_version bigint not null,
  next_state jsonb not null,
  payout bigint,
  resulting_version bigint not null,
  balance_after bigint not null,
  created_at timestamptz not null default now()
);
alter table moonflip_private.game_transitions enable row level security;
revoke all on moonflip_private.game_transitions from public, anon, authenticated;

create function moonflip_private.advance_game_round(p_operation uuid, p_round uuid, p_user text, p_version bigint, p_state jsonb, p_payout bigint)
returns table(version bigint, balance_after bigint, applied boolean)
language plpgsql security invoker set search_path = '' as $$
declare prior moonflip_private.game_transitions%rowtype; round_data moonflip_private.game_rounds%rowtype; current_balance bigint; next_version bigint;
begin
  if p_operation is null or p_round is null or p_user is null or p_version is null or p_version < 0 or p_state is null or p_payout < 0 then
    raise exception 'invalid game transition';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation::text, 2));
  select * into prior from moonflip_private.game_transitions t where t.operation_id = p_operation;
  if found then
    if prior.round_id <> p_round or prior.discord_user_id <> p_user or prior.expected_version <> p_version
      or prior.next_state <> p_state or prior.payout is distinct from p_payout then
      raise exception 'transition id already used with different parameters';
    end if;
    return query select prior.resulting_version, prior.balance_after, false;
    return;
  end if;
  select * into round_data from moonflip_private.game_rounds r where r.round_id = p_round and r.discord_user_id = p_user for update;
  if not found then raise exception 'round not found'; end if;
  if round_data.status <> 'active' then raise exception 'round already settled'; end if;
  if round_data.version <> p_version then raise exception 'stale game state'; end if;
  if p_payout is null then
    select w.balance into current_balance from moonflip_private.wallets w where w.discord_user_id = p_user for update;
  else
    update moonflip_private.wallets w set balance = w.balance + p_payout, total_won = w.total_won + p_payout, updated_at = now()
      where w.discord_user_id = p_user returning w.balance into current_balance;
  end if;
  next_version := p_version + 1;
  update moonflip_private.game_rounds r set game_state = p_state, version = next_version,
    status = case when p_payout is null then 'active' else 'settled' end,
    payout = p_payout, balance_after_settlement = case when p_payout is null then null else current_balance end,
    settled_at = case when p_payout is null then null else now() end where r.round_id = p_round;
  insert into moonflip_private.game_transitions(operation_id, round_id, discord_user_id, expected_version, next_state, payout, resulting_version, balance_after)
    values (p_operation, p_round, p_user, p_version, p_state, p_payout, next_version, current_balance);
  return query select next_version, current_balance, true;
end $$;
revoke all on function moonflip_private.advance_game_round(uuid, uuid, text, bigint, jsonb, bigint) from public, anon, authenticated;
