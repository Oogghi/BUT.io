import {
  defaultPokerSettings,
  pokerSettingsLimits,
  pokerParty,
  type Card,
  type PokerAction,
  type PokerActionError,
  type PokerBet,
  type PokerMode,
  type PokerPlayerState,
  type PokerSettings,
  type PokerStage,
  type Rank,
  type Suit,
} from './index.js';

const ULTIMATE_DECISIONS: readonly PokerStage[] = [
  'ultimate-preflop',
  'ultimate-flop',
  'ultimate-river',
];
const SUITS: readonly Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
const RANKS: readonly Rank[] = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
  'A',
];
/** Matches the client's paced reveal: board, dealer, one second per hand, wagers. */
function showdownMs(mode: PokerMode, players: number) {
  return 6500 + players * 1000 + (mode === 'ultimate' ? 2500 : 0);
}

export type PokerHand = {
  category: number;
  label: string;
  score: number[];
};

function rankValue(rank: Rank) {
  if (rank === 'A') return 14;
  if (rank === 'K') return 13;
  if (rank === 'Q') return 12;
  if (rank === 'J') return 11;
  return Number(rank);
}

export function handLabel(category: number) {
  return (
    [
      'Carte haute',
      'Paire',
      'Double paire',
      'Brelan',
      'Suite',
      'Couleur',
      'Full',
      'Carré',
      'Quinte flush',
    ][category] ?? 'Carte haute'
  );
}

function compareScore(a: readonly number[], b: readonly number[]) {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

function evaluateFive(cards: readonly Card[]): PokerHand {
  const values = cards
    .map((card) => rankValue(card.rank))
    .sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const groups = [...counts.entries()].sort(
    ([valueA, countA], [valueB, countB]) => countB - countA || valueB - valueA,
  );
  const flush = cards.every((card) => card.suit === cards[0]?.suit);
  const unique = [...new Set(values)].sort((a, b) => b - a);
  const straight =
    unique.length === 5 &&
    (unique[0]! - unique[4]! === 4 ||
      (unique[0] === 14 &&
        unique[1] === 5 &&
        unique[2] === 4 &&
        unique[3] === 3 &&
        unique[4] === 2));
  const straightHigh =
    unique[0] === 14 && unique[1] === 5 && unique[2] === 4
      ? 5
      : (unique[0] ?? 0);

  if (straight && flush)
    return { category: 8, label: handLabel(8), score: [straightHigh] };
  if (groups[0]?.[1] === 4)
    return {
      category: 7,
      label: handLabel(7),
      score: [groups[0][0], groups[1]?.[0] ?? 0],
    };
  if (groups[0]?.[1] === 3 && groups[1]?.[1] === 2)
    return {
      category: 6,
      label: handLabel(6),
      score: [groups[0][0], groups[1][0]],
    };
  if (flush) return { category: 5, label: handLabel(5), score: values };
  if (straight)
    return { category: 4, label: handLabel(4), score: [straightHigh] };
  if (groups[0]?.[1] === 3)
    return {
      category: 3,
      label: handLabel(3),
      score: [groups[0][0], ...groups.slice(1).map(([value]) => value)],
    };
  if (groups[0]?.[1] === 2 && groups[1]?.[1] === 2)
    return {
      category: 2,
      label: handLabel(2),
      score: [groups[0][0], groups[1][0], groups[2]?.[0] ?? 0],
    };
  if (groups[0]?.[1] === 2)
    return {
      category: 1,
      label: handLabel(1),
      score: [groups[0][0], ...groups.slice(1).map(([value]) => value)],
    };
  return { category: 0, label: handLabel(0), score: values };
}

export function evaluateBest(cards: readonly Card[]): PokerHand {
  if (cards.length < 5) {
    const values = cards
      .map((card) => rankValue(card.rank))
      .sort((a, b) => b - a);
    return { category: 0, label: handLabel(0), score: values };
  }
  let best = evaluateFive(cards.slice(0, 5));
  for (let a = 0; a < cards.length - 4; a += 1)
    for (let b = a + 1; b < cards.length - 3; b += 1)
      for (let c = b + 1; c < cards.length - 2; c += 1)
        for (let d = c + 1; d < cards.length - 1; d += 1)
          for (let e = d + 1; e < cards.length; e += 1) {
            const candidate = evaluateFive([
              cards[a]!,
              cards[b]!,
              cards[c]!,
              cards[d]!,
              cards[e]!,
            ]);
            if (
              candidate.category > best.category ||
              (candidate.category === best.category &&
                compareScore(candidate.score, best.score) > 0)
            )
              best = candidate;
          }
  return best;
}

function compareHands(a: PokerHand, b: PokerHand) {
  return a.category - b.category || compareScore(a.score, b.score);
}

function deck(random: () => number) {
  const cards: Card[] = [];
  for (const suit of SUITS)
    for (const rank of RANKS) cards.push({ suit, rank });
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [cards[index], cards[swap]] = [cards[swap]!, cards[index]!];
  }
  return cards;
}

