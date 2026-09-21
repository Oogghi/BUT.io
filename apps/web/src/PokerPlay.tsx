import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
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
}: {
  card: Card | null;
  index: number;
  delay: number;
}) {
  const reduced = useReducedMotion();
  const dealAt = reduced ? 0 : delay + index * 0.08;
  const flipAt = reduced ? 0 : delay + 0.15 + index * 0.12;
  const red = card?.suit === 'diamonds' || card?.suit === 'hearts';
  return (
    <motion.div
      className="bj-card"
      initial={
        reduced ? false : { y: -80, rotate: -40, scale: 0.7, opacity: 0 }
      }
      animate={{ y: 0, rotate: 0, scale: 1, opacity: 1 }}
      transition={{
        ...spring,
        delay: dealAt,
        opacity: { duration: 0.12, delay: dealAt },
      }}
      aria-label={card ? `${card.rank} ${card.suit}` : 'Carte cachée'}
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
          <img src="/blackjack-party/card-back.png" alt="" />
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
}: {
  cards: readonly (Card | null)[];
  slots?: number;
  delay?: number;
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
          />
        );
      })}
    </div>
  );
}

function Spot({ label, amount }: { label: string; amount: number }) {
  return (
    <span className="poker-spot">
      <span
        className={`bj-spot is-side is-locked${amount ? ' has-chips' : ''}`}
      >
        {amount > 0 && <ChipStack total={amount} />}
      </span>
      <small>{label}</small>
    </span>
  );
}

/** Seconds between seats when dealing, and when the showdown turns hands over. */
const SEAT_STAGGER = 0.18;
/** The dealer flips first at showdown; the seats follow from here. */
const REVEAL_START = 0.5;

const STAGE_LABELS: Partial<Record<PokerStage, string>> = {
  'ultimate-betting': 'Mise',
  'ultimate-preflop': 'Pré-flop',
  'ultimate-flop': 'Flop',
  'ultimate-river': 'River',
  'holdem-preflop': 'Pré-flop',
  'holdem-flop': 'Flop',
  'holdem-turn': 'Turn',
  'holdem-river': 'River',
  showdown: 'Abattage',
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
}: {
  state: PokerSnapshot;
  sessionId: string;
  send: (type: string, payload?: unknown) => void;
  error: string;
}) {
  const [chosenAnte, setChosenAnte] = useState(0);
  const [chosenRaise, setChosenRaise] = useState(0);
  const { game, settings } = state;
  const player = game.players.get(sessionId);
  if (!player) return null;

  const ultimate = settings.mode === 'ultimate';
  const showdown = game.stage === 'showdown';
  const betting = game.stage === 'ultimate-betting';
  const yourTurn = game.activePlayerId === sessionId;
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
  const seats = state.players.filter((entry) => game.players.has(entry.id));
  // Results land once the dealer and every seat have turned their cards.
  const resultDelay = REVEAL_START + seats.length * SEAT_STAGGER + 0.4;
  const activeName =
    state.players.find((entry) => entry.id === game.activePlayerId)
      ?.displayName ?? '';
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
      Check
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
      Se coucher
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
                  Suivre <small>{Math.min(toCall, player.chips)}</small>
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
                  {raise >= allIn ? 'Tapis' : 'Relancer'}{' '}
                  <small>{Math.min(raise, allIn)}</small>
                </button>
                {allIn > raiseTo && (
                  <input
                    type="range"
                    min={raiseTo}
                    max={allIn}
                    step={1}
                    value={raise}
                    aria-label="Montant de la relance"
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
          <strong>
            Manche {game.round}/{settings.rounds}
          </strong>
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
          <section className="bj-dealer" aria-label="Dealer">
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
              delay={showdown ? 0 : seats.length * SEAT_STAGGER}
            />
            <p className="bj-dealer-name">
              Dealer
              {game.dealerHandLabel && (
                <motion.b key={game.dealerHandLabel} {...pop}>
                  {game.dealerHandLabel}
                </motion.b>
              )}
            </p>
          </section>
        )}

        <div className="poker-board">
          <Hand cards={game.communityCards} slots={5} round={game.round} />
          {!ultimate && <Spot label="Pot" amount={game.pot} />}
        </div>

        <ul className="bj-seats">
          {seats.map((lobbyPlayer, index) => {
            const seat = game.players.get(lobbyPlayer.id)!;
            const you = lobbyPlayer.id === sessionId;
            const reveal = you || showdown;
            return (
              <li
                key={lobbyPlayer.id}
                className={`bj-seat${game.activePlayerId === lobbyPlayer.id ? ' is-active' : ''}${you ? ' is-you' : ''}${seat.folded ? ' is-folded' : ''}`}
                style={seatPosition(index, seats.length)}
              >
                <div className="bj-hand">
                  <Hand
                    cards={reveal ? seat.cards : seat.cards.map(() => null)}
                    slots={0}
                    round={game.round}
                    delay={(showdown ? REVEAL_START : 0) + index * SEAT_STAGGER}
                  />
                  {reveal && seat.handLabel && !seat.folded && (
                    <div className="bj-hand-meta">
                      <motion.span
                        key={seat.handLabel}
                        className="bj-value"
                        {...pop}
                      >
                        {seat.handLabel}
                      </motion.span>
                    </div>
                  )}
                  <AnimatePresence>
                    {showdown && seat.totalBet > 0 && (
                      <motion.span
                        className={`bj-outcome is-${seat.folded ? 'loss' : seat.outcome}`}
                        initial={{ scale: 0.4, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ ...spring, delay: resultDelay }}
                      >
                        {outcomeLabel(seat)}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>

                <div className="poker-spots">
                  {you && choosing ? (
                    <>
                      {(['Ante', 'Blind'] as const).map((label) => (
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
                      <Spot label="Play" amount={0} />
                    </>
                  ) : ultimate ? (
                    <>
                      <Spot label="Ante" amount={seat.bet.ante} />
                      <Spot label="Blind" amount={seat.bet.blind} />
                      <Spot label="Play" amount={seat.bet.play} />
                    </>
                  ) : (
                    seat.streetBet > 0 && (
                      <Spot label="Mise" amount={seat.streetBet} />
                    )
                  )}
                </div>

                <div className="bj-nameplate">
                  <PlayerAvatar avatar={lobbyPlayer.avatar} />
                  <span>
                    <strong title={lobbyPlayer.displayName}>
                      {lobbyPlayer.displayName}
                    </strong>
                    <motion.small key={seat.chips} {...pop}>
                      {seat.chips}
                    </motion.small>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <footer className="bj-dock" aria-live="polite">
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
              Miser <small>{ante * 2}</small>
            </motion.button>
          ) : showdown ? (
            <motion.p
              key="net"
              className={`bj-net is-${player.payout > player.totalBet ? 'up' : player.payout < player.totalBet ? 'down' : 'even'}`}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ ...spring, delay: resultDelay }}
            >
              <span>{player.handLabel || 'Manche'}</span>
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
              {activeName ? (
                <>
                  Au tour de <span>{activeName}</span>
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
