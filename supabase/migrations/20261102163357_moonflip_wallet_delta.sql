create function moonflip_private.apply_wallet_delta(p_operation_id uuid, p_user_id text, p_kind text, p_delta bigint)
returns table(balance_after bigint, applied boolean)
language plpgsql security invoker set search_path = '' as $$
declare
  wallet_balance bigint;
  prior_user text;
  prior_kind text;
  prior_delta bigint;
  prior_balance bigint;
begin
  if p_operation_id is null or p_user_id is null or p_kind is null or p_kind = '' or p_delta is null then
    raise exception 'invalid wallet operation';
  end if;
  insert into moonflip_private.wallets(discord_user_id) values (p_user_id)
    on conflict (discord_user_id) do nothing;
  select w.balance into wallet_balance from moonflip_private.wallets w
    where w.discord_user_id = p_user_id for update;
  select o.discord_user_id, o.kind, o.delta, o.balance_after
    into prior_user, prior_kind, prior_delta, prior_balance
    from moonflip_private.wallet_operations o where o.operation_id = p_operation_id;
  if found then
    if prior_user <> p_user_id or prior_kind <> p_kind or prior_delta <> p_delta then
      raise exception 'operation id already used with different parameters';
    end if;
    return query select prior_balance, false;
    return;
  end if;
  if wallet_balance::numeric + p_delta::numeric < 0 then
    raise exception 'insufficient balance';
  end if;
  update moonflip_private.wallets w set balance = w.balance + p_delta, updated_at = now()
    where w.discord_user_id = p_user_id returning w.balance into wallet_balance;
  insert into moonflip_private.wallet_operations(operation_id, discord_user_id, kind, delta, balance_after)
    values (p_operation_id, p_user_id, p_kind, p_delta, wallet_balance);
  return query select wallet_balance, true;
end $$;
revoke all on function moonflip_private.apply_wallet_delta(uuid, text, text, bigint) from public, anon, authenticated;