interface MutablePlayer extends Omit<PokerPlayerState, 'cards' | 'bet'> {
  cards: Card[];
  bet: PokerBet;
  streetBet: number;
}

function emptyPlayer(chips: number): MutablePlayer {
  return {
    chips,
    cards: [],
    bet: { ante: 0, blind: 0, play: 0 },
    totalBet: 0,
    streetBet: 0,
    folded: false,
    allIn: false,
    acted: false,
    action: '',
    handCategory: 0,
    handLabel: '',
    payout: 0,
    returns: { ante: 0, blind: 0, play: 0 },
    blindOdds: 0,
    outcome: '',
    rank: 0,
    departed: false,
  };
}

function take(cards: Card[], amount: number) {
  return cards.splice(0, amount);
}

function stageFor(mode: PokerMode, street: number): PokerStage {
  if (mode === 'ultimate')
    return street === 0
      ? 'ultimate-preflop'
      : street === 1
        ? 'ultimate-flop'
        : 'ultimate-river';
  return street === 0
    ? 'holdem-preflop'
    : street === 1
      ? 'holdem-flop'
      : street === 2
        ? 'holdem-turn'
        : 'holdem-river';
}

export class PokerGame {
  readonly players = new Map<string, MutablePlayer>();
  readonly order: string[];
  private readonly waitingPlayers = new Set<string>();
  readonly settings: Readonly<PokerSettings>;
  stage: PokerStage = '';
  round = 0;
  deadline = 0;
  activePlayerId = '';
  pot = 0;
  currentBet = 0;
  winnerId = '';
  lastEvent = '';
  resultReason = '';
  private cards: Card[] = [];
  private dealerHand: Card[] = [];
  private community: Card[] = [];
  private visibleCommunity = 0;
  private street = 0;
  private buttonIndex = -1;
  private locked = new Set<string>();

  constructor(
    ids: string[],
    settings: Readonly<PokerSettings>,
    now: number,
    private readonly random: () => number = Math.random,
  ) {
    if (
      ids.length < (settings.mode === 'ultimate' ? 1 : 2) ||
      ids.length > pokerParty.maxPlayers ||
      new Set(ids).size !== ids.length
    )
      throw new Error('Invalid Poker table size.');
    this.order = [...ids];
    this.settings = settings;
    for (const id of ids)
      this.players.set(id, emptyPlayer(settings.startingChips));
    this.beginRound(now);
  }

  get communityCards() {
    return this.community.slice(0, this.visibleCommunity);
  }

  get dealerCards() {
    // Both dealer cards stay face down (and off the wire) until showdown.
    return this.dealerHoleHidden ? [] : this.dealerHand;
  }

  get dealerHoleHidden() {
    return (
      this.settings.mode === 'ultimate' &&
      this.stage !== 'showdown' &&
      this.stage !== 'complete'
    );
  }

  get dealerHandLabel() {
    return this.dealerHoleHidden || !this.dealerHand.length
      ? ''
      : evaluateBest([...this.dealerHand, ...this.community]).label;
  }

  get rankings() {
    return [...this.players.entries()]
      .sort(([, a], [, b]) => a.rank - b.rank || b.chips - a.chips)
      .map(([id]) => id);
  }

