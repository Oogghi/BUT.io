import { schema, t } from '@colyseus/schema';

export const SettingsSchema = schema(
  {
    dictionary: t.string(),
    difficulty: t.string(),
    minTurnSeconds: t.uint8(),
    maxPromptAge: t.uint8(),
    startingLives: t.uint8(),
    maxLives: t.uint8(),
    maxPlayers: t.uint8(),
    bonusAlphabet: t.string(),
  },
  'BombPartySettings',
);

export const GamePlayerSchema = schema(
  { lives: t.uint8(), bonusLetters: t.string(), lastWord: t.string() },
  'BombPartyPlayer',
);
export const GameStateSchema = schema(
  {
    activePlayerId: t.string(),
    prompt: t.string(),
    promptAge: t.uint8(),
    turnId: t.uint32(),
    turnStartedAt: t.float64(),
    deadline: t.float64(),
    serverNow: t.float64(),
    winnerId: t.string(),
    lastWord: t.string(),
    lastPlayerId: t.string(),
    lastEvent: t.string(),
    usedWordCount: t.uint32(),
    players: t.map(GamePlayerSchema),
  },
  'BombPartyGame',
);

export function emptyGameState() {
  return new GameStateSchema({
    activePlayerId: '',
    prompt: '',
    promptAge: 0,
    turnId: 0,
    turnStartedAt: 0,
    deadline: 0,
    serverNow: 0,
    winnerId: '',
    lastWord: '',
    lastPlayerId: '',
    lastEvent: '',
    usedWordCount: 0,
  });
}
