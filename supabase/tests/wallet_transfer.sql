-- Execute against an isolated database; changes are rolled back.
begin;
do $$
declare v_sender bigint; v_receiver bigint; v_applied boolean;
begin
  select sender_balance, receiver_balance, applied into v_sender, v_receiver, v_applied
    from moonflip_private.transfer_wallet_tokens('00000000-0000-4000-8000-000000000101', '999999999999999991', '999999999999999992', 300);
  if v_sender <> 700 or v_receiver <> 1300 or not v_applied then raise exception 'transfer failed'; end if;
  select sender_balance, receiver_balance, applied into v_sender, v_receiver, v_applied
    from moonflip_private.transfer_wallet_tokens('00000000-0000-4000-8000-000000000101', '999999999999999991', '999999999999999992', 300);
  if v_sender <> 700 or v_receiver <> 1300 or v_applied then raise exception 'retry was not idempotent'; end if;
  begin
    perform moonflip_private.transfer_wallet_tokens('00000000-0000-4000-8000-000000000101', '999999999999999991', '999999999999999992', 301);
    raise exception 'mismatched retry accepted';
  exception when others then
    if sqlerrm <> 'transfer id already used with different parameters' then raise; end if;
  end;
  begin
    perform moonflip_private.transfer_wallet_tokens('00000000-0000-4000-8000-000000000102', '999999999999999991', '999999999999999992', 701);
    raise exception 'overdraft accepted';
  exception when others then
    if sqlerrm <> 'insufficient balance' then raise; end if;
  end;
  if (select balance from moonflip_private.wallets where discord_user_id = '999999999999999991') <> 700
    or (select balance from moonflip_private.wallets where discord_user_id = '999999999999999992') <> 1300 then
    raise exception 'failed transfer changed balances';
  end if;
end $$;
rollback;