  get activePlayerIndex() {
    return this.order.indexOf(this.activePlayerId);
  }

  publicPlayer(id: string): PokerPlayerState {
    const player = this.players.get(id)!;
    const handLabel =
      player.handLabel ||
      (player.cards.length && this.visibleCommunity
        ? evaluateBest([...player.cards, ...this.communityCards]).label
        : '');
    return {
      ...player,
      handLabel,
      cards: player.cards.map((card) => ({ ...card })),
      bet: { ...player.bet },
      returns: { ...player.returns },
    };
  }

  placeBet(id: string, value: unknown, now: number): PokerActionError | null {
    if (this.settings.mode !== 'ultimate' || this.stage !== 'ultimate-betting')
      return 'not-playing';
    const player = this.players.get(id);
    if (!player || player.departed || this.locked.has(id))
      return 'not-available';
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return 'invalid-bet';
    const ante = (value as Record<string, unknown>).ante as number;
    // The table ante is the minimum; the blind always mirrors whatever ante is chosen.
    if (!Number.isInteger(ante) || ante < this.settings.ante)
      return 'invalid-bet';
    if (ante * 2 > player.chips) return 'not-enough-chips';
    player.chips -= ante * 2;
    player.bet = { ante, blind: ante, play: 0 };
    player.totalBet = ante * 2;
    player.action = 'Ante + Blind posés';
    this.lock(id, now);
    return null;
  }

  /** Seat a player out of the betting phase; deals once every seat is settled. */
  private lock(id: string, now: number) {
    this.locked.add(id);
    if (
      this.stage === 'ultimate-betting' &&
      this.order.every((playerId) => this.locked.has(playerId))
    )
      this.dealUltimate(now);
  }

  act(id: string, action: unknown, now: number): PokerActionError | null {
    if (this.settings.mode === 'ultimate') {
      if (!ULTIMATE_DECISIONS.includes(this.stage)) return 'not-playing';
      if (
        !this.awaitsDecision(id) ||
        (this.activePlayerId && id !== this.activePlayerId)
      )
        return 'not-your-turn';
      return this.actUltimate(id, action, now);
    }
    if (!this.activePlayerId || !this.stage.startsWith('holdem-'))
      return 'not-playing';
    if (id !== this.activePlayerId) return 'not-your-turn';
    return this.actHoldem(id, action, now);
  }

  /**
   * Whether this player still has to decide on the current Ultimate street: everyone
   * in the hand without a play bet chooses once. With every hand face up
   * (`showAllCards`) they all choose at once; otherwise one by one in seat order.
   */
  awaitsDecision(id: string) {
    const player = this.players.get(id);
    return Boolean(
      player &&
      ULTIMATE_DECISIONS.includes(this.stage) &&
      !player.departed &&
      !player.folded &&
      !player.bet.play &&
      !player.acted,
    );
  }

  expire(now: number) {
    if (now < this.deadline || this.stage === 'complete') return false;
    if (this.stage === 'ultimate-betting') {
      for (const [id, player] of this.players)
        if (
          this.stage === 'ultimate-betting' &&
          !this.locked.has(id) &&
          this.placeBet(id, { ante: this.settings.ante }, now)
        ) {
          player.folded = true;
          player.action = 'Hors jeu';
          this.lock(id, now);
        }
    } else if (this.stage === 'showdown') {
      if (this.round >= this.settings.rounds)
        this.completeMatch('rounds-complete');
      else this.beginRound(now);
    } else if (this.settings.mode === 'ultimate') {
      // Whoever has not decided when the clock runs out checks (folds on the river).
      const stage = this.stage;
      const pending = this.activePlayerId
        ? [this.activePlayerId]
        : this.order.filter((entry) => this.awaitsDecision(entry));
      for (const id of pending)
        if (this.stage === stage)
          this.actUltimate(
            id,
            stage === 'ultimate-river' ? 'fold' : 'check',
            now,
          );
    } else {
      const player = this.players.get(this.activePlayerId);
      this.act(
        this.activePlayerId,
        player && this.currentBet === player.streetBet ? 'check' : 'fold',
        now,
      );
    }
    return true;
  }

