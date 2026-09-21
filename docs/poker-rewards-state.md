# Poker rewards and Render configuration — 2026-09-21

## Confirmed causes

- PokerRoom.buildMatchResult returned null; the deployed database RPC also excluded poker-party.
- The user's Render screenshot shows VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, but no SUPABASE_URL. The backend previously required the latter and silently disabled rewards without it.
- The deployed web app at but-io.onrender.com connects to butio-server.onrender.com and the expected Supabase project. Before this fix, the database held zero matches and zero coin transactions. Render secret values were not inspected.

## Implemented

- Poker emits completed server-authoritative match results for verified accounts, using the game's match winner. Existing reward policy: 5 participation coins plus 25 winner coins. Both Ultimate and Hold'em are supported. Detailed Poker counters and stats UI are outside this change.
- Backend accepts VITE_SUPABASE_URL as a fallback for SUPABASE_URL and warns when reward configuration is incomplete. The secret remains server-only.
- Applied poker_rewards to Supabase project cslhufyvgkjrwzbrzolv. Local migration filename matches remote version 20260921210838. Only the game allowlist changed; RPC grants and duplicate protection are preserved.

## Verification and next action

- All 93 tests and workspace typecheck pass. New tests use real Colyseus clients and mock Supabase HTTP, covering both Poker modes, anonymous exclusion, the VITE URL fallback, reward notifications, and returning without duplicate recording.
- supabase/tests/poker_rewards.sql passed against the live database. It verifies wallet credit, stats increment, duplicate protection, and restricted RPC execution. Fixture writes are rolled back and asserted absent.
- Security advisor findings concern existing unrelated functions/policies and password settings; the reward RPC remains inaccessible to anon/authenticated. No broader security changes were made.
- The user requested committing and pushing the reward fix to main. Render deployment and live match credit still need verification; the database migration is already live. No Render credentials or deployment capability was available here. Rejoin a lobby while signed in after deploying, finish a Poker match, and confirm live credit.
- Local Letta tools were unavailable; this file preserves the compact findings and remaining deployment step.
