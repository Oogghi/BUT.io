-- Run against a project with at least one signed-in profile. All fixture writes
-- are rolled back inside an exception block; no wallet or match data is retained.
do $$
declare
  account_id uuid;
  balance_before bigint;
  stats_before integer;
  test_match text := 'poker-reward-check-' || gen_random_uuid()::text;
  result jsonb;
  players jsonb;
begin
  assert not has_function_privilege('anon', 'public.record_match_result(text,text,uuid,timestamptz,timestamptz,integer,jsonb)', 'execute');
  assert not has_function_privilege('authenticated', 'public.record_match_result(text,text,uuid,timestamptz,timestamptz,integer,jsonb)', 'execute');
  assert has_function_privilege('service_role', 'public.record_match_result(text,text,uuid,timestamptz,timestamptz,integer,jsonb)', 'execute');

  select p.id into account_id from public.profiles p
    join auth.users u on u.id = p.id where not coalesce(u.is_anonymous, false) limit 1;
  assert account_id is not null, 'A signed-in profile is required for this rollback test';
  select coalesce((select coins from public.player_wallets where user_id = account_id), 0) into balance_before;
  select coalesce((select games_played from public.game_stats where user_id = account_id and game_id = 'poker-party'), 0) into stats_before;
  players := jsonb_build_array(jsonb_build_object('playerId', account_id, 'outcome', 'win', 'stats', '{}'::jsonb, 'rewardCoins', 30));

  begin
    result := public.record_match_result(test_match, 'poker-party', account_id,
      '2026-09-21T10:00:00Z', '2026-09-21T10:01:00Z', 60, players);
    assert result->'recorded' = 'true'::jsonb, 'Poker match was not recorded';
    assert (result->'rewards'->0->>'coins_awarded')::integer = 30, 'Expected 30 coins for the winner';
    assert (select coins from public.player_wallets where user_id = account_id) = balance_before + 30;
    assert (select games_played from public.game_stats where user_id = account_id and game_id = 'poker-party') = stats_before + 1;

    result := public.record_match_result(test_match, 'poker-party', account_id,
      '2026-09-21T10:00:00Z', '2026-09-21T10:01:00Z', 60, players);
    assert result = '{"recorded":false,"rewards":[]}'::jsonb, 'Duplicate match must not award coins';
    assert (select coins from public.player_wallets where user_id = account_id) = balance_before + 30;
    assert (select count(*) from public.coin_transactions where match_id = test_match) = 1;
    assert (select games_played from public.game_stats where user_id = account_id and game_id = 'poker-party') = stats_before + 1;
    raise exception using errcode = 'ZP001', message = 'Roll back successful reward test';
  exception when sqlstate 'ZP001' then null;
  end;

  assert coalesce((select coins from public.player_wallets where user_id = account_id), 0) = balance_before, 'Test wallet changes were not rolled back';
  assert not exists (select 1 from public.match_history where server_match_id = test_match);
  assert not exists (select 1 from public.coin_transactions where match_id = test_match);
end;
$$;
