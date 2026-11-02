-- Uses reserved test IDs in a transaction and rolls back every change.
begin;
do $$
declare b bigint; a boolean; v_status text;
begin
  select balance_after, applied into b, a from moonflip_private.start_game_round(
    '00000000-0000-4000-8000-000000000201', '999999999999999993', 'mines', 200, '{"bombs":[1,2,3]}'::jsonb);
  if b <> 800 or not a then raise exception 'initial wager failed'; end if;
  select balance_after, applied into b, a from moonflip_private.start_game_round(
    '00000000-0000-4000-8000-000000000201', '999999999999999993', 'mines', 200, '{"bombs":[1,2,3]}'::jsonb);
  if b <> 800 or a then raise exception 'duplicate wager was not idempotent'; end if;
  begin
    perform moonflip_private.start_game_round('00000000-0000-4000-8000-000000000201', '999999999999999993', 'mines', 201, '{"bombs":[1,2,3]}'::jsonb);
    raise exception 'changed wager accepted';
  exception when others then
    if sqlerrm <> 'round id already used with different parameters' then raise; end if;
  end;
  select balance_after, applied into b, a from moonflip_private.settle_game_round(
    '00000000-0000-4000-8000-000000000201', '999999999999999993', 320);
  if b <> 1120 or not a then raise exception 'settlement failed'; end if;
  select balance_after, applied into b, a from moonflip_private.settle_game_round(
    '00000000-0000-4000-8000-000000000201', '999999999999999993', 320);
  if b <> 1120 or a then raise exception 'duplicate settlement was not idempotent'; end if;
  begin
    perform moonflip_private.settle_game_round('00000000-0000-4000-8000-000000000201', '999999999999999993', 321);
    raise exception 'changed settlement accepted';
  exception when others then
    if sqlerrm <> 'round already settled with different payout' then raise; end if;
  end;
  if (select total_bet from moonflip_private.wallets where discord_user_id = '999999999999999993') <> 200
     or (select total_won from moonflip_private.wallets where discord_user_id = '999999999999999993') <> 320
     or (select games_played from moonflip_private.wallets where discord_user_id = '999999999999999993') <> 1 then
    raise exception 'statistics incorrect';
  end if;
end $$;
rollback;
