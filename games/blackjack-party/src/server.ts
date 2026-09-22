import {
  blackjackParty,
  defaultBlackjackSettings,
  blackjackSettingsLimits,
  type BlackjackActionError,
  type BlackjackBet,
  type BlackjackHandState,
  type BlackjackPlayerState,
  type BlackjackSettings,
  type BlackjackStage,
  type Card,
  type HandOutcome,
  type Rank,
  type Suit,
} from './index.js';

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
const DEALER_STEP_MS = 650;
const ROUND_RESULTS_MS = 3000;

interface MutableHand extends Omit<
  BlackjackHandState,
  'canDouble' | 'canSplit'
> {}
interface MutablePlayer extends Omit<BlackjackPlayerState, 'hands'> {
  hands: MutableHand[];
}

function integer(value: unknown, min: number, max: number): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= min &&
    (value as number) <= max
  );
}

/** Full, atomic settings update. Relations are validated after scalar bounds. */
export function parseBlackjackSettings(
  value: unknown,
): BlackjackSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).length !==
      Object.keys(defaultBlackjackSettings).length ||
    Object.keys(input).some(
      (key) => !Object.hasOwn(defaultBlackjackSettings, key),
    )
  )
    return null;
  for (const [key, { min, max }] of Object.entries(blackjackSettingsLimits)) {
    if (!integer(input[key], min, max)) return null;
  }
  for (const key of [
    'shuffle',
    'dealerHitsSoft17',
    'allowDouble',
    'allowSplit',
    'doubleAfterSplit',
    'sideBetsEnabled',
    'perfectPairsEnabled',
    'twentyOnePlusThreeEnabled',
    'rebuysEnabled',
  ] as const) {
    if (typeof input[key] !== 'boolean') return null;
  }
  if (![1.2, 1.5, 2].includes(input.blackjackPayout as number)) return null;
  if (
    (input.minBet as number) > (input.maxBet as number) ||
    (input.maxBet as number) > (input.startingChips as number) ||
    (input.minSideBet as number) > (input.maxSideBet as number) ||
    (input.maxSideBet as number) > (input.startingChips as number)
  )
    return null;
  return input as unknown as BlackjackSettings;
}

/** What one card is worth, aces high before any softening. */
function cardValue(rank: Rank) {
  if (rank === 'A') return 11;
  return ['10', 'J', 'Q', 'K'].includes(rank) ? 10 : Number(rank);
}

export function handValue(cards: readonly Card[]) {
  let value = 0;
  let aces = 0;
  for (const card of cards) {
    value += cardValue(card.rank);
    if (card.rank === 'A') aces += 1;
  }
  while (value > 21 && aces > 0) {
    value -= 10;
    aces -= 1;
  }
  return { value, soft: aces > 0 };
}

export type PerfectPairsResult = 'loss' | 'mixed' | 'colored' | 'perfect';

export function perfectPairs(cards: readonly Card[]): PerfectPairsResult {
  if (cards.length < 2 || cards[0]!.rank !== cards[1]!.rank) return 'loss';
  if (cards[0]!.suit === cards[1]!.suit) return 'perfect';
  const red = (suit: Suit) => suit === 'diamonds' || suit === 'hearts';
  return red(cards[0]!.suit) === red(cards[1]!.suit) ? 'colored' : 'mixed';
}

export type TwentyOnePlusThreeResult =
  | 'loss'
  | 'flush'
  | 'straight'
  | 'three-of-a-kind'
  | 'straight-flush'
  | 'suited-trips';

function rankNumber(rank: Rank) {
  if (rank === 'A') return 14;
  if (rank === 'K') return 13;
  if (rank === 'Q') return 12;
  if (rank === 'J') return 11;
  return Number(rank);
}

export function twentyOnePlusThree(
  cards: readonly Card[],
): TwentyOnePlusThreeResult {
  if (cards.length !== 3) return 'loss';
  const sameRank = cards.every((card) => card.rank === cards[0]!.rank);
  const sameSuit = cards.every((card) => card.suit === cards[0]!.suit);
  if (sameRank && sameSuit) return 'suited-trips';
  const values = [...new Set(cards.map((card) => rankNumber(card.rank)))].sort(
    (a, b) => a - b,
  );
  const straight =
    values.length === 3 &&
    ((values[1] === values[0]! + 1 && values[2] === values[1]! + 1) ||
      (values[0] === 2 && values[1] === 3 && values[2] === 14));
  if (straight && sameSuit) return 'straight-flush';
  if (sameRank) return 'three-of-a-kind';
  if (straight) return 'straight';
  return sameSuit ? 'flush' : 'loss';
}

