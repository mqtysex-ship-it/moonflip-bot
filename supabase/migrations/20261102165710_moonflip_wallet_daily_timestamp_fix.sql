create or replace function moonflip_private.claim_wallet_daily(p_operation uuid, p_user text)
returns table(balance_after bigint, applied boolean, success boolean, available_at timestamptz)
language plpgsql security invoker set search_path = '' as $$
declare prior moonflip_private.wallet_daily_claims%rowtype; wallet moonflip_private.wallets%rowtype; accepted boolean; v_now timestamptz := now(); next_time timestamptz;
begin
  if p_operation is null or p_user is null then raise exception 'invalid daily claim'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation::text, 3));
  select * into prior from moonflip_private.wallet_daily_claims c where c.operation_id = p_operation;
  if found then
    if prior.discord_user_id <> p_user then raise exception 'claim id already used with different parameters'; end if;
    return query select prior.balance_after, false, prior.success, prior.available_at;
    return;
  end if;
  insert into moonflip_private.wallets(discord_user_id) values (p_user) on conflict (discord_user_id) do nothing;
  select * into wallet from moonflip_private.wallets w where w.discord_user_id = p_user for update;
  accepted := wallet.last_daily is null or wallet.last_daily <= v_now - interval '24 hours';
  if accepted then
    update moonflip_private.wallets w set balance = w.balance + 500, last_daily = v_now, updated_at = v_now
      where w.discord_user_id = p_user returning * into wallet;
  end if;
  next_time := wallet.last_daily + interval '24 hours';
  insert into moonflip_private.wallet_daily_claims(operation_id, discord_user_id, success, balance_after, available_at)
    values (p_operation, p_user, accepted, wallet.balance, next_time);
  return query select wallet.balance, true, accepted, next_time;
end $$;
revoke all on function moonflip_private.claim_wallet_daily(uuid, text) from public, anon, authenticated;
