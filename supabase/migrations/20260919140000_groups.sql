-- Persistent social groups are deliberately separate from Colyseus lobbies.
-- The browser can read rows allowed by RLS, but all lifecycle mutations go
-- through the authenticated RPCs below so membership invariants stay atomic.

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  leader_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default timezone('utc', now()),
  primary key (group_id, user_id),
  unique (user_id)
);

create table if not exists public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  invitee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (group_id, invitee_id)
);

create table if not exists public.group_lobby_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  leader_id uuid not null references auth.users(id) on delete cascade,
  lobby_code text not null,
  game_id text not null check (game_id in ('bomb-party', 'tank-arena')),
  game_name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default (timezone('utc', now()) + interval '2 hours'),
  unique (group_id, lobby_code)
);

create index if not exists group_members_user_id_idx
  on public.group_members (user_id);
create index if not exists group_invites_invitee_status_idx
  on public.group_invites (invitee_id, status);
create index if not exists group_lobby_invites_group_expiry_idx
  on public.group_lobby_invites (group_id, expires_at desc);

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.group_lobby_invites enable row level security;

-- This helper is intentionally tiny and pinned to an empty search path. It
-- avoids recursive RLS policies when a member reads the other members in the
-- same group.
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = p_group_id
      and user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_group_member(uuid) from public, anon;
grant execute on function private.is_group_member(uuid) to authenticated;

drop policy if exists "group members can read their group" on public.groups;
create policy "group members can read their group"
  on public.groups for select to authenticated
  using (private.is_group_member(id));

drop policy if exists "group members can read membership" on public.group_members;
create policy "group members can read membership"
  on public.group_members for select to authenticated
  using (private.is_group_member(group_id));

drop policy if exists "users can read their group invites" on public.group_invites;
create policy "users can read their group invites"
  on public.group_invites for select to authenticated
  using (
    invitee_id = (select auth.uid())
    or private.is_group_member(group_id)
  );

drop policy if exists "group members can read lobby invites" on public.group_lobby_invites;
create policy "group members can read lobby invites"
  on public.group_lobby_invites for select to authenticated
  using (
    private.is_group_member(group_id)
    and expires_at > timezone('utc', now())
  );

grant select on public.groups, public.group_members,
  public.group_invites, public.group_lobby_invites to authenticated;

create or replace function public.create_group()
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  next_code text;
  created_group public.groups;
begin
  if caller_id is null then
    raise exception using errcode = 'P0001', message = 'not-authenticated';
  end if;

  if exists (
    select 1 from public.group_members where user_id = caller_id
  ) then
    raise exception using errcode = 'P0001', message = 'already-in-group';
  end if;

  loop
    next_code := upper(substr(md5(random()::text), 1, 6));
    exit when not exists (
      select 1 from public.groups where code = next_code
    );
  end loop;

  insert into public.groups (code, leader_id)
  values (next_code, caller_id)
  returning * into created_group;

  insert into public.group_members (group_id, user_id)
  values (created_group.id, caller_id);

  return created_group;
end;
$$;

create or replace function public.join_group(p_code text)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  normalized_code text := upper(trim(p_code));
  target_group public.groups;
begin
  if caller_id is null then
    raise exception using errcode = 'P0001', message = 'not-authenticated';
  end if;
  if normalized_code !~ '^[A-Z0-9]{6}$' then
    raise exception using errcode = 'P0001', message = 'invalid-group-code';
  end if;
  if exists (
    select 1 from public.group_members where user_id = caller_id
  ) then
    raise exception using errcode = 'P0001', message = 'already-in-group';
  end if;

  select * into target_group
  from public.groups
  where code = normalized_code
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'group-not-found';
  end if;

  insert into public.group_members (group_id, user_id)
  values (target_group.id, caller_id);
  return target_group;
end;
$$;

create or replace function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  current_leader uuid;
  next_leader uuid;
begin
  if caller_id is null then
    raise exception using errcode = 'P0001', message = 'not-authenticated';
  end if;

  select leader_id into current_leader
  from public.groups
  where id = p_group_id
    and exists (
      select 1 from public.group_members
      where group_id = p_group_id and user_id = caller_id
    )
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'not-group-member';
  end if;

  if current_leader = caller_id then
    select user_id into next_leader
    from public.group_members
    where group_id = p_group_id and user_id <> caller_id
    order by joined_at, user_id
    limit 1;

    if next_leader is null then
      delete from public.groups where id = p_group_id;
      return;
    end if;

    update public.groups
    set leader_id = next_leader
    where id = p_group_id;
  end if;

  delete from public.group_members
  where group_id = p_group_id and user_id = caller_id;
end;
$$;

