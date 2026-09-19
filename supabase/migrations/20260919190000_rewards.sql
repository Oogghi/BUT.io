-- Wallets and cosmetics are persistent account data. Match results are written
-- only by the trusted Colyseus server through record_match_result().

alter table public.match_history
  add column if not exists server_match_id text;

create unique index if not exists match_history_server_match_id_idx
  on public.match_history (server_match_id)
  where server_match_id is not null;

create unique index if not exists game_stats_user_game_idx
  on public.game_stats (user_id, game_id);

create table if not exists public.player_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  coins bigint not null default 0 check (coins >= 0),
  equipped_cosmetic text,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.player_cosmetics (
  user_id uuid not null references auth.users(id) on delete cascade,
  cosmetic_id text not null check (cosmetic_id in ('coral-frame', 'mint-frame', 'sky-frame')),
  purchased_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, cosmetic_id)
);

create table if not exists public.coin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id text not null,
  amount bigint not null check (amount > 0),
  reason text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, match_id, reason)
);

alter table public.player_wallets enable row level security;
alter table public.player_cosmetics enable row level security;
alter table public.coin_transactions enable row level security;

drop policy if exists "users can read their wallet" on public.player_wallets;
create policy "users can read their wallet"
  on public.player_wallets for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users can read their cosmetics" on public.player_cosmetics;
create policy "users can read their cosmetics"
  on public.player_cosmetics for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.player_wallets, public.player_cosmetics to authenticated;

create schema if not exists private;

create or replace function private.merge_numeric_metrics(
  p_current jsonb,
  p_incoming jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  result jsonb := case
    when jsonb_typeof(p_current) = 'object' then p_current
    else '{}'::jsonb
  end;
  entry record;
begin
  if jsonb_typeof(p_incoming) <> 'object' then
    return result;
  end if;

  for entry in select key, value from jsonb_each(p_incoming)
  loop
    if jsonb_typeof(entry.value) = 'number' then
      result := jsonb_set(
        result,
        array[entry.key],
        to_jsonb(coalesce((result ->> entry.key)::numeric, 0) + (entry.value #>> '{}')::numeric),
        true
      );
    end if;
  end loop;
  return result;
end;
$$;

revoke all on function private.merge_numeric_metrics(jsonb, jsonb) from public, anon, authenticated;
grant execute on function private.merge_numeric_metrics(jsonb, jsonb) to service_role;

create or replace function public.purchase_cosmetic(p_cosmetic_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  price bigint;
  wallet public.player_wallets;
begin
  if caller_id is null or not exists (
    select 1 from auth.users
    where id = caller_id and not coalesce(is_anonymous, false)
  ) then
    raise exception using errcode = 'P0001', message = 'not-authenticated';
  end if;

  price := case p_cosmetic_id
    when 'coral-frame' then 40
    when 'mint-frame' then 60
    when 'sky-frame' then 80
    else null
  end;
  if price is null then
    raise exception using errcode = 'P0001', message = 'cosmetic-not-found';
  end if;

  insert into public.player_wallets (user_id)
  values (caller_id)
  on conflict (user_id) do nothing;

  if exists (
    select 1 from public.player_cosmetics
    where user_id = caller_id and cosmetic_id = p_cosmetic_id
  ) then
    raise exception using errcode = 'P0001', message = 'cosmetic-owned';
  end if;

  select * into wallet
  from public.player_wallets
  where user_id = caller_id
  for update;
  if wallet.coins < price then
    raise exception using errcode = 'P0001', message = 'not-enough-coins';
  end if;

  update public.player_wallets
  set coins = coins - price,
      equipped_cosmetic = coalesce(equipped_cosmetic, p_cosmetic_id),
      updated_at = timezone('utc', now())
  where user_id = caller_id
  returning * into wallet;

  insert into public.player_cosmetics (user_id, cosmetic_id)
  values (caller_id, p_cosmetic_id);

  return jsonb_build_object(
    'coins', wallet.coins,
    'equipped_cosmetic', wallet.equipped_cosmetic
  );
end;
$$;

create or replace function public.set_equipped_cosmetic(p_cosmetic_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  wallet public.player_wallets;
begin
  if caller_id is null or not exists (
    select 1 from auth.users
    where id = caller_id and not coalesce(is_anonymous, false)
  ) then
    raise exception using errcode = 'P0001', message = 'not-authenticated';
  end if;
  if p_cosmetic_id is not null and p_cosmetic_id not in (
    'coral-frame', 'mint-frame', 'sky-frame'
  ) then
    raise exception using errcode = 'P0001', message = 'cosmetic-not-found';
  end if;
  if p_cosmetic_id is not null and not exists (
    select 1 from public.player_cosmetics
    where user_id = caller_id and cosmetic_id = p_cosmetic_id
  ) then
    raise exception using errcode = 'P0001', message = 'cosmetic-not-owned';
  end if;

  insert into public.player_wallets (user_id)
  values (caller_id)
  on conflict (user_id) do nothing;
  update public.player_wallets
  set equipped_cosmetic = p_cosmetic_id,
      updated_at = timezone('utc', now())
  where user_id = caller_id
  returning * into wallet;

  return jsonb_build_object(
    'coins', wallet.coins,
    'equipped_cosmetic', wallet.equipped_cosmetic
  );
end;
$$;

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
  reward_coins bigint := 25;
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

    if outcome = 'win' then
      insert into public.coin_transactions (user_id, match_id, amount, reason)
      values (player_id, p_match_id, reward_coins, 'match_win')
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

revoke all on function public.purchase_cosmetic(text) from public, anon;
revoke all on function public.set_equipped_cosmetic(text) from public, anon;
revoke all on function public.record_match_result(
  text, text, uuid, timestamptz, timestamptz, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.purchase_cosmetic(text) to authenticated;
grant execute on function public.set_equipped_cosmetic(text) to authenticated;
grant execute on function public.record_match_result(
  text, text, uuid, timestamptz, timestamptz, integer, jsonb
) to service_role;
