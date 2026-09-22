import { useAppReducedMotion as useReducedMotion } from './MotionPreferences';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import { AnimatePresence, motion, type MotionStyle } from 'motion/react';
import type {
  BlackjackAction,
  BlackjackBet,
  BlackjackHandState,
  BlackjackPlayerState,
  Card,
} from '@but/blackjack-party';
import type { BlackjackSnapshot } from './lobbyConnection';
import { PlayerAvatar } from './Avatar';
import { Icon } from './Icon';
import { spring } from './spring';
import { t } from './i18n';
import { CardBack, CardCosmetics, useCardCosmetics } from './CosmeticPreview';
import { cardDealOrigin } from './cosmetics';

type Settings = BlackjackSnapshot['settings'];
type LobbyPlayer = BlackjackSnapshot['players'][number];

const EMPTY_BET: BlackjackBet = {
  main: 0,
  perfectPairs: 0,
  twentyOnePlusThree: 0,
};

/** Placeholder so every seat keeps a card row mounted between deals. */
const EMPTY_HAND: BlackjackHandState = {
  cards: [],
  bet: 0,
  status: 'playing',
  outcome: '',
  payout: 0,
  doubled: false,
  fromSplit: false,
  value: 0,
  soft: false,
  canDouble: false,
  canSplit: false,
};

