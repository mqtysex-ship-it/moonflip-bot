create table moonflip_private.wallet_transfers (
  transfer_id uuid primary key,
  sender_id text not null references moonflip_private.wallets(discord_user_id),
  receiver_id text not null references moonflip_private.wallets(discord_user_id),
  amount bigint not null check (amount > 0),
  sender_balance bigint not null check (sender_balance >= 0),
  receiver_balance bigint not null check (receiver_balance >= 0),
  created_at timestamptz not null default now(),
  check (sender_id <> receiver_id)
);
alter table moonflip_private.wallet_transfers enable row level security;
revoke all on moonflip_private.wallet_transfers from public, anon, authenticated;

create function moonflip_private.transfer_wallet_tokens(p_id uuid, p_sender text, p_receiver text, p_amount bigint)
returns table(sender_balance bigint, receiver_balance bigint, applied boolean)
language plpgsql security invoker set search_path = '' as $$
declare
  existing moonflip_private.wallet_transfers%rowtype;
  sender_current bigint;
  receiver_current bigint;
begin
  if p_id is null or p_sender is null or p_receiver is null or p_sender = p_receiver or p_amount is null or p_amount <= 0 then
    raise exception 'invalid transfer';
  end if;
  -- Serialize retries even if they refer to different wallets.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text, 0));
  select * into existing from moonflip_private.wallet_transfers t where t.transfer_id = p_id;
  if found then
    if existing.sender_id <> p_sender or existing.receiver_id <> p_receiver or existing.amount <> p_amount then
      raise exception 'transfer id already used with different parameters';
    end if;
    return query select existing.sender_balance, existing.receiver_balance, false;
    return;
  end if;
  -- Create and lock wallets in a consistent order to avoid opposing-transfer deadlocks.
  insert into moonflip_private.wallets(discord_user_id)
    select id from (values (p_sender), (p_receiver)) as u(id) order by id
    on conflict (discord_user_id) do nothing;
  perform 1 from moonflip_private.wallets w where w.discord_user_id in (p_sender, p_receiver)
    order by w.discord_user_id for update;
  select w.balance into sender_current from moonflip_private.wallets w where w.discord_user_id = p_sender;
  if sender_current < p_amount then raise exception 'insufficient balance'; end if;
  update moonflip_private.wallets w set balance = w.balance - p_amount, updated_at = now()
    where w.discord_user_id = p_sender returning w.balance into sender_current;
  update moonflip_private.wallets w set balance = w.balance + p_amount, updated_at = now()
    where w.discord_user_id = p_receiver returning w.balance into receiver_current;
  insert into moonflip_private.wallet_transfers(transfer_id, sender_id, receiver_id, amount, sender_balance, receiver_balance)
    values (p_id, p_sender, p_receiver, p_amount, sender_current, receiver_current);
  return query select sender_current, receiver_current, true;
end $$;
revoke all on function moonflip_private.transfer_wallet_tokens(uuid, text, text, bigint) from public, anon, authenticated;
