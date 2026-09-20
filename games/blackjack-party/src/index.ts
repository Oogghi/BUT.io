import type { GameMetadata, LobbyState } from '@but/shared';

export const blackjackParty = {
  id: 'blackjack-party',
  name: 'Blackjack Party',
  minPlayers: 1,
  maxPlayers: 7,
} as const satisfies GameMetadata;

export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';
export type Rank =
  '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  rank: Rank;
  suit: Suit;
}

export interface BlackjackSettings {
  rounds: number;
  startingChips: number;
  minBet: number;
  maxBet: number;
  decks: number;
  blackjackPayout: 1.2 | 1.5 | 2;
  dealerHitsSoft17: boolean;
  allowDouble: boolean;
  allowSplit: boolean;
  maxSplits: number;
  doubleAfterSplit: boolean;
  sideBetsEnabled: boolean;
  perfectPairsEnabled: boolean;
  twentyOnePlusThreeEnabled: boolean;
  minSideBet: number;
  maxSideBet: number;
  perfectPairMixedPayout: number;
  perfectPairColoredPayout: number;
  perfectPairPayout: number;
  twentyOnePlusThreeFlushPayout: number;
  twentyOnePlusThreeStraightPayout: number;
  twentyOnePlusThreeTripsPayout: number;
  twentyOnePlusThreeStraightFlushPayout: number;
  twentyOnePlusThreeSuitedTripsPayout: number;
  bettingSeconds: number;
  actionSeconds: number;
  rebuysEnabled: boolean;
  rebuyChipAmount: number;
  rebuyCost: number;
  maxRebuys: number;
}

export const defaultBlackjackSettings: Readonly<BlackjackSettings> = {
  rounds: 5,
  startingChips: 1000,
  minBet: 25,
  maxBet: 250,
  decks: 6,
  blackjackPayout: 1.5,
  dealerHitsSoft17: false,
  allowDouble: true,
  allowSplit: true,
  maxSplits: 3,
  doubleAfterSplit: true,
  sideBetsEnabled: true,
  perfectPairsEnabled: true,
  twentyOnePlusThreeEnabled: true,
  minSideBet: 5,
  maxSideBet: 50,
  perfectPairMixedPayout: 5,
  perfectPairColoredPayout: 10,
  perfectPairPayout: 25,
  twentyOnePlusThreeFlushPayout: 5,
  twentyOnePlusThreeStraightPayout: 10,
  twentyOnePlusThreeTripsPayout: 30,
  twentyOnePlusThreeStraightFlushPayout: 40,
  twentyOnePlusThreeSuitedTripsPayout: 100,
  bettingSeconds: 20,
  actionSeconds: 15,
  rebuysEnabled: true,
  rebuyChipAmount: 500,
  rebuyCost: 50,
  maxRebuys: 2,
};

export interface BlackjackBet {
  main: number;
  perfectPairs: number;
  twentyOnePlusThree: number;
}

export type BlackjackStage =
  'betting' | 'playing' | 'dealer' | 'round-results' | 'complete';
export type HandStatus = 'playing' | 'stood' | 'blackjack' | 'bust';
export type HandOutcome = '' | 'win' | 'loss' | 'push' | 'blackjack';

export interface BlackjackHandState {
  cards: Card[];
  bet: number;
  status: HandStatus;
  outcome: HandOutcome;
  payout: number;
  doubled: boolean;
  fromSplit: boolean;
  value: number;
  soft: boolean;
  canDouble: boolean;
  canSplit: boolean;
}

export interface BlackjackPlayerState {
  chips: number;
  hands: BlackjackHandState[];
  bet: BlackjackBet;
  betLocked: boolean;
  perfectPairsResult: string;
  perfectPairsPayout: number;
  twentyOnePlusThreeResult: string;
  twentyOnePlusThreePayout: number;
  roundsPlayed: number;
  roundsWon: number;
  blackjacks: number;
  busts: number;
  doubleDownWins: number;
  splitWins: number;
  perfectPairsWins: number;
  twentyOnePlusThreeWins: number;
  rebuys: number;
  globalCurrencySpentOnRebuys: number;
  rank: number;
  departed: boolean;
}

/** Wire state keeps hand arrays as JSON to avoid a deep mutable schema hierarchy. */
export interface BlackjackGameWireState {
  stage: BlackjackStage | '';
  round: number;
  deadline: number;
  serverNow: number;
  activePlayerId: string;
  activeHandIndex: number;
  dealerCards: string;
  dealerCardCount: number;
  dealerHoleHidden: boolean;
  dealerValue: number;
  winnerId: string;
  rankings: string;
  lastEvent: string;
  players: ReadonlyMap<string, string>;
}

export interface BlackjackRoomState extends LobbyState {
  settings: BlackjackSettings;
  game: BlackjackGameWireState;
}

export type BlackjackAction = 'hit' | 'stand' | 'double' | 'split';
export type BlackjackActionError =
  | 'not-betting'
  | 'not-playing'
  | 'not-your-turn'
  | 'bet-locked'
  | 'invalid-bet'
  | 'not-enough-chips'
  | 'double-disabled'
  | 'double-not-allowed'
  | 'split-disabled'
  | 'split-not-allowed'
  | 'rebuy-disabled'
  | 'rebuy-not-needed'
  | 'rebuy-limit'
  | 'rebuy-sign-in'
  | 'rebuy-unavailable'
  | 'rebuy-insufficient-currency';

export type BlackjackSend = (
  ...message:
    | ['ready' | 'spectate', boolean]
    | ['start' | 'return' | 'rebuy']
    | ['bet', BlackjackBet]
    | ['action', BlackjackAction]
    | ['settings', BlackjackSettings]
) => void;