  /** Queue without touching the current hand, bets, timers, or results. */
  joinNextRound(id: string): boolean {
    if (
      this.stage === 'complete' ||
      this.players.has(id) ||
      this.waitingPlayers.has(id) ||
      [...this.players.values()].filter((player) => !player.departed).length +
        this.waitingPlayers.size >=
        pokerParty.maxPlayers
    )
      return false;
    this.waitingPlayers.add(id);
    return true;
  }

  leave(id: string, now: number) {
    this.waitingPlayers.delete(id);
    const player = this.players.get(id);
    if (!player || player.departed || this.stage === 'complete') return;
    player.departed = true;
    player.folded = true;
    player.acted = true;
    this.lock(id, now);
    if (
      id === this.activePlayerId ||
      (this.settings.mode === 'ultimate' &&
        ULTIMATE_DECISIONS.includes(this.stage))
    )
      this.advance(now);
    if (
      [...this.players.values()].filter((entry) => !entry.departed).length <
      (this.settings.mode === 'ultimate' ? 1 : 2)
    )
      this.completeMatch('departure');
  }

  private beginRound(now: number) {
    // Keep departed seats in the result history, but free their table positions.
    for (let index = this.order.length - 1; index >= 0; index -= 1)
      if (this.players.get(this.order[index]!)?.departed)
        this.order.splice(index, 1);
    for (const id of this.waitingPlayers) {
      this.players.set(id, emptyPlayer(this.settings.startingChips));
      this.order.push(id);
    }
    this.waitingPlayers.clear();
    this.round += 1;
    this.cards = deck(this.random);
    this.dealerHand = [];
    this.community = [];
    this.visibleCommunity = 0;
    this.pot = 0;
    this.currentBet = 0;
    this.winnerId = '';
    this.resultReason = '';
    this.street = 0;
    this.locked.clear();
    for (const player of this.players.values()) {
      player.cards = [];
      player.bet = { ante: 0, blind: 0, play: 0 };
      player.totalBet = 0;
      player.streetBet = 0;
      player.folded = player.departed || player.chips <= 0;
      player.allIn = false;
      player.acted = false;
      player.action = '';
      player.handCategory = 0;
      player.handLabel = '';
      player.payout = 0;
      player.returns = { ante: 0, blind: 0, play: 0 };
      player.blindOdds = 0;
      player.outcome = '';
      player.rank = 0;
    }
    if (this.settings.mode === 'ultimate') {
      this.stage = 'ultimate-betting';
      this.activePlayerId = '';
      this.deadline = now + this.settings.bettingSeconds * 1000;
      this.lastEvent = 'round-start';
      for (const id of this.order)
        if (this.players.get(id)!.folded) this.lock(id, now);
    } else this.beginHoldem(now);
  }

  private dealUltimate(now: number) {
    for (const player of this.players.values())
      if (!player.departed) player.cards = take(this.cards, 2);
    this.dealerHand = take(this.cards, 2);
    this.community = take(this.cards, 5);
    this.visibleCommunity = 0;
    this.stage = 'ultimate-preflop';
    this.activePlayerId = '';
    this.deadline = now + this.settings.bettingSeconds * 1000;
    this.lastEvent = 'deal';
    this.advanceUltimate(now);
  }

  private actUltimate(
    id: string,
    value: unknown,
    now: number,
  ): PokerActionError | null {
    const player = this.players.get(id)!;
    const action = typeof value === 'string' ? value : '';
    const allowed =
      this.stage === 'ultimate-preflop'
        ? ['check', 'raise3', 'raise4']
        : this.stage === 'ultimate-flop'
          ? ['check', 'raise2']
          : ['raise1', 'fold'];
    if (!allowed.includes(action)) return 'invalid-action';
    const multiple =
      action === 'raise4'
        ? 4
        : action === 'raise3'
          ? 3
          : action === 'raise2'
            ? 2
            : action === 'raise1'
              ? 1
              : 0;
    const cost = player.bet.ante * multiple;
    if (cost > player.chips) return 'not-enough-chips';
    if (cost) {
      player.chips -= cost;
      player.totalBet += cost;
      player.bet.play = cost;
      if (player.chips === 0) player.allIn = true;
    }
    player.action =
      action === 'check'
        ? 'Check'
        : action === 'fold'
          ? 'Couché'
          : `Joue ×${multiple}`;
    player.folded = action === 'fold';
    player.acted = true;
    this.lastEvent = action;
    this.advance(now);
    return null;
  }

