-- Run after premium_avatar_cosmetics on a local DB with a non-anonymous user.
-- Fixture writes are rolled back, including on assertion failure.
do $$
declare
  account_id uuid;
  wallet_before jsonb;
  cosmetics_before jsonb;
  result jsonb;
  other_slots jsonb := '{"frame":"coral-frame","card-back":"midnight-cards","card-animation":"spiral-deal","tank-decal":"star-decal"}';
  expected_slots jsonb;
  expected_balance bigint := 1000;
  item record;
begin
  assert not has_function_privilege('anon', 'public.purchase_cosmetic(text)', 'execute');
  assert not has_function_privilege('anon', 'public.set_cosmetic_slot(text,text)', 'execute');
  assert has_function_privilege('authenticated', 'public.purchase_cosmetic(text)', 'execute');
  assert has_function_privilege('authenticated', 'public.set_cosmetic_slot(text,text)', 'execute');
  select id into account_id from auth.users
  where not coalesce(is_anonymous, false) limit 1;
  assert account_id is not null, 'A non-anonymous user is required for this rollback test';
  select to_jsonb(w) into wallet_before from public.player_wallets w where user_id = account_id;
  select jsonb_agg(to_jsonb(c) order by cosmetic_id) into cosmetics_before
  from public.player_cosmetics c where user_id = account_id;

  begin
    perform set_config('request.jwt.claim.sub', account_id::text, true);
    delete from public.player_cosmetics where user_id = account_id;
    insert into public.player_cosmetics (user_id, cosmetic_id)
    select account_id, value from jsonb_each_text(other_slots);
    insert into public.player_wallets (user_id, coins, equipped_cosmetic, equipped_cosmetics)
    values (account_id, expected_balance, 'coral-frame', other_slots)
    on conflict (user_id) do update set coins = excluded.coins,
      equipped_cosmetic = excluded.equipped_cosmetic, equipped_cosmetics = excluded.equipped_cosmetics;

    begin
      perform public.set_cosmetic_slot('avatar', 'royal-avatar');
      assert false, 'An unowned premium avatar must be rejected';
    exception when sqlstate 'P0001' then
      assert sqlerrm = 'cosmetic-not-owned';
    end;
    begin
      perform public.set_cosmetic_slot('avatar', 'coral-frame');
      assert false, 'A frame cannot occupy the avatar slot';
    exception when sqlstate 'P0001' then
      assert sqlerrm = 'cosmetic-slot-mismatch';
    end;

    expected_slots := other_slots || '{"avatar":"royal-avatar"}'::jsonb;
    for item in select * from (values
      ('royal-avatar', 120), ('astronaut-avatar', 160),
      ('wizard-avatar', 140), ('robot-avatar', 160)
    ) as avatars(id, price)
    loop
      result := public.purchase_cosmetic(item.id);
      expected_balance := expected_balance - item.price;
      assert (result->>'coins')::bigint = expected_balance, 'Incorrect avatar price';
      assert result->'equipped_cosmetics' = expected_slots, 'Only the first avatar purchase should auto-equip';
      assert result->>'equipped_cosmetic' = 'coral-frame', 'Avatar purchase changed the legacy frame';
      assert exists (select 1 from public.player_cosmetics where user_id = account_id and cosmetic_id = item.id);
    end loop;
    assert expected_balance = 420;

    begin
      perform public.purchase_cosmetic('royal-avatar');
      assert false, 'Duplicate avatar purchase must be rejected';
    exception when sqlstate 'P0001' then
      assert sqlerrm = 'cosmetic-owned';
    end;
    begin
      perform public.set_equipped_cosmetic('royal-avatar');
      assert false, 'Legacy equip must remain frame-only';
    exception when sqlstate 'P0001' then
      assert sqlerrm = 'cosmetic-slot-mismatch';
    end;

    result := public.set_cosmetic_slot('avatar', 'astronaut-avatar');
    assert result->'equipped_cosmetics' = other_slots || '{"avatar":"astronaut-avatar"}'::jsonb;
    result := public.set_cosmetic_slot('avatar', null);
    assert result->'equipped_cosmetics' = other_slots, 'Clearing avatar changed another slot';
    result := public.set_cosmetic_slot('avatar', 'wizard-avatar');
    expected_slots := other_slots || '{"avatar":"wizard-avatar"}'::jsonb;
    assert result->'equipped_cosmetics' = expected_slots;
    assert (result->>'coins')::bigint = expected_balance, 'Equip/reset must not charge coins';
    assert result->>'equipped_cosmetic' = 'coral-frame';

    result := public.set_equipped_cosmetic(null);
    assert result->'equipped_cosmetics' = expected_slots - 'frame', 'Legacy frame reset removed the avatar';
    result := public.set_equipped_cosmetic('coral-frame');
    assert result->'equipped_cosmetics' = expected_slots;

    delete from public.player_cosmetics where user_id = account_id and cosmetic_id = 'robot-avatar';
    update public.player_wallets set coins = 159 where user_id = account_id;
    begin
      perform public.purchase_cosmetic('robot-avatar');
      assert false, 'Insufficient coins must reject avatar purchase';
    exception when sqlstate 'P0001' then
      assert sqlerrm = 'not-enough-coins';
    end;
    assert (select coins from public.player_wallets where user_id = account_id) = 159;
    assert (select equipped_cosmetics from public.player_wallets where user_id = account_id) = expected_slots;
    assert not exists (select 1 from public.player_cosmetics where user_id = account_id and cosmetic_id = 'robot-avatar');

    -- A later purchase auto-equips when the avatar slot was deliberately cleared.
    perform public.set_cosmetic_slot('avatar', null);
    update public.player_wallets set coins = 160 where user_id = account_id;
    result := public.purchase_cosmetic('robot-avatar');
    assert result->'equipped_cosmetics' = other_slots || '{"avatar":"robot-avatar"}'::jsonb;
    assert (result->>'coins')::bigint = 0;

    perform set_config('request.jwt.claim.sub', '', true);
    begin
      perform public.set_cosmetic_slot('avatar', null);
      assert false, 'Unauthenticated avatar changes must be rejected';
    exception when sqlstate 'P0001' then
      assert sqlerrm = 'not-authenticated';
    end;
    raise exception using errcode = 'ZP001', message = 'Roll back successful premium avatar test';
  exception when sqlstate 'ZP001' then null;
  end;

  assert (select to_jsonb(w) from public.player_wallets w where user_id = account_id)
    is not distinct from wallet_before, 'Wallet fixture was not rolled back';
  assert (select jsonb_agg(to_jsonb(c) order by cosmetic_id) from public.player_cosmetics c where user_id = account_id)
    is not distinct from cosmetics_before, 'Ownership fixture was not rolled back';
end;
$$;
