begin;
do $$
declare b bigint; x bigint; l integer; bonus bigint; a boolean;
begin
  select balance_after, xp_after, level_after, token_bonus, applied into b, x, l, bonus, a
    from moonflip_private.add_wallet_xp('00000000-0000-4000-8000-000000000501', '999999999999999996', 100);
  if b <> 1100 or x <> 0 or l <> 2 or bonus <> 100 or not a then raise exception 'xp level reward failed'; end if;
  select balance_after, xp_after, level_after, token_bonus, applied into b, x, l, bonus, a
    from moonflip_private.add_wallet_xp('00000000-0000-4000-8000-000000000501', '999999999999999996', 100);
  if b <> 1100 or x <> 0 or l <> 2 or bonus <> 100 or a then raise exception 'xp retry credited twice'; end if;
  begin
    perform moonflip_private.add_wallet_xp('00000000-0000-4000-8000-000000000501', '999999999999999996', 101);
    raise exception 'mismatched xp accepted';
  exception when others then if sqlerrm <> 'xp id already used with different parameters' then raise; end if; end;
end $$;
rollback;
