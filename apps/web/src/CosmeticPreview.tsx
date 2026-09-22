import { createContext, useContext, useState } from 'react';
import { motion } from 'motion/react';
import {
  decalPolygons,
  premiumAvatars,
  type CosmeticLoadout,
  type CosmeticId,
} from '@but/shared';
import { PlayerAvatar } from './Avatar';
import { cardDealOrigin, cosmeticLabels, cosmetics } from './cosmetics';
import { useAppReducedMotion } from './MotionPreferences';
import { spring } from './spring';
import { BlackjackCelebration } from './BlackjackCelebration';
import { blackjackCelebrationIds } from './blackjackCelebrationRules';

/** A player's equipment stays with their cards, including split hands and reveals. */
export const CardCosmetics = createContext<CosmeticLoadout>({});

export function CardBack({ id }: { id?: CosmeticId | undefined }) {
  return (
    <img
      src={
        id && ['midnight-cards', 'sunset-cards', 'mint-cards'].includes(id)
          ? `/cosmetics/${id}.webp`
          : '/blackjack-party/card-back.png'
      }
      alt=""
      draggable={false}
    />
  );
}

export function useCardCosmetics() {
  return useContext(CardCosmetics);
}

export function CosmeticPreview({
  id,
  avatar,
}: {
  id: CosmeticId;
  avatar: number;
}) {
  const [replay, setReplay] = useState(0);
  const reduced = useAppReducedMotion();
  const item = cosmetics.find((item) => item.id === id)!;
  const celebration = blackjackCelebrationIds.find((known) => known === id);
  if (celebration)
    return (
      <div className="cosmetic-card-demo">
        <div className="cosmetic-blackjack-stage" aria-hidden="true">
          <div className="cosmetic-blackjack-hand">
            <span>
              A
              <svg viewBox="0 0 24 24">
                <path d="M12 2C9 7 3 9 3 14a5 5 0 0 0 8 3l-2 5h6l-2-5a5 5 0 0 0 8-3c0-5-6-7-9-12Z" />
              </svg>
            </span>
            <span>
              K
              <svg viewBox="0 0 24 24">
                <path d="M12 22C8 17 2 13 2 7a5 5 0 0 1 10-2 5 5 0 0 1 10 2c0 6-6 10-10 15Z" />
              </svg>
            </span>
          </div>
          <BlackjackCelebration key={replay} id={celebration} preview />
        </div>
        <button
          type="button"
          className="text-link cosmetic-replay"
          onClick={() => setReplay((value) => value + 1)}
          aria-label={`${cosmeticLabels.preview} ${item.name}`}
        >
          {cosmeticLabels.preview} ↻
        </button>
      </div>
    );
  if (item.slot === 'avatar')
    return (
      <div className="cosmetic-premium-preview">
        <PlayerAvatar
          avatar={premiumAvatars.find((avatar) => avatar.id === id)!.avatar}
        />
      </div>
    );
  if (item.slot === 'frame')
    return (
      <div className={`locker-avatar-frame is-${id}`}>
        <PlayerAvatar avatar={avatar} />
      </div>
    );
  if (item.slot === 'tank-decal')
    return (
      <div className="cosmetic-tank-preview" aria-hidden="true">
        <img src="/tank-arena/neon.png" alt="" />
        <svg viewBox="-1.3 -1.3 2.6 2.6" className="cosmetic-tank-decal">
          {decalPolygons(id).map((points, index) => (
            <polygon
              key={index}
              points={points.join(' ')}
              fill="#ffe58c"
              stroke="#43301c"
              strokeWidth="0.09"
            />
          ))}
        </svg>
      </div>
    );
  return (
    <div className="cosmetic-card-demo">
      <div className="cosmetic-card-stage" aria-hidden="true">
        <motion.div
          key={`${id}-${replay}`}
          className="cosmetic-demo-card"
          initial={
            item.slot === 'card-animation' && !reduced
              ? cardDealOrigin(id, { x: 0, y: -30 })
              : false
          }
          animate={{ x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 }}
          transition={reduced ? { duration: 0 } : spring}
        >
          <CardBack id={item.slot === 'card-back' ? id : undefined} />
        </motion.div>
      </div>
      {item.slot === 'card-animation' && (
        <button
          type="button"
          className="text-link cosmetic-replay"
          onClick={() => setReplay((value) => value + 1)}
          aria-label={`${cosmeticLabels.preview} ${item.name}`}
        >
          {cosmeticLabels.preview} ↻
        </button>
      )}
    </div>
  );
}
