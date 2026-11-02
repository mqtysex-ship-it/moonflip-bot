create table moonflip_private.wallet_adjustments (
  operation_id uuid primary key,
  discord_user_id text not null references moonflip_private.wallets(discord_user_id),
  action text not null check (action in ('add','deduct','set')),
  amount bigint not null check (amount >= 0),
  old_balance bigint not null check (old_balance >= 0),
  new_balance bigint not null check (new_balance >= 0),
  created_at timestamptz not null default now()
);
alter table moonflip_private.wallet_adjustments enable row level security;
revoke all on moonflip_private.wallet_adjustments from public, anon, authenticated;
create function moonflip_private.adjust_wallet(p_operation uuid, p_user text, p_action text, p_amount bigint)
returns table(old_balance bigint, new_balance bigint, applied boolean)
language plpgsql security invoker set search_path = '' as $$
declare prior moonflip_private.wallet_adjustments%rowtype; old_value bigint; new_value bigint;
begin
  if p_operation is null or p_user is null or p_action is null or p_action not in ('add','deduct','set') or p_amount is null or p_amount < 0 then
    raise exception 'invalid wallet adjustment';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation::text, 5));
  select * into prior from moonflip_private.wallet_adjustments a where a.operation_id = p_operation;
  if found then
    if prior.discord_user_id <> p_user or prior.action <> p_action or prior.amount <> p_amount then
      raise exception 'adjustment id already used with different parameters';
    end if;
    return query select prior.old_balance, prior.new_balance, false;
    return;
  end if;
  insert into moonflip_private.wallets(discord_user_id) values (p_user) on conflict (discord_user_id) do nothing;
  select w.balance into old_value from moonflip_private.wallets w where w.discord_user_id = p_user for update;
  new_value := case p_action when 'add' then old_value + p_amount when 'deduct' then greatest(0, old_value - p_amount) else p_amount end;
  update moonflip_private.wallets w set balance = new_value, total_won = w.total_won + case when p_action = 'add' then p_amount else 0 end,
    updated_at = now() where w.discord_user_id = p_user;
  insert into moonflip_private.wallet_adjustments(operation_id, discord_user_id, action, amount, old_balance, new_balance)
    values (p_operation, p_user, p_action, p_amount, old_value, new_value);
  return query select old_value, new_value, true;
end $$;
revoke all on function moonflip_private.adjust_wallet(uuid, text, text, bigint) from public, anon, authenticated;
