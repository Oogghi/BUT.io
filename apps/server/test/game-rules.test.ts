import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultSettings, type BombPartySettings } from '@but/bomb-party';
import {
  BombPartyGame,
  FrenchLexicon,
  frenchDictionary,
  parseSettings,
} from '@but/bomb-party/server';

const dictionary = new FrenchLexicon([
  'chat',
  'chats',
  'chateau',
  'chien',
  'chienne',
  'chose',
  'chou',
  'choux',
  'rat',
  'rate',
  'raton',
  'route',
  'roue',
  'poule',
  'poules',
  'poussin',
]);
function create(settings: Partial<BombPartySettings> = {}, ids = ['a', 'b']) {
  return new BombPartyGame(
    ids,
    { ...defaultSettings, minTurnSeconds: 2, ...settings },
    dictionary,
    0,
    () => 0,
  );
}
function answer(game: BombPartyGame, now = game.turnStartedAt + 1) {
  const word = [...dictionary.words].find(
    (word) => word.includes(game.prompt) && !game.usedWords.has(word),
  );
  assert.ok(word);
  assert.equal(game.submit(game.activePlayerId, word, game.turnId, now), null);
  return word;
}

test('accepts dictionary words containing the prompt and advances only one turn', () => {
  const game = create();
  assert.equal(game.prompt, 'ch');
  assert.equal(game.submit('a', ' CHAT ', game.turnId, 100), null);
  assert.equal(game.activePlayerId, 'b');
  assert.equal(game.usedWords.has('chat'), true);
  assert.equal(game.players.get('a')!.lastWord, 'chat');
  assert.equal(game.players.get('a')!.wordsPlayed, 1);
  assert.equal(game.players.get('a')!.wordsAccepted, 1);
  assert.equal(game.players.get('a')!.bestStreak, 1);
  assert.equal(game.players.get('b')!.lastWord, '');
  assert.equal(game.turnId, 2);
  assert.equal(game.submit('a', 'chats', 1, 101), 'not-your-turn');
});

test('invalid dictionary entries, missing prompts and malformed words leave time/turn/lives untouched', () => {
  const game = create();
  const deadline = game.deadline;
  for (const word of [
    'chzzzz',
    '<script>',
    'cha t',
    '',
    null,
    'a'.repeat(81),
  ]) {
    assert.equal(game.submit('a', word, game.turnId, 100), 'invalid-word');
  }
  assert.equal(game.submit('a', 'rat', game.turnId, 100), 'missing-prompt');
  assert.equal(game.deadline, deadline);
  assert.equal(game.turnId, 1);
  assert.equal(game.players.get('a')!.lives, 2);
  assert.equal(game.usedWords.size, 0);
});

test('accepted words cannot be reused, including case and accent variants', () => {
  const lexicon = new FrenchLexicon(['école', 'écoles', 'écologie']);
  const game = new BombPartyGame(
    ['a', 'b'],
    defaultSettings,
    lexicon,
    0,
    () => 0,
  );
  assert.equal(game.submit('a', 'E\u0301COLE', game.turnId, 100), null);
  assert.equal(game.submit('b', 'ecole', game.turnId, 200), 'word-used');
  assert.equal(game.usedWords.size, 1);
});

test('stale turn IDs cannot submit a delayed word on a later turn', () => {
  const game = create();
  answer(game);
  answer(game);
  assert.equal(game.activePlayerId, 'a');
  assert.equal(game.submit('a', 'chateau', 1, 100), 'stale-turn');
  assert.equal(game.usedWords.size, 2);
});

test('timer expiration loses exactly one life and advances to the next player', () => {
  const game = create();
  const deadline = game.deadline;
  assert.equal(game.expire(deadline - 1), false);
  assert.equal(game.expire(deadline), true);
  assert.equal(game.players.get('a')!.lives, 1);
  assert.equal(game.activePlayerId, 'b');
  assert.equal(game.expire(deadline), false);
  assert.ok(game.deadline > deadline);
});

test('late submissions cannot beat an overdue server timer callback', () => {
  const game = create();
  assert.equal(
    game.submit('a', 'chat', game.turnId, game.deadline),
    'turn-expired',
  );
  assert.equal(game.usedWords.size, 0);
  assert.equal(game.players.get('a')!.lives, 1);
  assert.equal(game.activePlayerId, 'b');
});

test('zero-life players are eliminated, skipped, and unable to submit', () => {
  const game = create({ startingLives: 1 }, ['a', 'b', 'c']);
  game.expire(game.deadline);
  assert.equal(game.players.get('a')!.lives, 0);
  assert.equal(
    game.submit('a', 'chat', game.turnId, game.turnStartedAt),
    'not-your-turn',
  );
  answer(game);
  assert.equal(game.activePlayerId, 'c');
  answer(game);
  assert.equal(game.activePlayerId, 'b');
  assert.equal(game.ended, false);
});

test('last surviving player wins and later expirations cannot mutate results', () => {
  const game = create({ startingLives: 1 });
  game.expire(game.deadline);
  assert.equal(game.winnerId, 'b');
  assert.equal(game.ended, true);
  assert.equal(game.activePlayerId, '');
  assert.equal(game.deadline, 0);
  assert.equal(game.expire(100000), false);
  assert.equal(game.players.get('b')!.lives, 1);
});