create or replace function public.remove_group_member(
  p_group_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception using errcode = 'P0001', message = 'not-authenticated';
  end if;
  if p_user_id = caller_id then
    raise exception using errcode = 'P0001', message = 'leader-cannot-remove-self';
  end if;
  if not exists (
    select 1 from public.groups
    where id = p_group_id and leader_id = caller_id
  ) then
    raise exception using errcode = 'P0001', message = 'leader-only';
  end if;
  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'member-not-found';
  end if;

  delete from public.group_members
  where group_id = p_group_id and user_id = p_user_id;
end;
$$;

create or replace function public.transfer_group_leadership(
  p_group_id uuid,
  p_new_leader_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
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
  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_new_leader_id
  ) then
    raise exception using errcode = 'P0001', message = 'member-not-found';
  end if;

  update public.groups
  set leader_id = p_new_leader_id
  where id = p_group_id;
end;
$$;

create or replace function public.create_group_invite(
  p_group_id uuid,
  p_invitee_id uuid
)
returns public.group_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  invitation public.group_invites;
begin
  if caller_id is null then
    raise exception using errcode = 'P0001', message = 'not-authenticated';
  end if;
  if caller_id = p_invitee_id then
    raise exception using errcode = 'P0001', message = 'self-invite';
  end if;
  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = caller_id
  ) then
    raise exception using errcode = 'P0001', message = 'not-group-member';
  end if;
  if exists (
    select 1 from public.group_members where user_id = p_invitee_id
  ) then
    raise exception using errcode = 'P0001', message = 'invitee-already-in-group';
  end if;
  if not exists (
    select 1 from auth.users where id = p_invitee_id
  ) then
    raise exception using errcode = 'P0001', message = 'invitee-not-found';
  end if;

  insert into public.group_invites (group_id, inviter_id, invitee_id, status)
  values (p_group_id, caller_id, p_invitee_id, 'pending')
  on conflict (group_id, invitee_id) do update
    set inviter_id = excluded.inviter_id,
        status = 'pending',
        updated_at = timezone('utc', now())
  returning * into invitation;
  return invitation;
end;
$$;

create or replace function public.respond_group_invite(
  p_invite_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  invitation public.group_invites;
begin
  if caller_id is null then
    raise exception using errcode = 'P0001', message = 'not-authenticated';
  end if;

  select * into invitation
  from public.group_invites
  where id = p_invite_id
    and invitee_id = caller_id
    and status = 'pending'
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'invite-not-found';
  end if;

  if p_accept then
    if exists (
      select 1 from public.group_members where user_id = caller_id
    ) then
      raise exception using errcode = 'P0001', message = 'already-in-group';
    end if;
    insert into public.group_members (group_id, user_id)
    values (invitation.group_id, caller_id);
    update public.group_invites
    set status = 'accepted', updated_at = timezone('utc', now())
    where id = invitation.id;
  else
    update public.group_invites
    set status = 'declined', updated_at = timezone('utc', now())
    where id = invitation.id;
  end if;
end;
$$;

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
  if p_game_id not in ('bomb-party', 'tank-arena') then
    raise exception using errcode = 'P0001', message = 'invalid-game';
  end if;
  if nullif(trim(p_lobby_code), '') is null then
    raise exception using errcode = 'P0001', message = 'invalid-lobby';
  end if;

  insert into public.group_lobby_invites (
    group_id, leader_id, lobby_code, game_id, game_name, created_at, expires_at
  )
  values (
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

revoke all on function public.create_group() from public, anon;
revoke all on function public.join_group(text) from public, anon;
revoke all on function public.leave_group(uuid) from public, anon;
revoke all on function public.remove_group_member(uuid, uuid) from public, anon;
revoke all on function public.transfer_group_leadership(uuid, uuid) from public, anon;
revoke all on function public.create_group_invite(uuid, uuid) from public, anon;
revoke all on function public.respond_group_invite(uuid, boolean) from public, anon;
revoke all on function public.publish_group_lobby_invite(uuid, text, text, text) from public, anon;

grant execute on function public.create_group() to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.transfer_group_leadership(uuid, uuid) to authenticated;
grant execute on function public.create_group_invite(uuid, uuid) to authenticated;
grant execute on function public.respond_group_invite(uuid, boolean) to authenticated;
grant execute on function public.publish_group_lobby_invite(uuid, text, text, text) to authenticated;

alter table public.groups replica identity full;
alter table public.group_members replica identity full;
alter table public.group_invites replica identity full;
alter table public.group_lobby_invites replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'groups'
  ) then
    alter publication supabase_realtime add table public.groups;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_members'
  ) then
    alter publication supabase_realtime add table public.group_members;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_invites'
  ) then
    alter publication supabase_realtime add table public.group_invites;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_lobby_invites'
  ) then
    alter publication supabase_realtime add table public.group_lobby_invites;
  end if;
end;
$$;
