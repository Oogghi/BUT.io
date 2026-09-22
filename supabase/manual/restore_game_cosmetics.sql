-- Restore game cosmetics without resetting existing accounts or statistics.
-- Run this entire file in Supabase SQL Editor as one transaction.
-- Re-running preserves existing equipment; premium avatars are a separate rollout.
begin;
set local lock_timeout = '5s';

-- Writes wait briefly while preservation checks and backfill run.
-- Lock in the same order as match reward writes; abort if locks take over 5s.
lock table public.match_history, public.game_stats, public.coin_transactions,
  public.player_wallets, public.player_cosmetics in share row exclusive mode;
create temporary table cosmetics_preserved_rows (
  table_name text primary key,
  data jsonb not null
) on commit drop;
do $guard$
declare
  target text;
  snapshot jsonb;
begin
  foreach target in array array['player_wallets','player_cosmetics','game_stats','match_history','coin_transactions']
  loop
    execute format(
      'select coalesce(jsonb_agg(row order by row::text), ''[]''::jsonb) from (select to_jsonb(t) - ''equipped_cosmetics'' as row from public.%I t) s',
      target
    ) into snapshot;
    insert into cosmetics_preserved_rows values (target, snapshot);
  end loop;
end;
$guard$;

-- Independent equipment slots let players combine a frame with game cosmetics.
-- Keep equipped_cosmetic as the frame-only API for older clients.
alter table public.player_wallets
  add column if not exists equipped_cosmetics jsonb not null default '{}'::jsonb
  check (jsonb_typeof(equipped_cosmetics) = 'object');

update public.player_wallets
set equipped_cosmetics = jsonb_set(equipped_cosmetics, '{frame}', to_jsonb(equipped_cosmetic))
where equipped_cosmetic is not null and not equipped_cosmetics ? 'frame';

alter table public.player_cosmetics
  drop constraint player_cosmetics_cosmetic_id_check,
  add constraint player_cosmetics_cosmetic_id_check check (cosmetic_id in (
    'coral-frame', 'mint-frame', 'sky-frame',
    'midnight-cards', 'sunset-cards', 'mint-cards',
    'velvet-deal', 'spiral-deal', 'snap-deal',
    'lightning-decal', 'star-decal', 'stripes-decal'
  ));

create or replace function private.cosmetic_catalog(p_cosmetic_id text)
returns table (slot text, price bigint)
language sql
immutable
set search_path = ''
as $$
  select catalog.slot, catalog.price
  from (values
    ('coral-frame', 'frame', 40::bigint),
    ('mint-frame', 'frame', 60::bigint),
    ('sky-frame', 'frame', 80::bigint),
    ('midnight-cards', 'card-back', 70::bigint),
    ('sunset-cards', 'card-back', 70::bigint),
    ('mint-cards', 'card-back', 70::bigint),
    ('velvet-deal', 'card-animation', 100::bigint),
    ('spiral-deal', 'card-animation', 120::bigint),
    ('snap-deal', 'card-animation', 100::bigint),
    ('lightning-decal', 'tank-decal', 90::bigint),
    ('star-decal', 'tank-decal', 90::bigint),
    ('stripes-decal', 'tank-decal', 90::bigint)
  ) as catalog(id, slot, price)
  where catalog.id = p_cosmetic_id;
$$;

revoke all on function private.cosmetic_catalog(text) from public, anon, authenticated;

