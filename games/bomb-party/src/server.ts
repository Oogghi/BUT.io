import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import {
  defaultSettings,
  bombPartySettingsLimits,
  normalizeWord,
  type BombPartySettings,
  type BombPartyPlayerState,
  type PromptDifficulty,
  type WordError,
} from './index.js';

function fragments(word: string): Set<string> {
  const result = new Set<string>();
  for (const length of [2, 3]) {
    for (let at = 0; at <= word.length - length; at++)
      result.add(word.slice(at, at + length));
  }
  return result;
}

/** Built once per process, shared read-only by rooms. Counts describe distinct answers, not occurrences. */
export class FrenchLexicon {
  readonly words: ReadonlySet<string>;
  readonly counts = new Map<string, number>();
  readonly pools: Record<PromptDifficulty, string[]> = {
    easy: [],
    normal: [],
    hard: [],
  };

  constructor(words: Iterable<string>) {
    this.words = new Set(
      Array.from(words, normalizeWord).filter((word) =>
        /^[a-z]{2,40}$/.test(word),
      ),
    );
    for (const word of this.words) {
      for (const prompt of fragments(word))
        this.counts.set(prompt, (this.counts.get(prompt) ?? 0) + 1);
    }
    for (const [prompt, count] of this.counts) {
      if (count >= 1000) this.pools.easy.push(prompt);
      if (prompt.length === 3 && count >= 100 && count < 1000)
        this.pools.normal.push(prompt);
      if (prompt.length === 3 && count >= 10 && count < 100)
        this.pools.hard.push(prompt);
    }
  }

  choose(
    difficulty: PromptDifficulty,
    usedCounts: ReadonlyMap<string, number>,
    previous: string,
    pick: (length: number) => number,
  ): string {
    const available = (prompt: string) =>
      (this.counts.get(prompt) ?? 0) > (usedCounts.get(prompt) ?? 0);
    let pool = this.pools[difficulty].filter(available);
    // Tiny test dictionaries and exhausted difficulty pools still choose an answerable prompt.
    if (!pool.length) pool = [...this.counts.keys()].filter(available);
    const different = pool.filter((prompt) => prompt !== previous);
    if (different.length) pool = different;
    return pool.length ? pool[pick(pool.length)]! : '';
  }
}

let localDictionary: FrenchLexicon | undefined;
export function frenchDictionary(): FrenchLexicon {
  return (localDictionary ??= new FrenchLexicon(
    readFileSync(new URL('../data/french.txt', import.meta.url), 'utf8').split(
      '\n',
    ),
  ));
}

/** Full, atomic settings update. Unknown keys or inconsistent bounds reject the entire update. */
export function parseSettings(
  value: unknown,
  connectedPlayers: number,
): BombPartySettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !Object.hasOwn(defaultSettings, key)))
    return null;
  if (
    input.dictionary !== 'fr' ||
    !['easy', 'normal', 'hard'].includes(String(input.difficulty))
  )
    return null;
  for (const [key, { min, max }] of Object.entries(bombPartySettingsLimits)) {
    if (
      typeof input[key] !== 'number' ||
      !Number.isInteger(input[key]) ||
      input[key] < min ||
      input[key] > max
    )
      return null;
  }
  if ((input.maxPlayers as number) < connectedPlayers) return null;
  if ((input.startingLives as number) > (input.maxLives as number)) return null;
  if (
    typeof input.bonusAlphabet !== 'string' ||
    !/^[a-zA-Z]{0,26}$/.test(input.bonusAlphabet)
  )
    return null;
  return {
    ...input,
    bonusAlphabet: [...new Set(input.bonusAlphabet.toLowerCase())]
      .sort()
      .join(''),
  } as unknown as BombPartySettings;
}

/** Pure rules: caller supplies monotonic server time; only the room schedules real timers. */
export class BombPartyGame {
  readonly players = new Map<string, BombPartyPlayerState>();
  readonly usedWords = new Set<string>();
  private readonly usedPromptCounts = new Map<string, number>();
  private readonly order: string[];
  private bombDeadline = 0;
  activePlayerId = '';
  prompt = '';
  promptAge = 0;
  turnId = 0;
  turnStartedAt = 0;
  deadline = 0;
  winnerId = '';
  ended = false;
  resultReason = '';
  lastWord = '';
  lastPlayerId = '';
  lastEvent = '';

  constructor(
    ids: string[],
    readonly settings: Readonly<BombPartySettings>,
    private readonly dictionary: FrenchLexicon,
    now: number,
    private readonly pick: (length: number) => number = randomInt,
  ) {
    if (ids.length < 2 || new Set(ids).size !== ids.length)
      throw new Error('A match needs distinct players.');
    this.order = [...ids];
    for (const id of ids)
      this.players.set(id, {
        lives: settings.startingLives,
        bonusLetters: '',
        lastWord: '',
        wordsPlayed: 0,
        wordsAccepted: 0,
        livesLost: 0,
        bestStreak: 0,
        currentStreak: 0,
        livesRecovered: 0,
      });
    this.activePlayerId = ids[0]!;
    this.newPrompt();
    this.resetBomb(now);
    this.beginTurn(now);
  }

