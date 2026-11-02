begin;
do $$
declare b bigint; a boolean; ok boolean;
begin
  select balance_after, applied, success into b, a, ok from moonflip_private.claim_wallet_daily('00000000-0000-4000-8000-000000000401', '999999999999999995');
  if b <> 1500 or not a or not ok then raise exception 'daily failed'; end if;
  select balance_after, applied, success into b, a, ok from moonflip_private.claim_wallet_daily('00000000-0000-4000-8000-000000000401', '999999999999999995');
  if b <> 1500 or a or not ok then raise exception 'daily retry failed'; end if;
  select balance_after, applied, success into b, a, ok from moonflip_private.claim_wallet_daily('00000000-0000-4000-8000-000000000402', '999999999999999995');
  if b <> 1500 or not a or ok then raise exception 'daily cooldown failed'; end if;
  if (select balance from moonflip_private.wallets where discord_user_id = '999999999999999995') <> 1500 then raise exception 'daily credited twice'; end if;
end $$;
rollback;
