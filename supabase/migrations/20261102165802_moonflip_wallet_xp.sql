create table moonflip_private.wallet_xp_events (
  operation_id uuid primary key,
  discord_user_id text not null references moonflip_private.wallets(discord_user_id),
  xp_amount bigint not null check (xp_amount >= 0),
  balance_after bigint not null, xp_after bigint not null, level_after integer not null,
  token_bonus bigint not null, created_at timestamptz not null default now()
);
alter table moonflip_private.wallet_xp_events enable row level security;
revoke all on moonflip_private.wallet_xp_events from public, anon, authenticated;
create function moonflip_private.add_wallet_xp(p_operation uuid, p_user text, p_xp bigint)
returns table(balance_after bigint, xp_after bigint, level_after integer, token_bonus bigint, applied boolean)
language plpgsql security invoker set search_path = '' as $$
declare prior moonflip_private.wallet_xp_events%rowtype; wallet moonflip_private.wallets%rowtype; next_xp bigint; next_level integer; required_xp bigint; bonus bigint := 0;
begin
  if p_operation is null or p_user is null or p_xp is null or p_xp < 0 then raise exception 'invalid xp event'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation::text, 4));
  select * into prior from moonflip_private.wallet_xp_events e where e.operation_id = p_operation;
  if found then
    if prior.discord_user_id <> p_user or prior.xp_amount <> p_xp then raise exception 'xp id already used with different parameters'; end if;
    return query select prior.balance_after, prior.xp_after, prior.level_after, prior.token_bonus, false;
    return;
  end if;
  insert into moonflip_private.wallets(discord_user_id) values (p_user) on conflict (discord_user_id) do nothing;
  select * into wallet from moonflip_private.wallets w where w.discord_user_id = p_user for update;
  next_xp := wallet.xp + p_xp;
  next_level := wallet.level;
  required_xp := floor(100 * power(next_level::double precision, 1.5))::bigint;
  while next_xp >= required_xp loop
    next_xp := next_xp - required_xp;
    next_level := next_level + 1;
    bonus := bonus + case next_level when 5 then 250 when 10 then 750 when 20 then 2000 when 35 then 5000 when 50 then 15000 else 100 end;
    required_xp := floor(100 * power(next_level::double precision, 1.5))::bigint;
  end loop;
  update moonflip_private.wallets w set xp = next_xp, level = next_level, balance = w.balance + bonus, updated_at = now()
    where w.discord_user_id = p_user returning * into wallet;
  insert into moonflip_private.wallet_xp_events(operation_id, discord_user_id, xp_amount, balance_after, xp_after, level_after, token_bonus)
    values(p_operation, p_user, p_xp, wallet.balance, next_xp, next_level, bonus);
  return query select wallet.balance, next_xp, next_level, bonus, true;
end $$;
revoke all on function moonflip_private.add_wallet_xp(uuid, text, bigint) from public, anon, authenticated;
