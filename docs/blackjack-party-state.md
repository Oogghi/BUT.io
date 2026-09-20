# Blackjack Party implementation state

## Goal

Ship Blackjack Party inside the existing React/Vite + Colyseus platform, with
authoritative cards, bets, payouts, timers, side bets, rebuys backed by the
existing Supabase wallet, match rankings, stats, responsive presentation, and
complete automated verification.

## Acceptance gate

- Two to seven clients can finish a configurable multi-round match.
- Hit, stand, double, split, Blackjack, bust, push, aces, shoe, soft 17, and
  configurable payouts behave correctly on the server.
- Perfect Pairs and 21+3 resolve from configurable payout tables.
- Dealer hole card is never serialized before reveal.
- Lobby settings, timers, rebuys, final ranking, and stats behave end to end.
- Type checks, tests, and production build pass.

## Non-goals

- Real-money wagering or conversion between match chips and global currency.
- New global account or wallet systems; Blackjack must reuse the existing ones.
- Unrelated cleanup of the current dirty worktree.

## Current facts

- The repository already contains React/Vite web, Colyseus server rooms, shared
  packages, and an in-progress Supabase rewards/wallet integration.
- Existing user changes are present and must be preserved.

## State

- Current position: implementation and verification complete.
- Delivered: authoritative Colyseus game/rules package, responsive React lobby
  and casino table, configurable side bets, final rankings, Supabase-backed
  rebuys and stats, English/French copy, and generated casino card-back art.
- Live verification: applied the Blackjack migration to the active BUT.io
  Supabase project; verified role permissions, one-time/idempotent rebuy
  deductions, insufficient-funds rejection, stats aggregation, and state
  cleanup with contract checks.
- UI verification: completed a live five-round match with multiple browser
  clients at desktop and 390x844 mobile sizes, including dealer-card privacy,
  Double Down, round transitions, and final standings.
- Automated verification: all 59 server, 8 web, and 7 shared tests pass; every
  workspace type-checks; the Vite production build succeeds.
- Blockers: none.