  private beginHoldem(now: number) {
    this.buttonIndex = (this.buttonIndex + 1) % this.order.length;
    for (const player of this.players.values())
      if (!player.departed) player.cards = take(this.cards, 2);
    this.community = take(this.cards, 5);
    const small = this.order[this.buttonIndex]!;
    const big = this.order[(this.buttonIndex + 1) % this.order.length]!;
    this.putBlind(small, this.settings.smallBlind);
    this.putBlind(big, this.settings.bigBlind);
    this.currentBet = this.settings.bigBlind;
    this.stage = 'holdem-preflop';
    this.activePlayerId = this.nextActive(
      (this.buttonIndex + (this.order.length === 2 ? 0 : 2)) %
        this.order.length,
    );
    this.deadline = now + this.settings.bettingSeconds * 1000;
    this.lastEvent = 'deal';
    if (!this.activePlayerId) this.settleHoldem(now);
  }

  private putBlind(id: string, amount: number) {
    const player = this.players.get(id)!;
    const paid = Math.min(amount, player.chips);
    player.chips -= paid;
    player.streetBet = paid;
    player.totalBet = paid;
    this.pot += paid;
    player.allIn = player.chips === 0;
  }

  private actHoldem(
    id: string,
    value: unknown,
    now: number,
  ): PokerActionError | null {
    const player = this.players.get(id)!;
    const input =
      typeof value === 'string'
        ? { type: value }
        : value && typeof value === 'object'
          ? (value as { type?: unknown; amount?: unknown })
          : {};
    const action = input.type;
    const toCall = Math.max(0, this.currentBet - player.streetBet);
    if (action === 'fold') {
      player.folded = true;
      player.acted = true;
      player.action = 'Couché';
    } else if (action === 'check') {
      if (toCall) return 'must-call';
      player.acted = true;
      player.action = 'Check';
    } else if (action === 'call') {
      if (!toCall) return 'nothing-to-call';
      this.pay(player, toCall);
      player.acted = true;
      player.action = 'Call';
    } else if (action === 'raise') {
      const amount = input.amount;
      if (typeof amount !== 'number') return 'invalid-action';
      if (
        !Number.isInteger(amount) ||
        amount <= this.currentBet ||
        amount < this.currentBet + this.settings.minRaise
      )
        return 'raise-too-small';
      const target = Math.min(amount, player.streetBet + player.chips);
      if (target <= this.currentBet) return 'not-enough-chips';
      this.pay(player, target - player.streetBet);
      this.currentBet = target;
      for (const entry of this.players.values())
        if (!entry.folded && !entry.allIn) entry.acted = false;
      player.acted = true;
      player.action = `Relance à ${target}`;
    } else return 'invalid-action';
    this.lastEvent = String(action);
    this.advance(now);
    return null;
  }

  private pay(player: MutablePlayer, amount: number) {
    const paid = Math.min(amount, player.chips);
    player.chips -= paid;
    player.streetBet += paid;
    player.totalBet += paid;
    this.pot += paid;
    player.allIn = player.chips === 0;
  }

  private advance(now: number) {
    if (this.settings.mode === 'ultimate') this.advanceUltimate(now);
    else this.advanceHoldem(now);
  }

