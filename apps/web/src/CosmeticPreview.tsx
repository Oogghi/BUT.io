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