export function BlackjackPlay({
  state,
  sessionId,
  send,
  error,
  onPlayerClick,
}: {
  state: BlackjackSnapshot;
  sessionId: string;
  send: (type: string, payload?: unknown) => void;
  error: string;
  /** Opens the player's card (stats, and kicking for the host). */
  onPlayerClick: (id: string, anchor: HTMLElement) => void;
}) {
  const { game, settings } = state;
  const self = game.players.get(sessionId);
  const [bet, setBet] = useState<BlackjackBet>(EMPTY_BET);
  // The last bet you actually placed, offered back as a one-tap rebet next round.
  const [lastBet, setLastBet] = useState<BlackjackBet | null>(null);
  useEffect(() => setBet(EMPTY_BET), [game.round]);
  const betting = game.stage === 'betting';
  const yourTurn = game.activePlayerId === sessionId;
  const activeHand = self?.hands[game.activeHandIndex];

  // You always sit at the bottom centre of the arc; the others keep their relative order.
  const seats = useMemo(() => {
    const list = state.players.filter(
      (player) => !player.spectator && game.players.has(player.id),
    );
    const you = list.findIndex((player) => player.id === sessionId);
    if (you < 0 || list.length < 2) return list;
    const shift =
      (you - Math.floor((list.length - 1) / 2) + list.length) % list.length;
    return [...list.slice(shift), ...list.slice(0, shift)];
  }, [state.players, game.players, sessionId]);

  const canBet = Boolean(
    self && !self.betLocked && self.chips >= settings.minBet && betting,
  );
  const shoe = useRef<HTMLDivElement>(null);

  // Phones show the seats as a swipeable strip; whoever has to act slides to its
  // centre, and you otherwise. Desktop seats never scroll, so there this is a no-op.
  const seatList = useRef<HTMLUListElement>(null);
  const reduced = useReducedMotion();
  const focusId =
    (game.stage === 'playing' && game.activePlayerId) || sessionId;
  useEffect(() => {
    const list = seatList.current;
    const seat = list?.querySelector<HTMLElement>(
      `[data-seat="${CSS.escape(focusId)}"]`,
    );
    if (!list || !seat) return;
    list.scrollTo({
      left: seat.offsetLeft + seat.offsetWidth / 2 - list.clientWidth / 2,
      behavior: reduced ? 'auto' : 'smooth',
    });
  }, [focusId, seats.length, reduced]);

  return (
    <ShoeContext value={shoe}>
      <div
        className="bj blackjack-table"
        data-stage={game.stage}
        data-your-turn={yourTurn}
      >
        <header className="bj-bar">
          <div className="bj-round">
            <strong>{t.bj.round(game.round, settings.rounds)}</strong>
            <span>{stageLabel(game.stage)}</span>
          </div>
          {game.stage !== 'complete' && (
            <Timer
              endsAt={game.endsAt}
              seconds={
                betting ? settings.bettingSeconds : settings.actionSeconds
              }
              // Only the stages you have to act in run the clock down urgently.
              urgent={betting || game.stage === 'playing'}
            />
          )}
        </header>

        <div className="bj-felt" data-crowded={seats.length > 4}>
          <div className="bj-shoe" ref={shoe} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>

          {/*
            With shuffling off the shoe wears down, so the cards that have gone sit in
            a tray on the far side the way they would on a real table. Shuffling on
            puts them straight back, so there is nothing to show.
          */}
          {!settings.shuffle && game.shoeUsed > 0 && (
            <DiscardTray used={game.shoeUsed} remaining={game.shoeRemaining} />
          )}

          <section className="bj-dealer" aria-label={t.bj.dealerLabel}>
            <CardRow
              cards={game.dealerCards}
              count={game.dealerCardCount}
              holeHidden={game.dealerHoleHidden}
              // The dealer takes their card after the table, each time round.
              deal={{ order: seats.length, of: seats.length }}
            />
            <p className="bj-dealer-name">
              {t.bj.dealerLabel}
              {!game.dealerHoleHidden && game.dealerValue > 0 && (
                <motion.b key={game.dealerValue} {...pop}>
                  {game.dealerValue}
                </motion.b>
              )}
            </p>
            <p className="bj-house-rules" aria-hidden="true">
              <span>
                {t.bj.blackjack} {payoutLabel(settings.blackjackPayout)}
              </span>
              <span>
                {settings.dealerHitsSoft17 ? t.bj.hit : t.bj.stand} · 17
              </span>
            </p>
          </section>

          <ul className="bj-seats" ref={seatList}>
            {seats.map((player, index) => (
              <Seat
                key={player.id}
                player={player}
                hand={game.players.get(player.id)}
                position={seatPosition(index, seats.length)}
                active={game.activePlayerId === player.id}
                activeHandIndex={game.activeHandIndex}
                you={player.id === sessionId}
                bet={player.id === sessionId && canBet ? bet : undefined}
                settings={settings}
                onBet={setBet}
                deal={{ order: index, of: seats.length }}
                onPlayerClick={onPlayerClick}
              />
            ))}
          </ul>
        </div>

        <footer className="bj-dock" aria-live="polite">
          {betting && self && (
            <BettingDock
              player={self}
              bet={bet}
              setBet={setBet}
              settings={settings}
              send={send}
              lastBet={lastBet}
              onRemember={setLastBet}
            />
          )}
          {game.stage === 'playing' && (
            <div className="bj-actions">
              {yourTurn ? (
                (['hit', 'stand', 'double', 'split'] as BlackjackAction[])
                  .filter(
                    (action) =>
                      (action !== 'double' || activeHand?.canDouble) &&
                      (action !== 'split' || activeHand?.canSplit),
                  )
                  .map((action) => (
                    <motion.button
                      key={action}
                      type="button"
                      className={`button bj-action is-${action}`}
                      onClick={() => send('action', action)}
                      initial={{ opacity: 0, y: 12, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={spring}
                    >
                      {t.bj[action]}
                    </motion.button>
                  ))
              ) : (
                <p className="bj-wait">{t.bj.waitingTurn}</p>
              )}
            </div>
          )}
          {game.stage === 'dealer' && <p className="bj-wait">{t.bj.dealer}</p>}
          {game.stage === 'round-results' &&
            (self ? <RoundNet player={self} /> : null)}
          <AnimatePresence>
            {error && (
              <motion.p
                className="bj-error"
                role="alert"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>
        </footer>
      </div>
    </ShoeContext>
  );
}

/** How tall the tray gets before it stops growing and just counts. */
const DISCARD_SHOWN = 12;

/**
 * Cards already dealt out of this shoe, face down the way a real discard tray sits,
 * with how deep the shoe still is. Only the count crosses the wire — what was played
 * is never shown, so nothing about the cards leaks through it.
 */
function DiscardTray({ used, remaining }: { used: number; remaining: number }) {
  const backs = Math.min(used, DISCARD_SHOWN);
  return (
    <div className="bj-discard" aria-label={t.bj.discardTray(used, remaining)}>
      <span
        className="bj-discard-pile"
        style={{ '--backs': backs } as CSSProperties}
        aria-hidden="true"
      >
        <AnimatePresence initial={false}>
          {Array.from({ length: backs }, (_, index) => (
            <motion.span
              key={used - backs + index}
              className="bj-discard-card"
              style={{ '--card-index': index, zIndex: index } as MotionStyle}
              initial={{ x: 40, opacity: 0, rotate: 14 }}
              animate={{ x: 0, opacity: 1, rotate: (index % 3) - 1 }}
              exit={{ opacity: 0 }}
              transition={spring}
            >
              <img src="/blackjack-party/card-back.png" alt="" />
            </motion.span>
          ))}
        </AnimatePresence>
      </span>
      <span className="bj-discard-count" aria-hidden="true">
        <b>{remaining}</b>
        {t.bj.shoeLeft}
      </span>
    </div>
  );
}

/** The shoe every card flies out of; each card row measures its own path back to it. */
const ShoeContext = createContext<RefObject<HTMLDivElement | null> | null>(
  null,
);

/** Deal or sit out, and the rebuy offer once you cannot cover the minimum bet. */
function BettingDock({
  player,
  bet,
  setBet,
  settings,
  send,
  lastBet,
  onRemember,
}: {
  player: BlackjackPlayerState;
  bet: BlackjackBet;
  setBet: Dispatch<SetStateAction<BlackjackBet>>;
  settings: Settings;
  send: (type: string, payload?: unknown) => void;
  lastBet: BlackjackBet | null;
  onRemember: (bet: BlackjackBet) => void;
}) {
  if (player.betLocked) return <p className="bj-wait">{t.bj.waitingBets}</p>;

  if (player.chips < settings.minBet)
    return (
      <>
        <p className="bj-wait">
          {t.bj.outOfChips}{' '}
          <span>{t.bj.rebuyCount(player.rebuys, settings.maxRebuys)}</span>
        </p>
        <div className="bj-actions">
          <button
            className="button secondary"
            type="button"
            onClick={() => send('bet', EMPTY_BET)}
          >
            {t.bj.skipRebuy}
          </button>
          {settings.rebuysEnabled && player.rebuys < settings.maxRebuys && (
            <button
              className="button primary"
              type="button"
              onClick={() => send('rebuy')}
            >
              <Icon name="coin" /> {t.bj.rebuy} · {settings.rebuyCost}
            </button>
          )}
        </div>
      </>
    );

  const total = bet.main + bet.perfectPairs + bet.twentyOnePlusThree;
  const canRebet = !total && lastBet && betTotal(lastBet) <= player.chips;
  return (
    <>
      <p className="bj-hint">
        {t.bj.tapToBet}
        <span>{t.bj.betLimits(settings.minBet, settings.maxBet)}</span>
      </p>
      <div className="bj-actions">
        {total > 0 && (
          <button
            className="button secondary bj-clear"
            type="button"
            onClick={() => setBet(EMPTY_BET)}
          >
            {t.bj.clearBet}
          </button>
        )}
        {/* Most rounds you want the same bet again; typing it back in every time is a chore. */}
        {canRebet && (
          <button
            className="button secondary"
            type="button"
            onClick={() => setBet(lastBet)}
          >
            {t.bj.rebet(betTotal(lastBet))}
          </button>
        )}
        <button
          className={`button bj-deal ${total ? 'primary' : 'secondary'}`}
          type="button"
          disabled={total > player.chips}
          onClick={() => {
            send('bet', total ? bet : EMPTY_BET);
            if (total) onRemember(bet);
            setBet(EMPTY_BET);
          }}
        >
          {total ? `${t.bj.placeBets} · ${total}` : t.bj.sitOut}
          {total > 0 && <Icon name="arrow" />}
        </button>
      </div>
    </>
  );
}

function betTotal(bet: BlackjackBet) {
  return bet.main + bet.perfectPairs + bet.twentyOnePlusThree;
}

/**
 * What the round actually cost or paid you. Every payout the server reports is a gross
 * return, so each stake comes back off it.
 */
function RoundNet({ player }: { player: BlackjackPlayerState }) {
  const net =
    player.hands.reduce((sum, hand) => sum + hand.payout - hand.bet, 0) +
    (player.perfectPairsPayout - player.bet.perfectPairs) +
    (player.twentyOnePlusThreePayout - player.bet.twentyOnePlusThree);
  return (
    <motion.p
      className={`bj-net is-${net > 0 ? 'up' : net < 0 ? 'down' : 'even'}`}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={spring}
    >
      <span>{t.bj.roundResults}</span>
      <strong>
        {net > 0 ? '+' : ''}
        {net}
      </strong>
    </motion.p>
  );
}

function Seat({
  player,
  hand,
  position,
  active,
  activeHandIndex,
  you,
  bet,
  settings,
  onBet,
  deal,
  onPlayerClick,
}: {
  player: LobbyPlayer;
  hand: BlackjackPlayerState | undefined;
  position: CSSProperties;
  active: boolean;
  activeHandIndex: number;
  you: boolean;
  bet: BlackjackBet | undefined;
  settings: Settings;
  onBet: Dispatch<SetStateAction<BlackjackBet>>;
  deal: DealSlot;
  onPlayerClick: (id: string, anchor: HTMLElement) => void;
}) {
  if (!hand) return null;
  const sideBets = settings.sideBetsEnabled;
  // The server opens a hand as soon as a bet locks, before any card is dealt.
  const dealt = hand.hands.some((each) => each.cards.length > 0);
  return (
    <CardCosmetics value={player.cosmetics}>
      <li
        className={`bj-seat${active ? ' is-active' : ''}${you ? ' is-you' : ''}`}
        style={position}
        data-seat={player.id}
      >
        <div className="bj-seat-hands">
          {/*
          A seat always keeps one hand mounted, empty or not. It renders nothing until
          cards arrive, but it has to exist beforehand to measure its path from the
          shoe — a row mounted in the same commit as its first cards is measured too
          late for them to fly in from anywhere.
        */}
          {(hand.hands.length > 0 ? hand.hands : [EMPTY_HAND]).map(
            (each, index) => (
              <Hand
                key={index}
                hand={each}
                active={active && index === activeHandIndex}
                deal={deal}
              />
            ),
          )}

          {/* Locked bets stay on the felt, so you can read the table before the deal. */}
          {!bet && !dealt && hand.bet.main > 0 && (
            <div className="bj-spots is-locked">
              {(
                [
                  [t.bj.mainBet, hand.bet.main, false],
                  [t.bj.perfectPairs, hand.bet.perfectPairs, true],
                  [t.bj.twentyOnePlusThree, hand.bet.twentyOnePlusThree, true],
                ] as const
              )
                .filter(([, amount]) => amount > 0)
                .map(([label, amount, small]) => (
                  <motion.span
                    key={label}
                    className={`bj-spot has-chips is-locked${small ? ' is-side' : ''}`}
                    aria-label={`${label}: ${amount}`}
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={spring}
                  >
                    <ChipStack total={amount} />
                  </motion.span>
                ))}
            </div>
          )}

          {/*
        The table's own betting layout: optional side-bet circles sit behind the main
        one, toward the dealer, so they read as extras rather than three equal choices.
      */}
          {bet && (
            <div className="bj-spots">
              {sideBets &&
                (settings.perfectPairsEnabled ||
                  settings.twentyOnePlusThreeEnabled) && (
                  <div className="bj-side-spots">
                    <span className="bj-side-caption">{t.bj.sideBets}</span>
                    <div>
                      {settings.perfectPairsEnabled && (
                        <BetSpot
                          side
                          label={t.bj.perfectPairs}
                          caption={t.bj.pairsShort}
                          payouts={[
                            [t.bj.mixedPair, settings.perfectPairMixedPayout],
                            [
                              t.bj.coloredPair,
                              settings.perfectPairColoredPayout,
                            ],
                            [t.bj.perfectPair, settings.perfectPairPayout],
                          ]}
                          value={bet.perfectPairs}
                          step={settings.minSideBet}
                          disabled={
                            !bet.perfectPairs &&
                            settings.minSideBet > hand.chips
                          }
                          onAdjust={(direction) =>
                            onBet((previous) =>
                              adjust(
                                previous,
                                'perfectPairs',
                                direction * settings.minSideBet,
                                { chips: hand.chips, max: settings.maxSideBet },
                              ),
                            )
                          }
                        />
                      )}
                      {settings.twentyOnePlusThreeEnabled && (
                        <BetSpot
                          side
                          label={t.bj.twentyOnePlusThree}
                          caption="21+3"
                          payouts={[
                            [
                              t.bj.flush,
                              settings.twentyOnePlusThreeFlushPayout,
                            ],
                            [
                              t.bj.straight,
                              settings.twentyOnePlusThreeStraightPayout,
                            ],
                            [
                              t.bj.trips,
                              settings.twentyOnePlusThreeTripsPayout,
                            ],
                            [
                              t.bj.straightFlush,
                              settings.twentyOnePlusThreeStraightFlushPayout,
                            ],
                            [
                              t.bj.suitedTrips,
                              settings.twentyOnePlusThreeSuitedTripsPayout,
                            ],
                          ]}
                          value={bet.twentyOnePlusThree}
                          step={settings.minSideBet}
                          disabled={
                            !bet.twentyOnePlusThree &&
                            settings.minSideBet > hand.chips
                          }
                          onAdjust={(direction) =>
                            onBet((previous) =>
                              adjust(
                                previous,
                                'twentyOnePlusThree',
                                direction * settings.minSideBet,
                                { chips: hand.chips, max: settings.maxSideBet },
                              ),
                            )
                          }
                        />
                      )}
                    </div>
                  </div>
                )}
              <BetSpot
                label={t.bj.mainBet}
                caption={t.bj.betSpot}
                value={bet.main}
                step={settings.minBet}
                disabled={!bet.main && settings.minBet > hand.chips}
                quick={quickBets(
                  Math.min(
                    settings.maxBet,
                    hand.chips - bet.perfectPairs - bet.twentyOnePlusThree,
                  ),
                  settings.minBet,
                )}
                onSet={(amount) =>
                  onBet((previous) =>
                    adjust(previous, 'main', amount - previous.main, {
                      chips: hand.chips,
                      max: settings.maxBet,
                    }),
                  )
                }
                onAdjust={(direction) =>
                  onBet((previous) =>
                    adjust(previous, 'main', direction * settings.minBet, {
                      chips: hand.chips,
                      max: settings.maxBet,
                    }),
                  )
                }
              />
            </div>
          )}
        </div>

        <button
          type="button"
          className="bj-nameplate"
          onClick={(event) => onPlayerClick(player.id, event.currentTarget)}
        >
          <PlayerAvatar avatar={player.avatar} />
          <span>
            <strong title={player.displayName}>{player.displayName}</strong>
            <motion.small key={hand.chips} {...pop}>
              {hand.chips}
            </motion.small>
          </span>
          {you && <span className="sr-only">{t.you}</span>}
        </button>

        <SideBetWins player={hand} />
      </li>
    </CardCosmetics>
  );
}

/**
 * One betting circle, captioned so it is obvious what it is and what it pays. Tap adds
 * a step, right-click or Backspace takes one back, and a take-back button appears once
 * there are chips down — right-click alone is undiscoverable and absent on touch.
 * Steps apply against the latest bet rather than the rendered one, so clicking fast
 * never drops a chip.
 */
export function BetSpot({
  label,
  caption,
  payouts,
  quick,
  onSet,
  value,
  step,
  side,
  disabled,
  onAdjust,
}: {
  label: string;
  caption: string;
  payouts?: [string, number][];
  quick?: number[];
  onSet?: (amount: number) => void;
  value: number;
  step: number;
  side?: boolean;
  disabled: boolean;
  onAdjust: (direction: 1 | -1) => void;
}) {
  return (
    <div className={`bj-spot-slot${side ? ' is-side' : ''}`}>
      <button
        type="button"
        className={`bj-spot${side ? ' is-side' : ''}${value ? ' has-chips' : ''}`}
        disabled={disabled}
        onClick={() => onAdjust(1)}
        onContextMenu={(event) => {
          event.preventDefault();
          onAdjust(-1);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Backspace' || event.key === 'Delete') {
            event.preventDefault();
            onAdjust(-1);
          }
        }}
        aria-label={`${label}: ${value}`}
        title={t.bj.spotHint(label, step)}
      >
        <ChipStack total={value} />
        {!value && <span className="bj-spot-empty">+{step}</span>}
      </button>
      <AnimatePresence>
        {value > 0 && (
          <motion.button
            type="button"
            className="bj-spot-take"
            onClick={() => onAdjust(-1)}
            aria-label={t.bj.takeBack(label)}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={spring}
          >
            −
          </motion.button>
        )}
      </AnimatePresence>
      <span className="bj-spot-caption">
        {caption}
        {payouts ? <b>{t.bj.pays(topPayout(payouts))}</b> : null}
      </span>
      {/* Sized off what you could actually put down, so one click covers the common
          amounts instead of tapping the circle ten times. */}
      {quick && quick.length > 0 && (
        <div className="bj-quick-bets">
          <strong>{t.bj.quickBet}</strong>
          <div>
            {quick.map((amount) => (
              <button
                key={amount}
                type="button"
                className={value === amount ? 'is-current' : undefined}
                aria-label={`${label}: ${amount}`}
                onClick={() => onSet?.(amount)}
              >
                {amount}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* The full paytable, on hover or keyboard focus: the odds are the whole reason
          to take a side bet, and they are too long to print on the felt. */}
      {payouts && (
        <div className="bj-paytable" role="tooltip">
          <strong>{label}</strong>
          <dl>
            {[...payouts]
              .sort(([, a], [, b]) => b - a)
              .map(([name, odds]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{odds}:1</dd>
                </div>
              ))}
          </dl>
        </div>
      )}
    </div>
  );
}

/**
 * A ladder of quick amounts for the main bet: the table minimum first, then quarters of
 * what you could actually put down right now — the table maximum, or your remaining
 * chips once the side bets are covered. Each step is rounded down to a whole minimum
 * bet so it is always a legal wager, and duplicates collapse, so a short stack simply
 * offers fewer rungs.
 */
export function quickBets(ceiling: number, step: number): number[] {
  if (ceiling < step) return [];
  const amounts = new Set([step]);
  for (const fraction of [0.25, 0.5, 0.75, 1]) {
    const amount = Math.floor((ceiling * fraction) / step) * step;
    if (amount >= step) amounts.add(amount);
  }
  return [...amounts].sort((a, b) => a - b);
}

/** The best odds a side bet offers, which is what makes it worth taking. */
function topPayout(payouts: [string, number][]) {
  return Math.max(0, ...payouts.map(([, odds]) => odds));
}

const DENOMINATIONS = [500, 100, 25, 5] as const;
/** Chip colour by value, the way a real rack is coded: low to high. */
const CHIP_TIER: Record<number, string> = {
  5: 'mint',
  25: 'sun',
  100: 'coral',
  500: 'sky',
};

/**
 * The wager as a real pile: the largest denominations settle at the bottom and each new
 * chip drops on top. Only the top chip's face is showing, so that is where the running
 * total is printed. Capped so a big bet piles up instead of growing without end.
 */
export function ChipStack({ total }: { total: number }) {
  const discs: number[] = [];
  let left = total;
  for (const denomination of DENOMINATIONS)
    while (left >= denomination && discs.length < 10) {
      discs.push(denomination);
      left -= denomination;
    }
  if (left > 0) discs.push(left);

  return (
    <span className="bj-chip-stack" aria-hidden="true">
      <AnimatePresence initial={false}>
        {discs.map((denomination, index) => (
          <motion.span
            // Same index keeps its disc, so only the newly added ones animate in.
            key={index}
            className={`bj-chip is-${CHIP_TIER[denomination] ?? 'sun'}${
              index === discs.length - 1 ? ' is-top' : ''
            }`}
            style={{ bottom: index * 6, zIndex: index }}
            initial={{ y: -34, opacity: 0, rotate: -20 }}
            animate={{ y: 0, opacity: 1, rotate: (index % 3) - 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={spring}
          >
            {index === discs.length - 1 && total}
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  );
}

function Hand({
  hand,
  active,
  deal,
}: {
  hand: BlackjackHandState;
  active: boolean;
  deal: DealSlot;
}) {
  const settled = hand.outcome
    ? hand.outcome
    : hand.status === 'bust'
      ? 'loss'
      : hand.status === 'blackjack'
        ? 'blackjack'
        : '';
  return (
    <div className={`bj-hand${active ? ' is-active' : ''}`}>
      <CardRow cards={hand.cards} deal={deal} />
      {hand.cards.length > 0 && (
        <div className="bj-hand-meta">
          <motion.span
            key={hand.value}
            className={`bj-value${hand.soft ? ' is-soft' : ''}`}
            {...pop}
          >
            {hand.value}
          </motion.span>
          {hand.bet > 0 && <span className="bj-hand-bet">{hand.bet}</span>}
        </div>
      )}
      <AnimatePresence>
        {settled && (
          <motion.span
            className={`bj-outcome is-${settled}`}
            initial={{ scale: 0.3, opacity: 0, rotate: -14 }}
            animate={{ scale: 1, opacity: 1, rotate: -5 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={spring}
          >
            {settled === 'blackjack'
              ? t.bj.blackjack
              : hand.status === 'bust'
                ? t.bj.bust
                : settled === 'win'
                  ? t.bj.win
                  : settled === 'push'
                    ? t.bj.push
                    : t.bj.loss}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Cards are keyed by their slot, so the dealer's hole card stays the same element
 * across the reveal and flips in place instead of being swapped out.
 */
function CardRow({
  cards,
  count,
  holeHidden = false,
  deal,
}: {
  cards: Card[];
  count?: number;
  holeHidden?: boolean;
  deal: DealSlot;
}) {
  const reduced = useReducedMotion();
  const row = useRef<HTMLDivElement>(null);
  const from = useShoeOffset(row);
  const slots = Array.from(
    { length: Math.max(cards.length, count ?? 0) },
    (_, index) =>
      holeHidden && index === 1
        ? undefined
        : (cards[index] as Card | undefined),
  );
  return (
    <div className="bj-cards" ref={row}>
      <AnimatePresence initial={false}>
        {slots.map((card, index) => (
          <PlayingCard
            key={index}
            card={card}
            index={index}
            from={from}
            delay={reduced ? 0 : dealDelay(index, deal)}
            reduced={Boolean(reduced)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Where each spot sits in the deal: `order` seats, then the dealer, then round again. */
type DealSlot = { order: number; of: number };

/**
 * The opening two cards go round the table one at a time the way a dealer deals them,
 * so the table fills in order instead of all at once. Hits land immediately — waiting
 * out a stagger for a card you just asked for feels broken.
 */
function dealDelay(index: number, { order, of }: DealSlot) {
  return index < 2 ? (index * (of + 1) + order) * 0.07 : 0;
}

/**
 * The offset from this row to the shoe, so cards can fly out of it. Measured rather
 * than derived: seats sit on an ellipse whose radii change per breakpoint, and the
 * felt is a container, so there is no static offset that stays true.
 */
function useShoeOffset(row: RefObject<HTMLDivElement | null>) {
  const shoe = useContext(ShoeContext);
  const [from, setFrom] = useState({ x: 0, y: -120 });
  useLayoutEffect(() => {
    const measure = () => {
      const target = row.current;
      const source = shoe?.current;
      if (!target || !source) return;
      const to = target.getBoundingClientRect();
      const at = source.getBoundingClientRect();
      setFrom({
        x: at.left + at.width / 2 - (to.left + to.width / 2),
        y: at.top + at.height / 2 - (to.top + to.height / 2),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (row.current) observer.observe(row.current);
    if (shoe?.current) observer.observe(shoe.current);
    // Seats move with the felt on resize without changing size themselves.
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [row, shoe]);
  return from;
}

function PlayingCard({
  card,
  index,
  from,
  delay,
  reduced,
}: {
  card: Card | undefined;
  index: number;
  from: { x: number; y: number };
  delay: number;
  reduced: boolean;
}) {
  const red = card?.suit === 'diamonds' || card?.suit === 'hearts';
  const cosmetics = useCardCosmetics();
  return (
    <motion.div
      className="bj-card"
      initial={
        reduced
          ? false
          : { ...cardDealOrigin(cosmetics['card-animation'], from), zIndex: 20 }
      }
      animate={{
        x: 0,
        y: 0,
        // Spun out of the shoe and settled into the fan's own slight tilt.
        rotate: index * 2.5 - 2,
        scale: 1,
        opacity: 1,
        zIndex: 0,
      }}
      exit={reduced ? { opacity: 0 } : { y: 26, opacity: 0, scale: 0.9 }}
      transition={{
        ...spring,
        delay,
        opacity: { duration: 0.12, delay },
        zIndex: { delay },
      }}
      aria-label={card ? `${card.rank} ${card.suit}` : t.bj.hiddenCard}
    >
      <motion.div
        className="bj-card-inner"
        initial={reduced ? false : { rotateY: 180 }}
        animate={{ rotateY: card ? 0 : 180 }}
        transition={
          reduced
            ? { duration: 0 }
            : { ...spring, bounce: 0.3, delay: delay + 0.12 }
        }
      >
        {/* Rank in the corner, so an overlapped card still reads. */}
        <span className={`bj-card-face${red ? ' is-red' : ''}`}>
          <span className="bj-card-index">
            {card?.rank}
            <span>{suitSymbol(card?.suit)}</span>
          </span>
          <span className="bj-card-pip">{suitSymbol(card?.suit)}</span>
        </span>
        <span className="bj-card-back">
          <CardBack id={cosmetics['card-back']} />
        </span>
      </motion.div>
    </motion.div>
  );
}

function SideBetWins({ player }: { player: BlackjackPlayerState }) {
  const wins = [
    [t.bj.perfectPairs, player.perfectPairsPayout],
    [t.bj.twentyOnePlusThree, player.twentyOnePlusThreePayout],
  ] as const;
  return (
    <AnimatePresence>
      {wins
        .filter(([, payout]) => payout > 0)
        .map(([name, payout]) => (
          <motion.span
            key={name}
            className="bj-side-win"
            initial={{ opacity: 0, y: 8, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={spring}
          >
            {t.bj.sideBetWin(name, payout)}
          </motion.span>
        ))}
    </AnimatePresence>
  );
}

/** Drains over the stage's own timer, so the ring empties exactly at zero. */
export function Timer({
  endsAt,
  seconds,
  urgent,
}: {
  endsAt: number;
  seconds: number;
  urgent: boolean;
}) {
  const [left, setLeft] = useState(() => remaining(endsAt));
  useEffect(() => {
    setLeft(remaining(endsAt));
    const timer = setInterval(() => setLeft(remaining(endsAt)), 100);
    return () => clearInterval(timer);
  }, [endsAt]);
  const circumference = 2 * Math.PI * 19;
  const fraction = Math.max(0, Math.min(1, left / Math.max(1, seconds)));
  return (
    <div
      className={`bj-timer${urgent && left <= 5 ? ' is-urgent' : ''}`}
      aria-label={t.bj.secondsLeft(Math.ceil(left))}
    >
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle className="bj-timer-track" cx="22" cy="22" r="19" />
        <circle
          className="bj-timer-fill"
          cx="22"
          cy="22"
          r="19"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
        />
      </svg>
      <span aria-hidden="true">{Math.ceil(left)}</span>
    </div>
  );
}

const pop = {
  initial: { scale: 1.3 },
  animate: { scale: 1 },
  transition: spring,
} as const;

function remaining(endsAt: number) {
  return Math.max(0, (endsAt - performance.now()) / 1000);
}

/**
 * Move one spot by `delta`, capped by the table limit and by whatever chips the other
 * spots have not already claimed.
 */
function adjust(
  bet: BlackjackBet,
  spot: keyof BlackjackBet,
  delta: number,
  limits: { chips: number; max: number },
): BlackjackBet {
  const others = (Object.keys(bet) as (keyof BlackjackBet)[])
    .filter((key) => key !== spot)
    .reduce((sum, key) => sum + bet[key], 0);
  const ceiling = Math.min(limits.max, Math.max(0, limits.chips - others));
  return { ...bet, [spot]: Math.max(0, Math.min(ceiling, bet[spot] + delta)) };
}

/**
 * Seats sit on the lower rim of the felt, with the dealer opposite them at the top.
 * Only the direction is computed here; the felt owns the ring's radius in CSS, so each
 * breakpoint can pull the seats in without touching this.
 */
export function seatPosition(index: number, count: number): CSSProperties {
  const span = count <= 2 ? 76 : count > 4 ? 150 : 122;
  const angle = count === 1 ? 90 : 90 + span / 2 - (index * span) / (count - 1);
  const radians = (angle * Math.PI) / 180;
  return {
    '--seat-cos': Math.cos(radians).toFixed(4),
    '--seat-sin': Math.sin(radians).toFixed(4),
  } as CSSProperties;
}

function stageLabel(stage: BlackjackSnapshot['game']['stage']) {
  if (stage === 'betting') return t.bj.betting;
  if (stage === 'playing') return t.bj.playing;
  if (stage === 'dealer') return t.bj.dealer;
  return t.bj.roundResults;
}

function payoutLabel(value: number) {
  return value === 1.5 ? '3:2' : value === 1.2 ? '6:5' : '2:1';
}

function suitSymbol(suit?: Card['suit']) {
  return suit === 'clubs'
    ? '♣'
    : suit === 'diamonds'
      ? '♦'
      : suit === 'hearts'
        ? '♥'
        : '♠';
}
