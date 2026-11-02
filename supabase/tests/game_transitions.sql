-- All test records are rolled back.
begin;
do $$
declare v_version bigint; v_balance bigint; v_applied boolean;
begin
  perform moonflip_private.start_game_round('00000000-0000-4000-8000-000000000301', '999999999999999994', 'mines', 100, '{"revealed":[]}'::jsonb);
  select version, balance_after, applied into v_version, v_balance, v_applied
    from moonflip_private.advance_game_round('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000301', '999999999999999994', 0, '{"revealed":[4]}'::jsonb, null);
  if v_version <> 1 or v_balance <> 900 or not v_applied then raise exception 'advance failed'; end if;
  select version, balance_after, applied into v_version, v_balance, v_applied
    from moonflip_private.advance_game_round('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000301', '999999999999999994', 0, '{"revealed":[4]}'::jsonb, null);
  if v_version <> 1 or v_balance <> 900 or v_applied then raise exception 'advance retry failed'; end if;
  begin
    perform moonflip_private.advance_game_round('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000301', '999999999999999994', 0, '{"revealed":[5]}'::jsonb, null);
    raise exception 'stale version accepted';
  exception when others then if sqlerrm <> 'stale game state' then raise; end if; end;
  select version, balance_after, applied into v_version, v_balance, v_applied
    from moonflip_private.advance_game_round('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000301', '999999999999999994', 1, '{"revealed":[4],"cashout":true}'::jsonb, 125);
  if v_version <> 2 or v_balance <> 1025 or not v_applied then raise exception 'settlement failed'; end if;
  select version, balance_after, applied into v_version, v_balance, v_applied
    from moonflip_private.advance_game_round('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000301', '999999999999999994', 1, '{"revealed":[4],"cashout":true}'::jsonb, 125);
  if v_version <> 2 or v_balance <> 1025 or v_applied then raise exception 'settlement retry failed'; end if;
end $$;
rollback;