function buildShoe(decks: number, random: () => number) {
  const cards: Card[] = [];
  for (let deck = 0; deck < decks; deck += 1)
    for (const suit of SUITS)
      for (const rank of RANKS) cards.push({ rank, suit });
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [cards[index], cards[swap]] = [cards[swap]!, cards[index]!];
  }
  return cards;
}

function emptyBet(): BlackjackBet {
  return { main: 0, perfectPairs: 0, twentyOnePlusThree: 0 };
}

function emptyPlayer(chips: number): MutablePlayer {
  return {
    chips,
    hands: [],
    bet: emptyBet(),
    betLocked: false,
    perfectPairsResult: '',
    perfectPairsPayout: 0,
    twentyOnePlusThreeResult: '',
    twentyOnePlusThreePayout: 0,
    roundsPlayed: 0,
    roundsWon: 0,
    blackjacks: 0,
    busts: 0,
    doubleDownWins: 0,
    splitWins: 0,
    perfectPairsWins: 0,
    twentyOnePlusThreeWins: 0,
    rebuys: 0,
    globalCurrencySpentOnRebuys: 0,
    rank: 0,
    departed: false,
  };
}

function emptyHand(bet: number, card?: Card): MutableHand {
  return {
    cards: card ? [card] : [],
    bet,
    status: 'playing',
    outcome: '',
    payout: 0,
    doubled: false,
    fromSplit: false,
    value: card ? handValue([card]).value : 0,
    soft: card ? handValue([card]).soft : false,
  };
}

/** Pure authoritative match. The Colyseus room supplies monotonic time and timers. */
export class BlackjackGame {
  readonly players = new Map<string, MutablePlayer>();
  readonly order: string[];
  private readonly waitingPlayers = new Set<string>();
  stage: BlackjackStage = 'betting';
  round = 0;
  deadline = 0;
  activePlayerId = '';
  activeHandIndex = 0;
  dealerHoleHidden = false;
  dealerValue = 0;
  winnerId = '';
  lastEvent = '';
  resultReason = '';
  private dealerHand: Card[] = [];
  private shoe: Card[];
  private shoeIndex = 0;
  private stackedShoe: boolean;

  constructor(
    ids: string[],
    readonly settings: Readonly<BlackjackSettings>,
    now: number,
    private readonly random: () => number = Math.random,
    stackedCards?: readonly Card[],
  ) {
    if (
      ids.length < blackjackParty.minPlayers ||
      ids.length > blackjackParty.maxPlayers ||
      new Set(ids).size !== ids.length
    )
      throw new Error(
        `A Blackjack match needs ${blackjackParty.minPlayers}–${blackjackParty.maxPlayers} distinct players.`,
      );
    this.order = [...ids];
    for (const id of ids)
      this.players.set(id, emptyPlayer(settings.startingChips));
    this.shoe = stackedCards
      ? stackedCards.map((card) => ({ ...card }))
      : buildShoe(settings.decks, random);
    this.stackedShoe = Boolean(stackedCards);
    this.beginRound(now);
  }

  get dealerCards(): readonly Card[] {
    return this.dealerHoleHidden
      ? this.dealerHand.slice(0, 1)
      : this.dealerHand;
  }

  get dealerCardCount() {
    return this.dealerHand.length;
  }

  get rankings() {
    return [...this.players.entries()]
      .sort(([, a], [, b]) => a.rank - b.rank)
      .map(([id]) => id);
  }

  publicPlayer(id: string): BlackjackPlayerState {
    const player = this.players.get(id)!;
    return {
      ...player,
      bet: { ...player.bet },
      hands: player.hands.map((hand) => ({
        ...hand,
        cards: hand.cards.map((card) => ({ ...card })),
        canDouble: this.canDouble(id, hand),
        canSplit: this.canSplit(id, hand),
      })),
    };
  }