test('bonus alphabet accumulates per player, awards one life, and resets', () => {
  const game = create({ bonusAlphabet: 'achtu' });
  game.submit('a', 'chat', game.turnId, 1);
  assert.equal(game.players.get('a')!.bonusLetters, 'acht');
  assert.equal(game.players.get('b')!.bonusLetters, '');
  game.submit('b', 'chats', game.turnId, 2);
  assert.equal(game.submit('a', 'chou', game.turnId, 3), null);
  assert.equal(game.players.get('a')!.lives, 3);
  assert.equal(game.players.get('a')!.livesRecovered, 1);
  assert.equal(game.players.get('a')!.bonusLetters, '');
});

test('bonus life is capped and completion still resets at maximum lives', () => {
  const game = create({ startingLives: 3, maxLives: 3, bonusAlphabet: 'acht' });
  answer(game);
  assert.equal(game.players.get('a')!.lives, 3);
  assert.equal(game.players.get('a')!.bonusLetters, '');
});

test('empty bonus alphabet disables life awards', () => {
  const game = create({ bonusAlphabet: '' });
  answer(game);
  assert.equal(game.players.get('a')!.lives, 2);
  assert.equal(game.players.get('a')!.bonusLetters, '');
});

test('prompt age counts failures, holds until the limit, and resets on success', () => {
  const game = create({ maxPromptAge: 2, startingLives: 3 });
  const first = game.prompt;
  game.submit('a', 'invalid', game.turnId, 100);
  assert.equal(game.promptAge, 0);
  game.expire(game.deadline);
  assert.equal(game.prompt, first);
  assert.equal(game.promptAge, 1);
  game.expire(game.deadline);
  assert.notEqual(game.prompt, first);
  assert.equal(game.promptAge, 0);
  game.expire(game.deadline);
  assert.equal(game.promptAge, 1);
  const before = game.prompt;
  answer(game);
  assert.equal(game.promptAge, 0);
  assert.notEqual(game.prompt, before);
});

test('a prompt age of one replaces the prompt after each failure', () => {
  const game = create({ maxPromptAge: 1 });
  const prompt = game.prompt;
  game.expire(game.deadline);
  assert.notEqual(game.prompt, prompt);
  assert.equal(game.promptAge, 0);
});

test('bomb fuse is shared across accepted turns but each player gets the minimum', () => {
  const game = create();
  const original = game.deadline;
  answer(game, 1000);
  assert.equal(game.deadline, original);
  answer(game, original - 100);
  assert.equal(game.deadline, original - 100 + 2000);
  assert.equal(game.expire(original), false);
  const protectedDeadline = game.deadline;
  answer(game, protectedDeadline - 1);
  assert.equal(game.deadline, protectedDeadline - 1 + 2000);
  assert.equal(game.expire(game.deadline - 1), false);
  assert.equal(game.expire(game.deadline), true);
});

test('departure skips an active player with minimum protection and detects a winner', () => {
  const game = create({}, ['a', 'b', 'c']);
  game.leave('a', game.deadline - 1);
  assert.equal(game.activePlayerId, 'b');
  assert.equal(game.deadline - game.turnStartedAt, 2000);
  game.leave('c', game.turnStartedAt);
  assert.equal(game.winnerId, 'b');
  assert.equal(game.resultReason, 'departure');
});

test('fresh matches reset used words, lives and bonus progress', () => {
  const first = create();
  answer(first);
  const second = create();
  assert.equal(second.usedWords.size, 0);
  assert.equal(second.players.get('a')!.lives, 2);
  assert.equal(second.players.get('a')!.bonusLetters, '');
  assert.equal(second.players.get('a')!.lastWord, '');
});

test('local French dictionary is substantial and prompt pools match their difficulty ranges', () => {
  const lexicon = frenchDictionary();
  assert.ok(lexicon.words.size > 150000);
  for (const word of ['bonjour', 'ecole', 'chateau', 'manger', 'mangeaient'])
    assert.ok(lexicon.words.has(word), word);
  for (const difficulty of ['easy', 'normal', 'hard'] as const) {
    assert.ok(lexicon.pools[difficulty].length > 20);
    for (const prompt of lexicon.pools[difficulty]) {
      const count = lexicon.counts.get(prompt)!;
      assert.ok(
        difficulty === 'easy'
          ? count >= 1000
          : difficulty === 'normal'
            ? count >= 100 && count < 1000
            : count >= 10 && count < 100,
      );
    }
  }
});

test('prompt selection excludes exhausted answers and ends safely if the dictionary is exhausted', () => {
  const game = new BombPartyGame(
    ['a', 'b'],
    defaultSettings,
    new FrenchLexicon(['chat']),
    0,
    () => 0,
  );
  assert.equal(game.submit('a', 'chat', game.turnId, 1), null);
  assert.equal(game.ended, true);
  assert.equal(game.resultReason, 'dictionary-exhausted');
});

test('settings reject malformed values, unsupported dictionaries and unsafe capacity/life combinations', () => {
  assert.deepEqual(parseSettings(defaultSettings, 2), defaultSettings);
  for (const patch of [
    { dictionary: 'en' },
    { difficulty: 'impossible' },
    { minTurnSeconds: 0 },
    { minTurnSeconds: 1.5 },
    { maxPromptAge: 0 },
    { startingLives: 4 },
    { maxLives: 101 },
    { maxPlayers: 2 },
    { bonusAlphabet: 'a!' },
    { unknown: true },
  ]) {
    assert.equal(
      parseSettings({ ...defaultSettings, ...patch }, 3),
      null,
      JSON.stringify(patch),
    );
  }
  assert.equal(
    parseSettings({ ...defaultSettings, bonusAlphabet: 'BAAB' }, 2)!
      .bonusAlphabet,
    'ab',
  );
  assert.equal(
    parseSettings({ ...defaultSettings, bonusAlphabet: '' }, 2)!.bonusAlphabet,
    '',
  );
});
