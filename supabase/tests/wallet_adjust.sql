begin;
do $$
declare previous bigint; current_balance bigint; was_applied boolean;
begin
  select old_balance, new_balance, applied into previous, current_balance, was_applied
    from moonflip_private.adjust_wallet('00000000-0000-4000-8000-000000000601', '999999999999999997', 'add', 200);
  if previous <> 1000 or current_balance <> 1200 or not was_applied then raise exception 'credit failed'; end if;
  select old_balance, new_balance, applied into previous, current_balance, was_applied
    from moonflip_private.adjust_wallet('00000000-0000-4000-8000-000000000601', '999999999999999997', 'add', 200);
  if previous <> 1000 or current_balance <> 1200 or was_applied then raise exception 'retry failed'; end if;
  begin
    perform moonflip_private.adjust_wallet('00000000-0000-4000-8000-000000000601', '999999999999999997', 'add', 201);
    raise exception 'changed retry accepted';
  exception when others then if sqlerrm <> 'adjustment id already used with different parameters' then raise; end if; end;
  select old_balance, new_balance, applied into previous, current_balance, was_applied
    from moonflip_private.adjust_wallet('00000000-0000-4000-8000-000000000602', '999999999999999997', 'deduct', 2000);
  if previous <> 1200 or current_balance <> 0 or not was_applied then raise exception 'clamped debit failed'; end if;
  select old_balance, new_balance, applied into previous, current_balance, was_applied
    from moonflip_private.adjust_wallet('00000000-0000-4000-8000-000000000603', '999999999999999997', 'set', 500);
  if previous <> 0 or current_balance <> 500 or not was_applied then raise exception 'set failed'; end if;
end $$;
rollback;
