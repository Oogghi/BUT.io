-- Expand match rewards without changing the browser's write permissions.
-- Only the trusted server can call record_match_result().

create or replace function public.record_match_result(
  p_match_id text,
  p_game_id text,
  p_winner_id uuid,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_duration_seconds integer,
  p_players jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
  player jsonb;
  player_id uuid;
  outcome text;
  player_stats jsonb;
  transaction_id uuid;
  rewards jsonb := '[]'::jsonb;
  reward_coins bigint;
begin
  if nullif(trim(p_match_id), '') is null
     or p_game_id not in ('bomb-party', 'tank-arena')
     or p_started_at is null
     or p_ended_at is null
     or p_ended_at < p_started_at
     or p_duration_seconds < 0
     or jsonb_typeof(p_players) <> 'array' then
    raise exception using errcode = 'P0001', message = 'invalid-match';
  end if;

  insert into public.match_history (
    server_match_id, game_id, winner_id, metadata, started_at, ended_at
  )
  values (
    p_match_id,
    p_game_id,
    p_winner_id,
    jsonb_build_object('participants', p_players),
    p_started_at,
    p_ended_at
  )
  on conflict do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 0 then
    return jsonb_build_object('recorded', false, 'rewards', '[]'::jsonb);
  end if;

  for player in select value from jsonb_array_elements(p_players)
  loop
    if jsonb_typeof(player) <> 'object'
       or coalesce(player->>'playerId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      continue;
    end if;
    player_id := (player->>'playerId')::uuid;
    if not exists (
      select 1 from auth.users
      where id = player_id and not coalesce(is_anonymous, false)
    ) then
      continue;
    end if;

    outcome := player->>'outcome';
    if outcome not in ('win', 'loss', 'draw') then
      continue;
    end if;
    player_stats := case
      when jsonb_typeof(player->'stats') = 'object' then player->'stats'
      else '{}'::jsonb
    end;

    insert into public.game_stats (
      user_id, game_id, games_played, wins, losses,
      playtime_seconds, metrics, updated_at
    )
    values (
      player_id,
      p_game_id,
      1,
      case when outcome = 'win' then 1 else 0 end,
      case when outcome = 'loss' then 1 else 0 end,
      p_duration_seconds,
      player_stats,
      timezone('utc', now())
    )
    on conflict (user_id, game_id) do update
    set games_played = coalesce(public.game_stats.games_played, 0) + 1,
        wins = coalesce(public.game_stats.wins, 0)
          + case when outcome = 'win' then 1 else 0 end,
        losses = coalesce(public.game_stats.losses, 0)
          + case when outcome = 'loss' then 1 else 0 end,
        playtime_seconds = coalesce(public.game_stats.playtime_seconds, 0)
          + p_duration_seconds,
        metrics = private.merge_numeric_metrics(public.game_stats.metrics, player_stats),
        updated_at = timezone('utc', now());

    reward_coins := case
      when coalesce(player->>'rewardCoins', '') ~ '^[0-9]+$'
        then least(50, (player->>'rewardCoins')::bigint)
      else 0
    end;

    if reward_coins > 0 then
      insert into public.coin_transactions (user_id, match_id, amount, reason)
      values (player_id, p_match_id, reward_coins, 'match_reward')
      on conflict (user_id, match_id, reason) do nothing
      returning id into transaction_id;
      if transaction_id is not null then
        insert into public.player_wallets (user_id, coins)
        values (player_id, reward_coins)
        on conflict (user_id) do update
        set coins = public.player_wallets.coins + reward_coins,
            updated_at = timezone('utc', now());
        rewards := rewards || jsonb_build_array(
          jsonb_build_object('user_id', player_id, 'coins_awarded', reward_coins)
        );
      end if;
      transaction_id := null;
    end if;
  end loop;

  return jsonb_build_object('recorded', true, 'rewards', rewards);
end;
$$;

revoke all on function public.record_match_result(
  text, text, uuid, timestamptz, timestamptz, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.record_match_result(
  text, text, uuid, timestamptz, timestamptz, integer, jsonb
) to service_role;
