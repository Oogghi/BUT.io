import type { GameMetadata, LobbyState } from '@but/shared';

export const pokerParty = {
  id: 'poker-party',
  name: 'Poker Party',
  minPlayers: 1,
  maxPlayers: 6,
} as const satisfies GameMetadata;

export type PokerMode = 'ultimate' | 'holdem';
export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';
export type Rank =
  '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  rank: Rank;
  suit: Suit;
}

export interface PokerSettings {
  mode: PokerMode;
  rounds: number;
  startingChips: number;
  ante: number;
  smallBlind: number;
  bigBlind: number;
  minRaise: number;
  bettingSeconds: number;
}

export const defaultPokerSettings: Readonly<PokerSettings> = {
  mode: 'ultimate',
  rounds: 3,
  startingChips: 1000,
  ante: 25,
  smallBlind: 25,
  bigBlind: 50,
  minRaise: 50,
  bettingSeconds: 30,
};

export type PokerStage =
  | ''
  | 'ultimate-betting'
  | 'ultimate-preflop'
  | 'ultimate-flop'
  | 'ultimate-river'
  | 'holdem-preflop'
  | 'holdem-flop'
  | 'holdem-turn'
  | 'holdem-river'
  | 'showdown'
  | 'complete';

export type PokerAction =
  | 'check'
  | 'call'
  | 'fold'
  | 'raise1'
  | 'raise2'
  | 'raise3'
  | 'raise4'
  | 'raise';

/** Ultimate Poker wagers: the blind always equals the ante; play is the single raise (×1–×4 ante). */
export interface PokerBet {
  ante: number;
  blind: number;
  play: number;
}

export interface PokerPlayerState {
  chips: number;
  cards: Card[];
  bet: PokerBet;
  totalBet: number;
  streetBet: number;
  folded: boolean;
  allIn: boolean;
  acted: boolean;
  action: string;
  handCategory: number;
  handLabel: string;
  /** Chips returned to the player at showdown (stakes included). */
  payout: number;
  /** Ultimate Poker: what each wager returned at showdown (0 = lost, stake = push). */
  returns: PokerBet;
  /** Ultimate Poker: the blind's paytable multiplier for this hand (0 = none). */
  blindOdds: number;
  outcome: '' | 'win' | 'loss' | 'push';
  rank: number;
  departed: boolean;
}

export interface PokerGameWireState {
  stage: PokerStage;
  round: number;
  deadline: number;
  serverNow: number;
  activePlayerId: string;
  communityCards: string;
  dealerCards: string;
  dealerHoleHidden: boolean;
  dealerHandLabel: string;
  pot: number;
  currentBet: number;
  winnerId: string;
  rankings: string;
  lastEvent: string;
  players: ReadonlyMap<string, string>;
}

export interface PokerRoomState extends LobbyState {
  settings: PokerSettings;
  game: PokerGameWireState;
}

export type PokerActionError =
  | 'not-playing'
  | 'not-your-turn'
  | 'invalid-action'
  | 'invalid-bet'
  | 'not-enough-chips'
  | 'must-call'
  | 'nothing-to-call'
  | 'raise-too-small'
  | 'not-available';

export type PokerSend = (
  ...message:
    | ['ready' | 'spectate', boolean]
    | ['start' | 'return']
    | ['settings', PokerSettings]
    | ['bet', { ante: number }]
    | ['action', PokerAction | { type: 'raise'; amount: number }]
) => void;
