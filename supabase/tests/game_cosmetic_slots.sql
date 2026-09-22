-- Run after game_cosmetic_slots on a local DB with a non-anonymous user.
-- All fixture changes are rolled back, including on assertion failure.
do $$
declare
  account_id uuid;
  wallet_before jsonb;
  cosmetics_before jsonb;
  result jsonb;
  expected_slots jsonb := '{}'::jsonb;
  expected_balance bigint := 2000;
  item record;
begin
  assert not has_function_privilege('anon', 'public.purchase_cosmetic(text)', 'execute');
  assert not has_function_privilege('anon', 'public.set_cosmetic_slot(text,text)', 'execute');
  assert not has_function_privilege('anon', 'public.set_equipped_cosmetic(text)', 'execute');
  assert has_function_privilege('authenticated', 'public.purchase_cosmetic(text)', 'execute');
  assert has_function_privilege('authenticated', 'public.set_cosmetic_slot(text,text)', 'execute');
  assert has_function_privilege('authenticated', 'public.set_equipped_cosmetic(text)', 'execute');

  select id into account_id from auth.users
  where not coalesce(is_anonymous, false) limit 1;
  assert account_id is not null, 'A non-anonymous user is required for this rollback test';
  select to_jsonb(w) into wallet_before from public.player_wallets w where user_id = account_id;
  select jsonb_agg(to_jsonb(c) order by cosmetic_id) into cosmetics_before
  from public.player_cosmetics c where user_id = account_id;

  begin
    perform set_config('request.jwt.claim.sub', account_id::text, true);
    delete from public.player_cosmetics where user_id = account_id;
    insert into public.player_wallets (user_id, coins, equipped_cosmetic, equipped_cosmetics)
    values (account_id, expected_balance, null, '{}'::jsonb)
    on conflict (user_id) do update set coins = excluded.coins,
      equipped_cosmetic = null, equipped_cosmetics = '{}'::jsonb;

    begin
      perform public.set_cosmetic_slot('card-back', 'midnight-cards');
      assert false, 'Unowned cosmetics must be rejected';
    exception when sqlstate 'P0001' then
      assert sqlerrm = 'cosmetic-not-owned';
    end;
    begin
      perform public.set_cosmetic_slot('unknown', null);
      assert false, 'Unknown slots must be rejected';
    exception when sqlstate 'P0001' then
      assert sqlerrm = 'invalid-cosmetic-slot';
    end;
    begin
      perform public.set_cosmetic_slot(null, null);
      assert false, 'Null slots must be rejected';
    exception when sqlstate 'P0001' then
      assert sqlerrm = 'invalid-cosmetic-slot';
    end;
    begin
      perform public.purchase_cosmetic('unknown');
      assert false, 'Unknown cosmetics must be rejected';
    exception when sqlstate 'P0001' then
      assert sqlerrm = 'cosmetic-not-found';
    end;
    begin
      perform public.purchase_cosmetic(null);
      assert false, 'Null purchase IDs must be rejected';
    exception when sqlstate 'P0001' then
      assert sqlerrm = 'cosmetic-not-found';
    end;
    assert (select coins from public.player_wallets where user_id = account_id) = expected_balance;

    -- Prices are intentionally specified independently from the DB catalog.
    for item in select * from (values
      ('coral-frame', 'frame', 40), ('mint-frame', 'frame', 60), ('sky-frame', 'frame', 80),
      ('midnight-cards', 'card-back', 70), ('sunset-cards', 'card-back', 70), ('mint-cards', 'card-back', 70),
      ('velvet-deal', 'card-animation', 100), ('spiral-deal', 'card-animation', 120), ('snap-deal', 'card-animation', 100),
      ('lightning-decal', 'tank-decal', 90), ('star-decal', 'tank-decal', 90), ('stripes-decal', 'tank-decal', 90)
    ) as items(id, slot, price)
    loop
      result := public.purchase_cosmetic(item.id);
      expected_balance := expected_balance - item.price;
      if not expected_slots ? item.slot then
        expected_slots := jsonb_set(expected_slots, array[item.slot], to_jsonb(item.id));
      end if;
      assert (result->>'coins')::bigint = expected_balance, 'Incorrect cosmetic price';
      assert result->'equipped_cosmetics' = expected_slots, 'Purchase changed another slot or replaced equipment';
      assert result->>'equipped_cosmetic' = 'coral-frame', 'Legacy frame was changed by a game cosmetic';
      assert exists (select 1 from public.player_cosmetics where user_id = account_id and cosmetic_id = item.id);
    end loop;

    begin
      perform public.purchase_cosmetic('spiral-deal');
      assert false, 'Duplicate purchase must be rejected';
    exception when sqlstate 'P0001' then
      assert sqlerrm = 'cosmetic-owned';
    end;
    assert (select coins from public.player_wallets where user_id = account_id) = expected_balance;
    begin
      perform public.set_cosmetic_slot('tank-decal', 'spiral-deal');
      assert false, 'Cross-slot equipment must be rejected';
    exception when sqlstate 'P0001' then
      assert sqlerrm = 'cosmetic-slot-mismatch';
    end;
    begin
      perform public.set_equipped_cosmetic('midnight-cards');
      assert false, 'Legacy RPC must remain frame-only';
    exception when sqlstate 'P0001' then
      assert sqlerrm = 'cosmetic-slot-mismatch';
    end;

    result := public.set_cosmetic_slot('card-animation', 'spiral-deal');
    expected_slots := jsonb_set(expected_slots, '{card-animation}', '"spiral-deal"');
    assert result->'equipped_cosmetics' = expected_slots;
    result := public.set_cosmetic_slot('tank-decal', null);
    expected_slots := expected_slots - 'tank-decal';
    assert result->'equipped_cosmetics' = expected_slots, 'Reset affected another slot';
    result := public.set_equipped_cosmetic('sky-frame');
    expected_slots := jsonb_set(expected_slots, '{frame}', '"sky-frame"');
    assert result->'equipped_cosmetics' = expected_slots;
    assert result->>'equipped_cosmetic' = 'sky-frame';
    result := public.set_equipped_cosmetic(null);
    expected_slots := expected_slots - 'frame';
    assert result->'equipped_cosmetics' = expected_slots;
    assert result->'equipped_cosmetic' = 'null'::jsonb;
    assert (result->>'coins')::bigint = expected_balance, 'Equipment changes charged coins';
    assert (select equipped_cosmetics from public.player_wallets where user_id = account_id) = expected_slots;

    -- A failed purchase must change neither ownership nor equipment nor balance.
    delete from public.player_cosmetics where user_id = account_id and cosmetic_id = 'star-decal';
    update public.player_wallets set coins = 89 where user_id = account_id;
    begin
      perform public.purchase_cosmetic('star-decal');
      assert false, 'Insufficient balance must be rejected';
    exception when sqlstate 'P0001' then
      assert sqlerrm = 'not-enough-coins';
    end;
    assert (select coins from public.player_wallets where user_id = account_id) = 89;
    assert not exists (select 1 from public.player_cosmetics where user_id = account_id and cosmetic_id = 'star-decal');
    assert (select equipped_cosmetics from public.player_wallets where user_id = account_id) = expected_slots;

    perform set_config('request.jwt.claim.sub', '', true);
    begin
      perform public.purchase_cosmetic('star-decal');
      assert false, 'Unauthenticated purchases must be rejected';
    exception when sqlstate 'P0001' then
      assert sqlerrm = 'not-authenticated';
    end;
    begin
      perform public.set_cosmetic_slot('frame', null);
      assert false, 'Unauthenticated equipment changes must be rejected';
    exception when sqlstate 'P0001' then
      assert sqlerrm = 'not-authenticated';
    end;
    raise exception using errcode = 'ZP001', message = 'Roll back successful cosmetics test';
  exception when sqlstate 'ZP001' then null;
  end;

  assert (select to_jsonb(w) from public.player_wallets w where user_id = account_id)
    is not distinct from wallet_before, 'Wallet fixture was not rolled back';
  assert (select jsonb_agg(to_jsonb(c) order by cosmetic_id) from public.player_cosmetics c where user_id = account_id)
    is not distinct from cosmetics_before, 'Ownership fixture was not rolled back';
end;
$$;
