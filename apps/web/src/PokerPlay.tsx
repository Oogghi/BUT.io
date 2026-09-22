import { t, pokerHandLabel } from './i18n';
import { useAppReducedMotion as useReducedMotion } from './MotionPreferences';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type {
  Card,
  PokerAction,
  PokerPlayerState,
  PokerStage,
} from '@but/poker-party';
import type { PokerSnapshot } from './lobbyConnection';
import { PlayerAvatar } from './Avatar';
import {
  BetSpot,
  ChipStack,
  Timer,
  quickBets,
  seatPosition,
} from './BlackjackPlay';
import { spring } from './spring';
import { CardBack, CardCosmetics, useCardCosmetics } from './CosmeticPreview';
import { cardDealOrigin } from './cosmetics';

function suitSymbol(suit: Card['suit'] | undefined) {
  return suit === 'clubs'
    ? '♣'
    : suit === 'diamonds'
      ? '♦'
      : suit === 'hearts'
        ? '♥'
        : suit === 'spades'
          ? '♠'
          : '';
}

const pop = {
  initial: { scale: 1.3 },
  animate: { scale: 1 },
  transition: spring,
} as const;

const buttonIn = {
  initial: { opacity: 0, y: 12, scale: 0.9 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: spring,
} as const;

/**
 * Dealt in face down from above and turned over as it lands; a card that becomes known
 * later (`null` → card) flips in place. `delay` sequences hands round the table.
 */
function PokerCard({
  card,
  index,
  delay,
  stagger,
}: {
  card: Card | null;
  index: number;
  delay: number;
  stagger: number;
}) {
  const reduced = useReducedMotion();
  const cosmetics = useCardCosmetics();
  const dealAt = reduced ? 0 : Math.max(0, delay + index * stagger);
  const flipAt = reduced ? 0 : dealAt + 0.15;
  const red = card?.suit === 'diamonds' || card?.suit === 'hearts';
  return (
    <motion.div
      className="bj-card"
      initial={
        reduced
          ? false
          : cosmetics['card-animation']
            ? cardDealOrigin(cosmetics['card-animation'])
            : { x: 0, y: -80, rotate: -40, scale: 0.7, opacity: 0 }
      }
      animate={{ x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 }}
      transition={{
        ...spring,
        delay: dealAt,
        opacity: { duration: 0.12, delay: dealAt },
      }}
      aria-label={card ? `${card.rank} ${card.suit}` : t.pk.hiddenCard}
    >
      <motion.div
        className="bj-card-inner"
        initial={reduced ? false : { rotateY: 180 }}
        animate={{ rotateY: card ? 0 : 180 }}
        transition={
          reduced ? { duration: 0 } : { ...spring, bounce: 0.3, delay: flipAt }
        }
      >
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

/** Entries missing up to `slots` show as empty outlines, so the table shows what is still to come. */
function Hand({
  cards,
  slots = cards.length,
  round,
  delay = 0,
  stagger = DEAL_STAGGER,
}: {
  cards: readonly (Card | null)[];
  slots?: number;
  delay?: number;
  /** Seconds between this hand's cards. */
  stagger?: number;
  /** Keys cards per round so a new deal flies in instead of flipping in place. */
  round: number;
}) {
  return (
    <div className="bj-cards poker-cards">
      {Array.from({ length: Math.max(slots, cards.length) }, (_, index) => {
        const card = cards[index];
        return card === undefined ? (
          <div key={index} className="poker-slot" aria-hidden="true" />
        ) : (
          <PokerCard
            key={`${round}-${index}`}
            card={card}
            index={index}
            delay={delay}
            stagger={stagger}
          />
        );
      })}
    </div>
  );
}

/**
 * A locked wager on the felt. Once `returned` is given the wager is settled: the pile
 * grows to what it paid (or leaves the table on a loss) under a +/−/= badge.
 */
function Spot({
  label,
  amount,
  returned,
  odds,
}: {
  label: string;
  amount: number;
  returned?: number | undefined;
  odds?: string | undefined;
}) {
  const settled = returned !== undefined && amount > 0;
  const shown = settled ? returned : amount;
  const result = !settled
    ? ''
    : returned > amount
      ? 'win'
      : returned === amount
        ? 'push'
        : 'loss';
  return (
    <span className="poker-spot">
      <span
        className={`bj-spot is-side is-locked${shown ? ' has-chips' : ''}${result ? ` is-${result}` : ''}`}
      >
        {shown > 0 && <ChipStack total={shown} />}
      </span>
      <AnimatePresence>
        {settled && (
          <motion.b
            className={`poker-spot-result is-${result}`}
            initial={{ y: 8, scale: 0.4, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={spring}
          >
            {result === 'push' ? '=' : signed(returned - amount)}
            {odds && <small>{odds}</small>}
          </motion.b>
        )}
      </AnimatePresence>
      <small>{label}</small>
    </span>
  );
}

function signed(value: number) {
  return value > 0 ? `+${value}` : `−${-value}`;
}

function oddsLabel(multiplier: number) {
  return multiplier === 1.5 ? '3:2' : `${multiplier}:1`;
}

/**
 * Ultimate Poker settles its three wagers one after another once the cards are up:
 * the play, then the ante, then the blind. Counts 1–3 as each one resolves.
 */
function useSettleStep(active: boolean, start: number) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(0);
    if (!active) return;
    const timers = [0, 1, 2].map((index) =>
      window.setTimeout(
        () => setStep(index + 1),
        (start + index * WAGER_STAGGER) * 1000,
      ),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [active, start]);
  return step;
}

/** Seconds between cards, and between seats, while dealing. */
const DEAL_STAGGER = 0.08;
const SEAT_STAGGER = 0.18;
/**
 * The showdown is paced so each step can be followed: the rest of the board one card
 * at a time, then the dealer, then each hidden hand in turn, then the wagers.
 */
const REVEAL_CARD = 0.45;
const REVEAL_SEAT = 1;
const WAGER_STAGGER = 1.2;

/** Seconds from the start of the showdown at which each part of the table turns over. */
function showdownTimeline(
  newBoardCards: number,
  dealer: boolean,
  hiddenSeats: number,
) {
  const dealerAt = newBoardCards * REVEAL_CARD + 0.3;
  const seatsAt = dealer ? dealerAt + 2 * REVEAL_CARD + 0.6 : dealerAt;
  return {
    dealerAt,
    seatsAt,
    wagersAt: seatsAt + hiddenSeats * REVEAL_SEAT + 0.3,
  };
}

const ULTIMATE_DECISIONS: readonly PokerStage[] = [
  'ultimate-preflop',
  'ultimate-flop',
  'ultimate-river',
];

const STAGE_LABELS: Partial<Record<PokerStage, string>> = {
  'ultimate-betting': t.pk.bet,
  'ultimate-preflop': t.pk.preflop,
  'ultimate-flop': t.pk.flop,
  'ultimate-river': t.pk.river,
  'holdem-preflop': t.pk.preflop,
  'holdem-flop': t.pk.flop,
  'holdem-turn': t.pk.turn,
  'holdem-river': t.pk.river,
  showdown: t.pk.showdown,
};

function outcomeLabel(seat: PokerPlayerState) {
  const net = seat.payout - seat.totalBet;
  return net > 0 ? `+${net}` : net < 0 ? `−${-net}` : '=';
}

export function PokerPlay({
  state,
  sessionId,
  send,
  error,
  onPlayerClick,
}: {
  state: PokerSnapshot;
  sessionId: string;
  send: (type: string, payload?: unknown) => void;
  error: string;
  /** Opens the player's card (stats, and kicking for the host). */
  onPlayerClick: (id: string, anchor: HTMLElement) => void;
}) {
  const [chosenAnte, setChosenAnte] = useState(0);
  const [chosenRaise, setChosenRaise] = useState(0);
  const { game, settings } = state;
  const seats = state.players.filter((entry) => game.players.has(entry.id));
  // Board cards already on the table before the showdown do not need revealing.
  const boardSeen = useRef(0);
  if (game.stage !== 'showdown') boardSeen.current = game.communityCards.length;
  const hiddenSeats = settings.showAllCards
    ? []
    : seats.filter((entry) => entry.id !== sessionId);
  const timeline = showdownTimeline(
    5 - boardSeen.current,
    settings.mode === 'ultimate',
    hiddenSeats.length,
  );
  const step = useSettleStep(game.stage === 'showdown', timeline.wagersAt);
  const player = game.players.get(sessionId);
  if (!player) return null;

  const ultimate = settings.mode === 'ultimate';
  const showdown = game.stage === 'showdown';
  // The round's net lands after the last wager settles (Hold'em has only the pot).
  const settled = showdown && step >= (ultimate ? 3 : 1);
  const betting = game.stage === 'ultimate-betting';
  // Hold'em and turn-by-turn Ultimate name one player; with every hand face up,
  // Ultimate streets are simultaneous and everyone still deciding is up.
  const deciding = (id: string) => {
    if (game.activePlayerId) return game.activePlayerId === id;
    const seat = game.players.get(id);
    return Boolean(
      seat &&
      ULTIMATE_DECISIONS.includes(game.stage) &&
      !seat.departed &&
      !seat.folded &&
      !seat.bet.play &&
      !seat.acted,
    );
  };
  const yourTurn = deciding(sessionId);
  const minAnte = settings.ante;
  const stake = player.bet.ante;
  const maxAnte = Math.floor(player.chips / 2);
  const choosing = betting && !stake && !player.folded;
  const ante = chosenAnte > maxAnte ? 0 : chosenAnte;
  // Ante and blind are one wager: tapping either circle moves both.
  const adjustAnte = (direction: 1 | -1) =>
    setChosenAnte((previous) => {
      const next = Math.min(maxAnte, previous + direction * minAnte);
      return next < minAnte ? 0 : next;
    });
  const toCall = Math.max(0, game.currentBet - player.streetBet);
  const raiseTo = game.currentBet + settings.minRaise;
  // Raise target, from the minimum legal raise up to all-in. A stack short of the
  // minimum can still shove: the server caps any raise at what the player has.
  const allIn = player.streetBet + player.chips;
  const raise = Math.max(raiseTo, Math.min(allIn, chosenRaise));
  const waitingOn = seats
    .filter((entry) => entry.id !== sessionId && deciding(entry.id))
    .map((entry) => entry.displayName)
    .join(', ');
  const act = (value: PokerAction | { type: 'raise'; amount: number }) =>
    send('action', value);

  const play = (multiple: 1 | 2 | 3 | 4) => (
    <motion.button
      key={`raise${multiple}`}
      type="button"
      className="button bj-action is-hit"
      disabled={stake * multiple > player.chips}
      onClick={() => act(`raise${multiple}`)}
      {...buttonIn}
    >
      ×{multiple} <small>{stake * multiple}</small>
    </motion.button>
  );
  const check = (
    <motion.button
      key="check"
      type="button"
      className="button bj-action is-double"
      onClick={() => act('check')}
      {...buttonIn}
    >
      {t.pk.check}
    </motion.button>
  );
  const fold = (
    <motion.button
      key="fold"
      type="button"
      className="button bj-action is-stand"
      onClick={() => act('fold')}
      {...buttonIn}
    >
      {t.pk.fold}
    </motion.button>
  );

  const actions = !yourTurn
    ? null
    : game.stage === 'ultimate-preflop'
      ? [check, play(3), play(4)]
      : game.stage === 'ultimate-flop'
        ? [check, play(2)]
        : game.stage === 'ultimate-river'
          ? [fold, play(1)]
          : [
              toCall ? (
                <motion.button
                  key="call"
                  type="button"
                  className="button bj-action is-hit"
                  onClick={() => act('call')}
                  {...buttonIn}
                >
                  {t.pk.call} <small>{Math.min(toCall, player.chips)}</small>
                </motion.button>
              ) : (
                check
              ),
              <motion.div key="raise" className="poker-raise" {...buttonIn}>
                <button
                  type="button"
                  className="button bj-action is-raise"
                  disabled={player.chips <= toCall}
                  onClick={() => {
                    act({ type: 'raise', amount: raise });
                    setChosenRaise(0);
                  }}
                >
                  {raise >= allIn ? t.pk.allIn : t.pk.raise}{' '}
                  <small>{Math.min(raise, allIn)}</small>
                </button>
                {allIn > raiseTo && (
                  <input
                    type="range"
                    min={raiseTo}
                    max={allIn}
                    step={1}
                    value={raise}
                    aria-label={t.pk.raiseAmount}
                    onChange={(event) =>
                      setChosenRaise(Number(event.target.value))
                    }
                  />
                )}
              </motion.div>,
              fold,
            ];

  return (
    <div className="bj poker" data-your-turn={yourTurn}>
      <header className="bj-bar">
        <div className="bj-round">
          <strong>{t.bj.round(game.round, settings.rounds)}</strong>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={game.stage}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
            >
              {STAGE_LABELS[game.stage] ?? ''}
            </motion.span>
          </AnimatePresence>
        </div>
        {!showdown && (
          <Timer
            endsAt={game.endsAt}
            seconds={settings.bettingSeconds}
            urgent={yourTurn || choosing}
          />
        )}
      </header>

      <div className="bj-felt" data-crowded={seats.length > 4}>
        {ultimate && (
          <section className="bj-dealer" aria-label={t.bj.dealerLabel}>
            <Hand
              cards={
                betting
                  ? []
                  : game.dealerHoleHidden
                    ? [null, null]
                    : game.dealerCards
              }
              slots={2}
              round={game.round}
              delay={showdown ? timeline.dealerAt : seats.length * SEAT_STAGGER}
              stagger={showdown ? REVEAL_CARD : DEAL_STAGGER}
            />
            <p className="bj-dealer-name">
              {t.bj.dealerLabel}
              {game.dealerHandLabel && (
                <motion.b
                  key={pokerHandLabel(game.dealerHandLabel)}
                  {...pop}
                  transition={{
                    ...spring,
                    delay: timeline.dealerAt + 2 * REVEAL_CARD,
                  }}
                >
                  {pokerHandLabel(game.dealerHandLabel)}
                </motion.b>
              )}
            </p>
          </section>
        )}

        <div className="poker-board">
          <Hand
            cards={game.communityCards}
            slots={5}
            round={game.round}
            // At showdown the first card not yet seen lands first.
            delay={showdown ? -boardSeen.current * REVEAL_CARD : 0}
            stagger={showdown ? REVEAL_CARD : DEAL_STAGGER}
          />
          {!ultimate && <Spot label={t.pk.pot} amount={game.pot} />}
        </div>

        <ul className="bj-seats">
          {seats.map((lobbyPlayer, index) => {
            const seat = game.players.get(lobbyPlayer.id)!;
            const you = lobbyPlayer.id === sessionId;
            const reveal = you || showdown || settings.showAllCards;
            const revealAt =
              timeline.seatsAt +
              Math.max(0, hiddenSeats.indexOf(lobbyPlayer)) * REVEAL_SEAT;
            return (
              <li
                key={lobbyPlayer.id}
                className={`bj-seat${deciding(lobbyPlayer.id) ? ' is-active' : ''}${you ? ' is-you' : ''}${seat.folded ? ' is-folded' : ''}`}
                style={seatPosition(index, seats.length)}
              >
                <div className="bj-hand">
                  <CardCosmetics value={lobbyPlayer.cosmetics}>
                    <Hand
                      cards={reveal ? seat.cards : seat.cards.map(() => null)}
                      slots={0}
                      round={game.round}
                      delay={showdown ? revealAt : index * SEAT_STAGGER}
                      stagger={showdown ? 0.3 : DEAL_STAGGER}
                    />
                  </CardCosmetics>
                  {reveal && seat.handLabel && !seat.folded && (
                    <div className="bj-hand-meta">
                      <motion.span
                        key={pokerHandLabel(seat.handLabel)}
                        className="bj-value"
                        {...pop}
                        transition={{
                          ...spring,
                          delay: showdown ? revealAt + 0.7 : 0,
                        }}
                      >
                        {pokerHandLabel(seat.handLabel)}
                      </motion.span>
                    </div>
                  )}
                  <AnimatePresence>
                    {settled && seat.totalBet > 0 && (
                      <motion.span
                        className={`bj-outcome is-${seat.folded ? 'loss' : seat.outcome}`}
                        initial={{ scale: 0.4, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={spring}
                      >
                        {outcomeLabel(seat)}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>

                <div className="poker-spots">
                  {you && choosing ? (
                    <>
                      {([t.pk.ante, t.pk.blind] as const).map((label) => (
                        <BetSpot
                          key={label}
                          label={label}
                          caption={label}
                          value={ante}
                          step={minAnte}
                          disabled={minAnte > maxAnte}
                          quick={quickBets(maxAnte, minAnte)}
                          onSet={setChosenAnte}
                          onAdjust={adjustAnte}
                        />
                      ))}
                      <Spot label={t.pk.play} amount={0} />
                    </>
                  ) : ultimate ? (
                    <>
                      <Spot
                        label={t.pk.ante}
                        amount={seat.bet.ante}
                        returned={
                          showdown && step >= 2 ? seat.returns.ante : undefined
                        }
                      />
                      <Spot
                        label={t.pk.blind}
                        amount={seat.bet.blind}
                        returned={
                          showdown && step >= 3 ? seat.returns.blind : undefined
                        }
                        odds={
                          seat.blindOdds ? oddsLabel(seat.blindOdds) : undefined
                        }
                      />
                      <Spot
                        label={t.pk.play}
                        amount={seat.bet.play}
                        returned={
                          showdown && step >= 1 ? seat.returns.play : undefined
                        }
                      />
                    </>
                  ) : (
                    seat.streetBet > 0 && (
                      <Spot label={t.pk.bet} amount={seat.streetBet} />
                    )
                  )}
                </div>

                <button
                  type="button"
                  className="bj-nameplate"
                  onClick={(event) =>
                    onPlayerClick(lobbyPlayer.id, event.currentTarget)
                  }
                >
                  <PlayerAvatar avatar={lobbyPlayer.avatar} />
                  <span>
                    <strong title={lobbyPlayer.displayName}>
                      {lobbyPlayer.displayName}
                    </strong>
                    <motion.small key={seat.chips} {...pop}>
                      {seat.chips}
                    </motion.small>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <footer className="bj-dock" aria-live="polite">
        {choosing && (
          <p className="bj-hint">
            {t.pk.betHint}
            <span>{t.bj.betLimits(minAnte, maxAnte)}</span>
          </p>
        )}
        {yourTurn && ultimate && <p className="bj-hint">{t.pk.playHint}</p>}
        <AnimatePresence mode="popLayout" initial={false}>
          {choosing ? (
            <motion.button
              key="bet"
              type="button"
              className="button primary bj-deal"
              disabled={!ante}
              onClick={() => {
                send('bet', { ante });
                setChosenAnte(0);
              }}
              {...buttonIn}
            >
              {t.pk.bet} <small>{ante * 2}</small>
            </motion.button>
          ) : settled ? (
            <motion.p
              key="net"
              className={`bj-net is-${player.payout > player.totalBet ? 'up' : player.payout < player.totalBet ? 'down' : 'even'}`}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={spring}
            >
              <span>{pokerHandLabel(player.handLabel) || t.pk.round}</span>
              <strong>{outcomeLabel(player)}</strong>
            </motion.p>
          ) : actions ? (
            <motion.div
              key={game.stage}
              className="bj-actions"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {actions}
            </motion.div>
          ) : (
            <motion.p
              key="wait"
              className="bj-wait"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {waitingOn ? (
                <>
                  {t.pk.waiting} <span>{waitingOn}</span>
                </>
              ) : (
                '…'
              )}
            </motion.p>
          )}
        </AnimatePresence>
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
  );
}