  submit(
    id: string,
    word: unknown,
    turnId: unknown,
    now: number,
  ): WordError | null {
    if (this.ended) return 'not-your-turn';
    // A delayed event-loop callback must not let a late message beat the server deadline.
    if (this.expire(now)) return 'turn-expired';
    if (id !== this.activePlayerId) return 'not-your-turn';
    if (turnId !== this.turnId) return 'stale-turn';
    if (
      typeof word !== 'string' ||
      word.length > 80 ||
      !/^[a-zà-öø-ÿœæ]+(?:[-'’][a-zà-öø-ÿœæ]+)*$/iu.test(
        word.trim().normalize('NFC'),
      )
    )
      return 'invalid-word';
    const normalized = normalizeWord(word);
    if (!this.dictionary.words.has(normalized)) return 'invalid-word';
    if (this.usedWords.has(normalized)) return 'word-used';
    if (!normalized.includes(this.prompt)) return 'missing-prompt';

    this.usedWords.add(normalized);
    for (const fragment of fragments(normalized))
      this.usedPromptCounts.set(
        fragment,
        (this.usedPromptCounts.get(fragment) ?? 0) + 1,
      );
    const player = this.players.get(id)!;
    player.wordsPlayed = (player.wordsPlayed ?? 0) + 1;
    player.wordsAccepted = (player.wordsAccepted ?? 0) + 1;
    player.currentStreak = (player.currentStreak ?? 0) + 1;
    player.bestStreak = Math.max(player.bestStreak ?? 0, player.currentStreak);
    player.lastWord = normalized;
    const covered = new Set(player.bonusLetters + normalized);
    player.bonusLetters = [...this.settings.bonusAlphabet]
      .filter((letter) => covered.has(letter))
      .join('');
    if (
      this.settings.bonusAlphabet &&
      player.bonusLetters === this.settings.bonusAlphabet
    ) {
      const previousLives = player.lives;
      player.lives = Math.min(this.settings.maxLives, player.lives + 1);
      if (player.lives > previousLives)
        player.livesRecovered = (player.livesRecovered ?? 0) + 1;
      player.bonusLetters = '';
    }
    this.lastWord = normalized;
    this.lastPlayerId = id;
    this.lastEvent = 'accepted';
    this.newPrompt();
    this.advance(now);
    return null;
  }

  expire(now: number): boolean {
    if (this.ended || now < this.deadline) return false;
    const player = this.players.get(this.activePlayerId)!;
    player.lives -= 1;
    player.livesLost = (player.livesLost ?? 0) + 1;
    player.currentStreak = 0;
    this.lastPlayerId = this.activePlayerId;
    this.lastEvent = 'exploded';
    this.promptAge += 1;
    if (this.promptAge >= this.settings.maxPromptAge) this.newPrompt();
    this.resetBomb(now);
    this.advance(now);
    return true;
  }

  leave(id: string, now: number) {
    if (this.ended || !this.players.has(id)) return;
    // Resolve a due bomb before assigning a departure to the next turn.
    this.expire(now);
    if (this.ended) return;
    const player = this.players.get(id)!;
    player.lives = 0;
    player.livesLost = (player.livesLost ?? 0) + 1;
    player.currentStreak = 0;
    this.lastPlayerId = id;
    this.lastEvent = 'departure';
    if (this.finishIfNeeded('departure')) return;
    if (this.activePlayerId === id) this.advance(now);
  }

  private newPrompt() {
    this.prompt = this.dictionary.choose(
      this.settings.difficulty,
      this.usedPromptCounts,
      this.prompt,
      this.pick,
    );
    this.promptAge = 0;
    if (!this.prompt) {
      this.ended = true;
      this.resultReason = 'dictionary-exhausted';
      this.activePlayerId = '';
      this.deadline = 0;
    }
  }

  private resetBomb(now: number) {
    // One shared fuse between explosions. Passing the bomb does not reset this random budget.
    this.bombDeadline =
      now + this.settings.minTurnSeconds * 1000 + 5000 + this.pick(10001);
  }

  private beginTurn(now: number) {
    if (this.ended) return;
    this.turnId += 1;
    this.turnStartedAt = now;
    this.deadline = Math.max(
      this.bombDeadline,
      now + this.settings.minTurnSeconds * 1000,
    );
  }

  private finishIfNeeded(reason = 'winner'): boolean {
    const alive = this.order.filter((id) => this.players.get(id)!.lives > 0);
    if (alive.length > 1) return false;
    this.ended = true;
    this.winnerId = alive[0] ?? '';
    this.resultReason = reason;
    this.activePlayerId = '';
    this.deadline = 0;
    return true;
  }

  private advance(now: number) {
    if (this.ended || this.finishIfNeeded()) return;
    const previous = this.order.indexOf(this.activePlayerId);
    for (let offset = 1; offset <= this.order.length; offset++) {
      const candidate = this.order[(previous + offset) % this.order.length]!;
      if (this.players.get(candidate)!.lives > 0) {
        this.activePlayerId = candidate;
        this.beginTurn(now);
        return;
      }
    }
  }
}