create or replace function public.purchase_cosmetic(p_cosmetic_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  cosmetic_slot text;
  cosmetic_price bigint;
  wallet public.player_wallets;
begin
  if caller_id is null or not exists (
    select 1 from auth.users
    where id = caller_id and not coalesce(is_anonymous, false)
  ) then
    raise exception using errcode = 'P0001', message = 'not-authenticated';
  end if;

  select slot, price into cosmetic_slot, cosmetic_price
  from private.cosmetic_catalog(p_cosmetic_id);
  if cosmetic_slot is null then
    raise exception using errcode = 'P0001', message = 'cosmetic-not-found';
  end if;

  insert into public.player_wallets (user_id)
  values (caller_id)
  on conflict (user_id) do nothing;

  -- Serialize purchases and equipment changes before checking ownership.
  select * into wallet from public.player_wallets
  where user_id = caller_id for update;
  if exists (
    select 1 from public.player_cosmetics
    where user_id = caller_id and cosmetic_id = p_cosmetic_id
  ) then
    raise exception using errcode = 'P0001', message = 'cosmetic-owned';
  end if;
  if wallet.coins < cosmetic_price then
    raise exception using errcode = 'P0001', message = 'not-enough-coins';
  end if;

  if wallet.equipped_cosmetics ->> cosmetic_slot is null then
    wallet.equipped_cosmetics := jsonb_set(
      wallet.equipped_cosmetics, array[cosmetic_slot], to_jsonb(p_cosmetic_id)
    );
  end if;

  update public.player_wallets
  set coins = coins - cosmetic_price,
      equipped_cosmetics = wallet.equipped_cosmetics,
      equipped_cosmetic = wallet.equipped_cosmetics ->> 'frame',
      updated_at = timezone('utc', now())
  where user_id = caller_id
  returning * into wallet;

  insert into public.player_cosmetics (user_id, cosmetic_id)
  values (caller_id, p_cosmetic_id);

  return jsonb_build_object(
    'coins', wallet.coins,
    'equipped_cosmetic', wallet.equipped_cosmetic,
    'equipped_cosmetics', wallet.equipped_cosmetics
  );
end;
$$;

create or replace function public.set_cosmetic_slot(p_slot text, p_cosmetic_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  cosmetic_slot text;
  wallet public.player_wallets;
begin
  if caller_id is null or not exists (
    select 1 from auth.users
    where id = caller_id and not coalesce(is_anonymous, false)
  ) then
    raise exception using errcode = 'P0001', message = 'not-authenticated';
  end if;
  if p_slot is null or p_slot not in ('frame', 'card-back', 'card-animation', 'tank-decal') then
    raise exception using errcode = 'P0001', message = 'invalid-cosmetic-slot';
  end if;
  if p_cosmetic_id is not null then
    select slot into cosmetic_slot from private.cosmetic_catalog(p_cosmetic_id);
    if cosmetic_slot is null then
      raise exception using errcode = 'P0001', message = 'cosmetic-not-found';
    end if;
    if cosmetic_slot <> p_slot then
      raise exception using errcode = 'P0001', message = 'cosmetic-slot-mismatch';
    end if;
  end if;

  insert into public.player_wallets (user_id)
  values (caller_id)
  on conflict (user_id) do nothing;
  select * into wallet from public.player_wallets
  where user_id = caller_id for update;

  if p_cosmetic_id is not null and not exists (
    select 1 from public.player_cosmetics
    where user_id = caller_id and cosmetic_id = p_cosmetic_id
  ) then
    raise exception using errcode = 'P0001', message = 'cosmetic-not-owned';
  end if;

  wallet.equipped_cosmetics := case when p_cosmetic_id is null
    then wallet.equipped_cosmetics - p_slot
    else jsonb_set(wallet.equipped_cosmetics, array[p_slot], to_jsonb(p_cosmetic_id))
  end;
  update public.player_wallets
  set equipped_cosmetics = wallet.equipped_cosmetics,
      equipped_cosmetic = wallet.equipped_cosmetics ->> 'frame',
      updated_at = timezone('utc', now())
  where user_id = caller_id
  returning * into wallet;

  return jsonb_build_object(
    'coins', wallet.coins,
    'equipped_cosmetic', wallet.equipped_cosmetic,
    'equipped_cosmetics', wallet.equipped_cosmetics
  );
end;
$$;

create or replace function public.set_equipped_cosmetic(p_cosmetic_id text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select public.set_cosmetic_slot('frame', p_cosmetic_id);
$$;

revoke all on function public.purchase_cosmetic(text) from public, anon;
revoke all on function public.set_cosmetic_slot(text, text) from public, anon;
revoke all on function public.set_equipped_cosmetic(text) from public, anon;
grant execute on function public.purchase_cosmetic(text) to authenticated;
grant execute on function public.set_cosmetic_slot(text, text) to authenticated;
grant execute on function public.set_equipped_cosmetic(text) to authenticated;

-- Abort everything if any existing data (other than the new equipment map) changed.
do $guard$
declare
  saved record;
  current_data jsonb;
begin
  for saved in select * from cosmetics_preserved_rows
  loop
    execute format(
      'select coalesce(jsonb_agg(row order by row::text), ''[]''::jsonb) from (select to_jsonb(t) - ''equipped_cosmetics'' as row from public.%I t) s',
      saved.table_name
    ) into current_data;
    if current_data is distinct from saved.data then
      raise exception 'Cosmetics migration changed existing data in %. Rolling back.', saved.table_name;
    end if;
  end loop;
end;
$guard$;
commit;