  /**
   * Waits while anyone still has a decision on this street, then opens the next one
   * (one play bet per hand: players who made it sit out the later streets). Turn by
   * turn, each player gets their own clock; simultaneous streets share one.
   */
  private advanceUltimate(now: number) {
    for (;;) {
      const pending = this.order.filter((id) => this.awaitsDecision(id));
      if (pending.length) {
        const next = this.settings.showAllCards ? '' : pending[0]!;
        if (next !== this.activePlayerId) {
          this.activePlayerId = next;
          this.deadline = now + this.settings.bettingSeconds * 1000;
        }
        return;
      }
      this.activePlayerId = '';
      if (this.street >= 2) return this.settleUltimate(now);
      this.street += 1;
      this.stage = stageFor('ultimate', this.street);
      this.visibleCommunity = this.street === 1 ? 3 : 5;
      for (const player of this.players.values()) player.acted = false;
      this.deadline = now + this.settings.bettingSeconds * 1000;
    }
  }

  private advanceHoldem(now: number) {
    const alive = [...this.players.values()].filter(
      (player) => !player.folded && !player.departed,
    );
    if (alive.length <= 1) return this.settleHoldem(now);
    const pending = alive.filter(
      (player) =>
        !player.allIn && (!player.acted || player.streetBet < this.currentBet),
    );
    if (pending.length) {
      this.activePlayerId = this.nextActive(
        this.order.indexOf(this.activePlayerId) + 1,
        (entry) =>
          !entry.folded &&
          !entry.departed &&
          !entry.allIn &&
          (!entry.acted || entry.streetBet < this.currentBet),
      );
      this.deadline = now + this.settings.bettingSeconds * 1000;
      return;
    }
    if (this.street >= 3) return this.settleHoldem(now);
    this.street += 1;
    this.stage = stageFor('holdem', this.street);
    this.visibleCommunity = this.street === 1 ? 3 : this.street === 2 ? 4 : 5;
    this.currentBet = 0;
    // Every live player gets a fresh decision on the new street.
    for (const player of this.players.values()) {
      player.streetBet = 0;
      player.acted = false;
    }
    this.activePlayerId = this.nextActive(
      this.buttonIndex + 1,
      (entry) => !entry.folded && !entry.departed && !entry.allIn,
    );
    this.deadline = now + this.settings.bettingSeconds * 1000;
    if (!this.activePlayerId) this.settleHoldem(now);
  }

  private nextActive(
    start: number,
    predicate: (player: MutablePlayer) => boolean = (player) =>
      !player.folded && !player.departed && !player.allIn,
  ) {
    for (let step = 0; step < this.order.length; step += 1) {
      const id = this.order[(start + step) % this.order.length]!;
      const player = this.players.get(id);
      if (player && predicate(player)) return id;
    }
    return '';
  }

  private settleUltimate(now: number) {
    const dealer = evaluateBest([...this.dealerHand, ...this.community]);
    const qualifies = dealer.category >= 1;
    this.visibleCommunity = 5;
    for (const player of this.players.values()) {
      if (player.departed) continue;
      const hand = evaluateBest([...player.cards, ...this.community]);
      player.handCategory = hand.category;
      player.handLabel = hand.label;
      const comparison = player.folded ? -1 : compareHands(hand, dealer);
      player.returns = player.folded
        ? { ante: 0, blind: 0, play: 0 }
        : ultimateReturns(player.bet, hand, comparison, qualifies);
      player.blindOdds = comparison > 0 ? blindMultiplier(hand) : 0;
      player.payout =
        player.returns.ante + player.returns.blind + player.returns.play;
      player.chips += player.payout;
      player.outcome =
        comparison > 0 ? 'win' : comparison === 0 ? 'push' : 'loss';
    }
    this.rankPlayers();
    this.pot = 0;
    this.winnerId =
      this.order.find((id) => this.players.get(id)?.outcome === 'win') ?? '';
    this.stage = 'showdown';
    this.activePlayerId = '';
    this.deadline = now + showdownMs(this.settings.mode, this.order.length);
    this.lastEvent = qualifies ? 'dealer-qualified' : 'dealer-not-qualified';
  }

