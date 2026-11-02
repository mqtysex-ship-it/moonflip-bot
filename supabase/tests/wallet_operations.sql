-- Run only against an isolated database. All inserted rows are rolled back.
begin;
do $$
declare v_balance bigint; v_applied boolean; operation_count integer;
begin
  select balance_after, applied into v_balance, v_applied
    from moonflip_private.apply_wallet_delta('00000000-0000-4000-8000-000000000002', '999999999999999998', 'credit', 250);
  if v_balance <> 1250 or not v_applied then raise exception 'initial credit failed'; end if;
  select balance_after, applied into v_balance, v_applied
    from moonflip_private.apply_wallet_delta('00000000-0000-4000-8000-000000000002', '999999999999999998', 'credit', 250);
  if v_balance <> 1250 or v_applied then raise exception 'retry was not idempotent'; end if;
  begin
    perform moonflip_private.apply_wallet_delta('00000000-0000-4000-8000-000000000002', '999999999999999998', 'credit', 300);
    raise exception 'duplicate ID with changed amount was accepted';
  exception when others then
    if sqlerrm <> 'operation id already used with different parameters' then raise; end if;
  end;
  begin
    perform moonflip_private.apply_wallet_delta('00000000-0000-4000-8000-000000000003', '999999999999999998', 'bet', -1251);
    raise exception 'overdraft was accepted';
  exception when others then
    if sqlerrm <> 'insufficient balance' then raise; end if;
  end;
  select count(*) into operation_count from moonflip_private.wallet_operations where discord_user_id = '999999999999999998';
  if operation_count <> 1 then raise exception 'unexpected journal count'; end if;
end $$;
rollback;