  placeBet(
    id: string,
    value: unknown,
    now: number,
  ): BlackjackActionError | null {
    if (this.stage !== 'betting') return 'not-betting';
    const player = this.players.get(id);
    if (!player || player.departed) return 'not-betting';
    if (player.betLocked) return 'bet-locked';
    const bet = this.validBet(value, player.chips);
    if (!bet) return 'invalid-bet';
    const total = bet.main + bet.perfectPairs + bet.twentyOnePlusThree;
    if (total > player.chips) return 'not-enough-chips';
    player.chips -= total;
    player.bet = bet;
    player.betLocked = true;
    if (bet.main > 0) {
      player.hands = [emptyHand(bet.main)];
      player.roundsPlayed += 1;
    }
    this.lastEvent = bet.main > 0 ? 'bet-locked' : 'round-skipped';
    if (
      [...this.players.values()].every(
        (entry) => entry.departed || entry.betLocked,
      )
    )
      this.deal(now);
    return null;
  }

  act(id: string, action: unknown, now: number): BlackjackActionError | null {
    if (this.stage !== 'playing') return 'not-playing';
    if (id !== this.activePlayerId) return 'not-your-turn';
    if (!['hit', 'stand', 'double', 'split'].includes(String(action)))
      return 'not-playing';
    const player = this.players.get(id)!;
    const hand = player.hands[this.activeHandIndex]!;
    if (action === 'hit') {
      hand.cards.push(this.draw());
      this.refreshHand(hand);
      this.lastEvent = 'hit';
      if (hand.status === 'playing')
        this.deadline = now + this.settings.actionSeconds * 1000;
      else this.advanceTurn(now);
      return null;
    }
    if (action === 'stand') {
      hand.status = 'stood';
      this.lastEvent = 'stand';
      this.advanceTurn(now);
      return null;
    }
    if (action === 'double') {
      if (!this.settings.allowDouble) return 'double-disabled';
      if (!this.canDouble(id, hand)) return 'double-not-allowed';
      player.chips -= hand.bet;
      hand.bet *= 2;
      hand.doubled = true;
      hand.cards.push(this.draw());
      this.refreshHand(hand);
      if (hand.status === 'playing') hand.status = 'stood';
      this.lastEvent = 'double';
      this.advanceTurn(now);
      return null;
    }
    if (!this.settings.allowSplit) return 'split-disabled';
    if (!this.canSplit(id, hand)) return 'split-not-allowed';
    player.chips -= hand.bet;
    const [first, second] = hand.cards;
    const firstHand = emptyHand(hand.bet, first);
    const secondHand = emptyHand(hand.bet, second);
    firstHand.fromSplit = true;
    secondHand.fromSplit = true;
    player.hands.splice(this.activeHandIndex, 1, firstHand, secondHand);
    firstHand.cards.push(this.draw());
    secondHand.cards.push(this.draw());
    this.refreshHand(firstHand);
    this.refreshHand(secondHand);
    if (first?.rank === 'A') {
      firstHand.status = 'stood';
      secondHand.status = 'stood';
    }
    if (firstHand.value === 21) firstHand.status = 'stood';
    if (secondHand.value === 21) secondHand.status = 'stood';
    this.lastEvent = 'split';
    if (firstHand.status === 'playing')
      this.deadline = now + this.settings.actionSeconds * 1000;
    else this.advanceTurn(now);
    return null;
  }

