-- The wallet row is already locked by start_game_round. Lock it here too
-- so other INSERT callers cannot bypass the single-active-round check.
create function moonflip_private.require_single_active_round()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from moonflip_private.wallets w where w.discord_user_id = new.discord_user_id for update;
  if exists (
    select 1 from moonflip_private.game_rounds r
    where r.discord_user_id = new.discord_user_id and r.game_type = new.game_type and r.status = 'active'
  ) then
    raise exception using errcode = '23505', message = 'An active round already exists';
  end if;
  return new;
end $$;

revoke all on function moonflip_private.require_single_active_round() from public, anon, authenticated;

create trigger require_single_active_round
before insert on moonflip_private.game_rounds
for each row
when (new.status = 'active' and new.game_type in ('blackjack', 'crash'))
execute function moonflip_private.require_single_active_round();
