-- ISOLATED TEST DATABASE ONLY. Fixture mutations are rolled back.
begin;
do $$
declare
  account_id uuid := '00000000-0000-4000-8000-000000000001';
  result jsonb;
  expected_balance bigint := 1000;
  item record;
begin
  perform set_config('request.jwt.claim.sub', account_id::text, true);
  update public.player_wallets set coins = expected_balance,
    equipped_cosmetics = '{"frame":"coral-frame","card-animation":"velvet-deal"}'
  where user_id = account_id;

  begin
    perform public.set_cosmetic_slot('blackjack-celebration', 'golden-blackjack');
    assert false, 'Unowned celebration was equipped';
  exception when sqlstate 'P0001' then assert sqlerrm = 'cosmetic-not-owned'; end;

  for item in select * from (values
    ('golden-blackjack', 180), ('royal-blackjack', 220), ('electric-blackjack', 200)
  ) as items(id, price) loop
    result := public.purchase_cosmetic(item.id);
    expected_balance := expected_balance - item.price;
    assert (result->>'coins')::bigint = expected_balance, 'Wrong price';
    assert result->'equipped_cosmetics'->>'card-animation' = 'velvet-deal';
    assert result->'equipped_cosmetics'->>'frame' = 'coral-frame';
    assert result->'equipped_cosmetics'->>'blackjack-celebration' = 'golden-blackjack', 'Later purchases replaced equipment';
    assert exists(select 1 from public.player_cosmetics where user_id = account_id and cosmetic_id = item.id);
  end loop;

  begin
    perform public.purchase_cosmetic('golden-blackjack');
    assert false, 'Duplicate purchase was accepted';
  exception when sqlstate 'P0001' then assert sqlerrm = 'cosmetic-owned'; end;
  assert (select coins from public.player_wallets where user_id = account_id) = expected_balance;

  begin
    perform public.set_cosmetic_slot('card-animation', 'golden-blackjack');
    assert false, 'Wrong slot was accepted';
  exception when sqlstate 'P0001' then assert sqlerrm = 'cosmetic-slot-mismatch'; end;
  result := public.set_cosmetic_slot('blackjack-celebration', 'electric-blackjack');
  assert result->'equipped_cosmetics'->>'blackjack-celebration' = 'electric-blackjack';
  result := public.set_cosmetic_slot('blackjack-celebration', null);
  assert not result->'equipped_cosmetics' ? 'blackjack-celebration';
  assert result->'equipped_cosmetics'->>'card-animation' = 'velvet-deal';

  -- Insufficient funds must not grant an unowned effect.
  delete from public.player_cosmetics where user_id = account_id and cosmetic_id = 'royal-blackjack';
  update public.player_wallets set coins = 0 where user_id = account_id;
  begin
    perform public.purchase_cosmetic('royal-blackjack');
    assert false, 'Unaffordable celebration was purchased';
  exception when sqlstate 'P0001' then assert sqlerrm = 'not-enough-coins'; end;
  assert not exists(select 1 from public.player_cosmetics where user_id = account_id and cosmetic_id = 'royal-blackjack');

  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.purchase_cosmetic('royal-blackjack');
    assert false, 'Unauthenticated purchase was accepted';
  exception when sqlstate 'P0001' then assert sqlerrm = 'not-authenticated'; end;
  begin
    perform public.set_cosmetic_slot('blackjack-celebration', null);
    assert false, 'Unauthenticated equip was accepted';
  exception when sqlstate 'P0001' then assert sqlerrm = 'not-authenticated'; end;
end;
$$;
rollback;