  expire(now: number) {
    if (now < this.deadline || this.stage === 'complete') return false;
    if (this.stage === 'betting') {
      for (const player of this.players.values()) player.betLocked = true;
      this.lastEvent = 'betting-ended';
      this.deal(now);
    } else if (this.stage === 'playing') {
      const hand = this.players.get(this.activePlayerId)?.hands[
        this.activeHandIndex
      ];
      if (hand?.status === 'playing') hand.status = 'stood';
      this.lastEvent = 'action-timeout';
      this.advanceTurn(now);
    } else if (this.stage === 'dealer') this.dealerStep(now);
    else if (this.stage === 'round-results') {
      if (this.round >= this.settings.rounds)
        this.completeMatch('rounds-complete');
      else this.beginRound(now);
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
        blackjackParty.maxPlayers
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
    player.betLocked = true;
    if (id === this.activePlayerId) {
      for (const hand of player.hands)
        if (hand.status === 'playing') hand.status = 'stood';
      this.advanceTurn(now);
    }
    // A table is still a table with one player on it, so only an empty one ends here.
    if (
      [...this.players.values()].filter((entry) => !entry.departed).length <
      blackjackParty.minPlayers
    )
      this.completeMatch('departure');
  }

  canRebuy(id: string): BlackjackActionError | null {
    const player = this.players.get(id);
    if (this.stage !== 'betting' || !player || player.departed)
      return 'not-betting';
    if (!this.settings.rebuysEnabled) return 'rebuy-disabled';
    if (player.chips >= this.settings.minBet) return 'rebuy-not-needed';
    if (player.rebuys >= this.settings.maxRebuys) return 'rebuy-limit';
    return null;
  }

  grantRebuy(id: string) {
    const error = this.canRebuy(id);
    if (error) return error;
    const player = this.players.get(id)!;
    player.chips += this.settings.rebuyChipAmount;
    player.rebuys += 1;
    player.globalCurrencySpentOnRebuys += this.settings.rebuyCost;
    player.betLocked = false;
    this.lastEvent = 'rebuy';
    return null;
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
    this.stage = 'betting';
    this.deadline = now + this.settings.bettingSeconds * 1000;
    this.activePlayerId = '';
    this.activeHandIndex = 0;
    this.dealerHand = [];
    this.dealerHoleHidden = false;
    this.dealerValue = 0;
    this.lastEvent = 'round-start';
    // Shuffling on puts every played card back before the next round, so the shoe keeps
    // its full composition. Off, it is a real shoe: it wears down and is only replaced
    // once it is too thin to deal from safely.
    if (
      !this.stackedShoe &&
      (this.settings.shuffle ||
        this.shoe.length - this.shoeIndex <
          Math.max(20, 13 * this.settings.decks))
    ) {
      this.shoe = this.reshuffle();
      this.shoeIndex = 0;
    }
    for (const player of this.players.values()) {
      player.hands = [];
      player.bet = emptyBet();
      player.betLocked = player.departed;
      player.perfectPairsResult = '';
      player.perfectPairsPayout = 0;
      player.twentyOnePlusThreeResult = '';
      player.twentyOnePlusThreePayout = 0;
    }
  }

  private validBet(value: unknown, chips: number): BlackjackBet | null {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    const bet = value as Record<string, unknown>;
    if (
      Object.keys(bet).length !== 3 ||
      !Object.keys(bet).every((key) =>
        ['main', 'perfectPairs', 'twentyOnePlusThree'].includes(key),
      )
    )
      return null;
    for (const key of ['main', 'perfectPairs', 'twentyOnePlusThree'] as const)
      if (!integer(bet[key], 0, 100000)) return null;
    const result = bet as unknown as BlackjackBet;
    if (result.main === 0)
      return result.perfectPairs === 0 && result.twentyOnePlusThree === 0
        ? result
        : null;
    if (
      result.main < this.settings.minBet ||
      result.main > Math.min(this.settings.maxBet, chips)
    )
      return null;
    if (!this.validSideBet(result.perfectPairs, 'perfectPairs')) return null;
    if (!this.validSideBet(result.twentyOnePlusThree, 'twentyOnePlusThree'))
      return null;
    return result;
  }

  private validSideBet(
    amount: number,
    kind: 'perfectPairs' | 'twentyOnePlusThree',
  ) {
    if (amount === 0) return true;
    const enabled =
      this.settings.sideBetsEnabled &&
      (kind === 'perfectPairs'
        ? this.settings.perfectPairsEnabled
        : this.settings.twentyOnePlusThreeEnabled);
    return (
      enabled &&
      amount >= this.settings.minSideBet &&
      amount <= this.settings.maxSideBet
    );
  }

  private deal(now: number) {
    const playing = this.order.filter(
      (id) => this.players.get(id)!.bet.main > 0,
    );
    if (playing.length === 0) {
      this.finishRound(now);
      return;
    }
    for (const id of playing)
      this.players.get(id)!.hands[0]!.cards.push(this.draw());
    this.dealerHand.push(this.draw());
    for (const id of playing)
      this.players.get(id)!.hands[0]!.cards.push(this.draw());
    for (const id of playing) {
      const player = this.players.get(id)!;
      const hand = player.hands[0]!;
      this.refreshHand(hand);
      if (hand.value === 21) {
        hand.status = 'blackjack';
        player.blackjacks += 1;
      }
      this.resolveSideBets(player, hand.cards, this.dealerHand[0]!);
    }
    this.lastEvent = 'dealt';
    this.activateFirstHand(now);
  }

  private resolveSideBets(player: MutablePlayer, cards: Card[], upCard: Card) {
    if (player.bet.perfectPairs > 0) {
      const result = perfectPairs(cards);
      player.perfectPairsResult = result;
      const odds =
        result === 'perfect'
          ? this.settings.perfectPairPayout
          : result === 'colored'
            ? this.settings.perfectPairColoredPayout
            : result === 'mixed'
              ? this.settings.perfectPairMixedPayout
              : 0;
      if (odds) {
        player.perfectPairsPayout = player.bet.perfectPairs * (odds + 1);
        player.chips += player.perfectPairsPayout;
        player.perfectPairsWins += 1;
      }
    }
    if (player.bet.twentyOnePlusThree > 0) {
      const result = twentyOnePlusThree([...cards, upCard]);
      player.twentyOnePlusThreeResult = result;
      const odds =
        result === 'suited-trips'
          ? this.settings.twentyOnePlusThreeSuitedTripsPayout
          : result === 'straight-flush'
            ? this.settings.twentyOnePlusThreeStraightFlushPayout
            : result === 'three-of-a-kind'
              ? this.settings.twentyOnePlusThreeTripsPayout
              : result === 'straight'
                ? this.settings.twentyOnePlusThreeStraightPayout
                : result === 'flush'
                  ? this.settings.twentyOnePlusThreeFlushPayout
                  : 0;
      if (odds) {
        player.twentyOnePlusThreePayout =
          player.bet.twentyOnePlusThree * (odds + 1);
        player.chips += player.twentyOnePlusThreePayout;
        player.twentyOnePlusThreeWins += 1;
      }
    }
  }

  private activateFirstHand(now: number) {
    for (
      let playerIndex = 0;
      playerIndex < this.order.length;
      playerIndex += 1
    ) {
      const id = this.order[playerIndex]!;
      const handIndex = this.players
        .get(id)!
        .hands.findIndex((hand) => hand.status === 'playing');
      if (handIndex >= 0) return this.activate(id, handIndex, now);
    }
    this.beginDealer(now);
  }

  private advanceTurn(now: number) {
    const playerIndex = this.order.indexOf(this.activePlayerId);
    const player = this.players.get(this.activePlayerId);
    if (player) {
      for (
        let index = this.activeHandIndex + 1;
        index < player.hands.length;
        index += 1
      )
        if (player.hands[index]!.status === 'playing')
          return this.activate(this.activePlayerId, index, now);
    }
    for (let index = playerIndex + 1; index < this.order.length; index += 1) {
      const id = this.order[index]!;
      const handIndex = this.players
        .get(id)!
        .hands.findIndex((hand) => hand.status === 'playing');
      if (handIndex >= 0) return this.activate(id, handIndex, now);
    }
    this.beginDealer(now);
  }

  private activate(id: string, handIndex: number, now: number) {
    this.stage = 'playing';
    this.activePlayerId = id;
    this.activeHandIndex = handIndex;
    this.deadline = now + this.settings.actionSeconds * 1000;
  }

  private beginDealer(now: number) {
    this.stage = 'dealer';
    this.activePlayerId = '';
    this.dealerHoleHidden = false;
    // The dealer has been sitting on one card all round; they take the second now.
    if (this.dealerHand.length < 2) this.dealerHand.push(this.draw());
    this.dealerValue = handValue(this.dealerHand).value;
    this.deadline = now + DEALER_STEP_MS;
    this.lastEvent = 'dealer-reveal';
  }

  private dealerStep(now: number) {
    const score = handValue(this.dealerHand);
    if (
      score.value < 17 ||
      (score.value === 17 && score.soft && this.settings.dealerHitsSoft17)
    ) {
      this.dealerHand.push(this.draw());
      this.dealerValue = handValue(this.dealerHand).value;
      this.deadline = now + DEALER_STEP_MS;
      this.lastEvent = 'dealer-hit';
      return;
    }
    this.finishRound(now);
  }

  private finishRound(now: number) {
    this.dealerHoleHidden = false;
    const dealer = handValue(this.dealerHand);
    this.dealerValue = dealer.value;
    const dealerBlackjack = this.dealerHand.length === 2 && dealer.value === 21;
    for (const player of this.players.values()) {
      if (player.hands.length === 0) continue;
      const totalWager = player.hands.reduce((sum, hand) => sum + hand.bet, 0);
      let totalReturn = 0;
      for (const hand of player.hands) {
        hand.outcome = this.outcome(hand, dealer.value, dealerBlackjack);
        hand.payout = this.payout(hand);
        player.chips += hand.payout;
        totalReturn += hand.payout;
        if (hand.outcome === 'win' || hand.outcome === 'blackjack') {
          if (hand.doubled) player.doubleDownWins += 1;
          if (hand.fromSplit) player.splitWins += 1;
        }
      }
      if (totalReturn > totalWager) player.roundsWon += 1;
    }
    this.stage = 'round-results';
    this.activePlayerId = '';
    this.deadline = now + ROUND_RESULTS_MS;
    this.lastEvent = 'round-settled';
  }

  private outcome(
    hand: MutableHand,
    dealerValue: number,
    dealerBlackjack: boolean,
  ): HandOutcome {
    if (hand.status === 'bust') return 'loss';
    if (hand.status === 'blackjack')
      return dealerBlackjack ? 'push' : 'blackjack';
    if (dealerBlackjack) return 'loss';
    if (dealerValue > 21) return 'win';
    if (hand.value > dealerValue) return 'win';
    if (hand.value < dealerValue) return 'loss';
    return 'push';
  }

  private payout(hand: MutableHand) {
    if (hand.outcome === 'push') return hand.bet;
    if (hand.outcome === 'win') return hand.bet * 2;
    if (hand.outcome === 'blackjack')
      return hand.bet + Math.floor(hand.bet * this.settings.blackjackPayout);
    return 0;
  }

  private completeMatch(reason: string) {
    const ranked = [...this.players.entries()].sort(
      ([idA, a], [idB, b]) =>
        b.chips - a.chips ||
        b.blackjacks - a.blackjacks ||
        b.roundsWon - a.roundsWon ||
        a.rebuys - b.rebuys ||
        this.order.indexOf(idA) - this.order.indexOf(idB),
    );
    ranked.forEach(([, player], index) => {
      player.rank = index + 1;
    });
    this.stage = 'complete';
    this.deadline = 0;
    this.activePlayerId = '';
    this.winnerId = ranked[0]?.[0] ?? '';
    this.resultReason = reason;
    this.lastEvent = 'match-complete';
  }

  private refreshHand(hand: MutableHand) {
    const score = handValue(hand.cards);
    hand.value = score.value;
    hand.soft = score.soft;
    if (score.value > 21) {
      if (hand.status !== 'bust') {
        const owner = [...this.players.values()].find((player) =>
          player.hands.includes(hand),
        );
        if (owner) owner.busts += 1;
      }
      hand.status = 'bust';
    } else if (score.value === 21 && hand.cards.length > 2)
      hand.status = 'stood';
  }

  private canDouble(id: string, hand: MutableHand) {
    const player = this.players.get(id)!;
    return (
      this.stage === 'playing' &&
      id === this.activePlayerId &&
      hand === player.hands[this.activeHandIndex] &&
      this.settings.allowDouble &&
      hand.cards.length === 2 &&
      !hand.doubled &&
      player.chips >= hand.bet &&
      (!hand.fromSplit || this.settings.doubleAfterSplit)
    );
  }

  private canSplit(id: string, hand: MutableHand) {
    const player = this.players.get(id)!;
    return (
      this.stage === 'playing' &&
      id === this.activePlayerId &&
      hand === player.hands[this.activeHandIndex] &&
      this.settings.allowSplit &&
      hand.cards.length === 2 &&
      cardValue(hand.cards[0]!.rank) === cardValue(hand.cards[1]!.rank) &&
      player.hands.length - 1 < this.settings.maxSplits &&
      player.chips >= hand.bet
    );
  }

  private reshuffle() {
    return buildShoe(this.settings.decks, this.random);
  }

  /** Cards still to come, so the table can show how deep the shoe is. */
  get shoeRemaining() {
    return Math.max(0, this.shoe.length - this.shoeIndex);
  }

  /** Cards dealt out of the current shoe. */
  get shoeUsed() {
    return this.shoeIndex;
  }

  private draw() {
    if (this.shoeIndex >= this.shoe.length) {
      this.shoe = this.reshuffle();
      this.shoeIndex = 0;
      this.stackedShoe = false;
    }
    return { ...this.shoe[this.shoeIndex++]! };
  }
}
