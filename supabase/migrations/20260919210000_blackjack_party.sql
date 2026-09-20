-- Blackjack Party adds server-only rebuys and authoritative match stats.

alter table public.group_lobby_invites
  drop constraint if exists group_lobby_invites_game_id_check;
alter table public.group_lobby_invites
  add constraint group_lobby_invites_game_id_check
  check (game_id in ('bomb-party', 'tank-arena', 'blackjack-party'));

create table if not exists private.blackjack_rebuys (
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id text not null,
  rebuy_number integer not null check (rebuy_number > 0),
  cost bigint not null check (cost > 0),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, match_id, rebuy_number)
);

alter table private.blackjack_rebuys enable row level security;
revoke all on table private.blackjack_rebuys from public, anon, authenticated;

create or replace function public.spend_blackjack_rebuy(
  p_user_id uuid,
  p_match_id text,
  p_rebuy_number integer,
  p_cost bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  wallet public.player_wallets;
begin
  if p_user_id is null
     or nullif(trim(p_match_id), '') is null
     or p_rebuy_number < 1
     or p_cost < 1
     or not exists (
       select 1 from auth.users
       where id = p_user_id and not coalesce(is_anonymous, false)
     ) then
    raise exception using errcode = 'P0001', message = 'invalid-rebuy';
  end if;

  insert into public.player_wallets (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select * into wallet
  from public.player_wallets
  where user_id = p_user_id
  for update;

  if exists (
    select 1 from private.blackjack_rebuys
    where user_id = p_user_id
      and match_id = p_match_id
      and rebuy_number = p_rebuy_number
  ) then
    return jsonb_build_object('coins', wallet.coins, 'recorded', false);
  end if;
  if wallet.coins < p_cost then
    raise exception using errcode = 'P0001', message = 'not-enough-coins';
  end if;

  update public.player_wallets
  set coins = coins - p_cost,
      updated_at = timezone('utc', now())
  where user_id = p_user_id
  returning * into wallet;

  insert into private.blackjack_rebuys (
    user_id, match_id, rebuy_number, cost
  ) values (
    p_user_id, p_match_id, p_rebuy_number, p_cost
  );

  return jsonb_build_object('coins', wallet.coins, 'recorded', true);
end;
$$;

revoke all on function public.spend_blackjack_rebuy(uuid, text, integer, bigint)
  from public, anon, authenticated;
grant execute on function public.spend_blackjack_rebuy(uuid, text, integer, bigint)
  to service_role;

create or replace function public.publish_group_lobby_invite(
  p_group_id uuid,
  p_lobby_code text,
  p_game_id text,
  p_game_name text
)
returns public.group_lobby_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  invitation public.group_lobby_invites;
begin
  if caller_id is null then
    raise exception using errcode = 'P0001', message = 'not-authenticated';
  end if;
  if not exists (
    select 1 from public.groups
    where id = p_group_id and leader_id = caller_id
  ) then
    raise exception using errcode = 'P0001', message = 'leader-only';
  end if;
  if p_game_id not in ('bomb-party', 'tank-arena', 'blackjack-party') then
    raise exception using errcode = 'P0001', message = 'invalid-game';
  end if;
  if nullif(trim(p_lobby_code), '') is null then
    raise exception using errcode = 'P0001', message = 'invalid-lobby';
  end if;

  insert into public.group_lobby_invites (
    group_id, leader_id, lobby_code, game_id, game_name, created_at, expires_at
  ) values (
    p_group_id,
    caller_id,
    upper(trim(p_lobby_code)),
    p_game_id,
    trim(p_game_name),
    timezone('utc', now()),
    timezone('utc', now()) + interval '2 hours'
  )
  on conflict (group_id, lobby_code) do update
    set leader_id = excluded.leader_id,
        game_id = excluded.game_id,
        game_name = excluded.game_name,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at
  returning * into invitation;
  return invitation;
end;
$$;

revoke all on function public.publish_group_lobby_invite(uuid, text, text, text)
  from public, anon;
grant execute on function public.publish_group_lobby_invite(uuid, text, text, text)
  to authenticated;

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
     or p_game_id not in ('bomb-party', 'tank-arena', 'blackjack-party')
     or p_started_at is null
     or p_ended_at is null
     or p_ended_at < p_started_at
     or p_duration_seconds < 0
     or jsonb_typeof(p_players) <> 'array' then
    raise exception using errcode = 'P0001', message = 'invalid-match';
  end if;

  insert into public.match_history (
    server_match_id, game_id, winner_id, metadata, started_at, ended_at
  ) values (
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
    ) values (
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
        metrics = case
          when p_game_id = 'blackjack-party' then
            jsonb_set(
              private.merge_numeric_metrics(
                public.game_stats.metrics,
                excluded.metrics - 'highestEndingChipBalance'
              ),
              '{highestEndingChipBalance}',
              to_jsonb(greatest(
                case
                  when jsonb_typeof(public.game_stats.metrics->'highestEndingChipBalance') = 'number'
                    then (public.game_stats.metrics->>'highestEndingChipBalance')::numeric
                  else 0
                end,
                case
                  when jsonb_typeof(excluded.metrics->'highestEndingChipBalance') = 'number'
                    then (excluded.metrics->>'highestEndingChipBalance')::numeric
                  else 0
                end
              )),
              true
            )
          else private.merge_numeric_metrics(
            public.game_stats.metrics,
            excluded.metrics
          )
        end,
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