  private settleHoldem(now: number) {
    this.visibleCommunity = 5;
    const alive = [...this.players.entries()].filter(
      ([, player]) => !player.folded && !player.departed,
    );
    const hands = alive.map(([id, player]) => ({
      id,
      hand: evaluateBest([...player.cards, ...this.community]),
    }));
    const best = hands.reduce<PokerHand | null>(
      (winner, entry) =>
        !winner || compareHands(entry.hand, winner) > 0 ? entry.hand : winner,
      null,
    );
    const winners = hands.filter(
      (entry) => best && compareHands(entry.hand, best) === 0,
    );
    const share = winners.length ? Math.floor(this.pot / winners.length) : 0;
    for (const player of this.players.values()) {
      if (player.departed) continue;
      const entry = hands.find(
        (item) =>
          item.id === this.order.find((id) => this.players.get(id) === player),
      );
      if (entry) {
        player.handCategory = entry.hand.category;
        player.handLabel = entry.hand.label;
      }
      const won = winners.some(
        (entry) => this.players.get(entry.id) === player,
      );
      player.outcome = won ? (winners.length > 1 ? 'push' : 'win') : 'loss';
      player.payout = won ? share : 0;
      player.chips += player.payout;
    }
    if (winners.length && this.pot % winners.length)
      this.players.get(winners[0]!.id)!.chips += this.pot % winners.length;
    this.winnerId = winners[0]?.id ?? '';
    this.rankPlayers();
    this.pot = 0;
    this.stage = 'showdown';
    this.activePlayerId = '';
    this.deadline = now + showdownMs(this.settings.mode, this.order.length);
    this.lastEvent = 'showdown';
  }

  private rankPlayers() {
    const sorted = [...this.players.entries()].sort(([, a], [, b]) => {
      const outcome = Number(b.outcome === 'win') - Number(a.outcome === 'win');
      return outcome || b.chips - a.chips;
    });
    sorted.forEach(([, player], index) => {
      player.rank = index + 1;
    });
  }

  private completeMatch(reason: string) {
    this.stage = 'complete';
    this.resultReason = reason;
    this.activePlayerId = '';
    this.winnerId = this.rankings[0] ?? '';
  }
}

/** Blind pays only on a winning straight or better: 1:1, 3:2, 3:1, 10:1, 50:1, royal 500:1. */
export function blindMultiplier(hand: PokerHand) {
  if (hand.category === 8 && hand.score[0] === 14) return 500;
  return [0, 0, 0, 0, 1, 1.5, 3, 10, 50][hand.category] ?? 0;
}

/**
 * Chips each wager returns for an Ultimate Poker hand that reached showdown
 * (comparison is player vs dealer). Play pays 1:1 only when you beat the dealer; the
 * ante pays 1:1 on a win against a qualified dealer and always comes back when the
 * dealer does not qualify; the blind pays its paytable on a winning straight or
 * better and pushes on any other win. A tie pushes everything.
 */
export function ultimateReturns(
  bet: PokerBet,
  hand: PokerHand,
  comparison: number,
  dealerQualifies: boolean,
): PokerBet {
  if (comparison === 0) return { ...bet };
  if (comparison < 0)
    return { ante: dealerQualifies ? 0 : bet.ante, blind: 0, play: 0 };
  return {
    play: bet.play * 2,
    ante: dealerQualifies ? bet.ante * 2 : bet.ante,
    blind: bet.blind + Math.floor(bet.blind * blindMultiplier(hand)),
  };
}

export function parsePokerSettings(value: unknown): PokerSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const keys = Object.keys(defaultPokerSettings);
  if (
    Object.keys(input).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(input, key))
  )
    return null;
  if (!['ultimate', 'holdem'].includes(String(input.mode))) return null;
  for (const [key, { min, max }] of Object.entries(pokerSettingsLimits))
    if (
      !Number.isInteger(input[key]) ||
      (input[key] as number) < min ||
      (input[key] as number) > max
    )
      return null;
  if (typeof input.showAllCards !== 'boolean') return null;
  if (
    (input.bigBlind as number) < (input.smallBlind as number) ||
    (input.bigBlind as number) > (input.startingChips as number) ||
    (input.ante as number) * 4 > (input.startingChips as number)
  )
    return null;
  return input as unknown as PokerSettings;
}
