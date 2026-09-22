import type { GameMetadata, LobbyState } from '@but/shared';

export const bombParty = {
  id: 'bomb-party',
  name: 'Bomb Party',
  minPlayers: 2,
  maxPlayers: 8,
} as const satisfies GameMetadata;

export type PromptDifficulty = 'easy' | 'normal' | 'hard';
export interface BombPartySettings {
  dictionary: 'fr';
  difficulty: PromptDifficulty;
  minTurnSeconds: number;
  maxPromptAge: number;
  startingLives: number;
  maxLives: number;
  maxPlayers: number;
  /** Unique ASCII letters; empty disables the bonus. */
  bonusAlphabet: string;
}

/** Shared lobby/server bounds; values fit the room wire schema. */
export const bombPartySettingsLimits = {
  minTurnSeconds: { min: 1, max: 120 },
  maxPromptAge: { min: 1, max: 100 },
  startingLives: { min: 1, max: 100 },
  maxLives: { min: 1, max: 100 },
  maxPlayers: { min: 2, max: 8 },
} as const;

export const defaultSettings: Readonly<BombPartySettings> = {
  dictionary: 'fr',
  difficulty: 'easy',
  minTurnSeconds: 5,
  maxPromptAge: 2,
  startingLives: 2,
  maxLives: 3,
  maxPlayers: 8,
  bonusAlphabet: 'abcdefghijklmnopqrstuvwxyz',
};

export interface BombPartyPlayerState {
  lives: number;
  bonusLetters: string;
  lastWord: string;
  wordsPlayed?: number;
  wordsAccepted?: number;
  livesLost?: number;
  bestStreak?: number;
  currentStreak?: number;
  livesRecovered?: number;
}

export interface BombPartyState {
  activePlayerId: string;
  prompt: string;
  /** Number of failures with this prompt, never the number of submissions. */
  promptAge: number;
  turnId: number;
  turnStartedAt: number;
  deadline: number;
  serverNow: number;
  winnerId: string;
  lastWord: string;
  lastPlayerId: string;
  lastEvent: string;
  usedWordCount: number;
  players: ReadonlyMap<string, BombPartyPlayerState>;
}

export interface BombPartyRoomState extends LobbyState {
  settings: BombPartySettings;
  game: BombPartyState;
}

export interface WordSubmission {
  word: string;
  turnId: number;
}
export type BombPartySend = (
  ...message:
    | ['ready' | 'spectate', boolean]
    | ['start' | 'return']
    | ['word', WordSubmission]
    | ['settings', BombPartySettings]
) => void;
export type WordError =
  | 'invalid-word'
  | 'missing-prompt'
  | 'word-used'
  | 'not-your-turn'
  | 'turn-expired'
  | 'stale-turn';

/** Matching is case/accent insensitive. Hyphens and apostrophes are ignored only within single dictionary words. */
export function normalizeWord(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll('œ', 'oe')
    .replaceAll('æ', 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-'’]/g, '');
}
