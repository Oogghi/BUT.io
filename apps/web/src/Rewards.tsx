import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { RewardBreakdown } from '@but/shared';
import { Icon } from './Icon';
import { useGroupSession } from './GroupSession';
import { loadRewardState } from './supabaseData';
import { t } from './i18n';

export interface RewardNotice {
  amount: number;
  breakdown: readonly RewardBreakdown[];
}

export function CoinIndicator() {
  const { account } = useGroupSession();
  const [coins, setCoins] = useState(0);
  const connected = Boolean(account && !account.isAnonymous);

  useEffect(() => {
    if (!connected || !account) {
      setCoins(0);
      return;
    }
    let active = true;
    const refresh = () => {
      void loadRewardState(account.userId)
        .then((next) => {
          if (active) setCoins(next.coins);
        })
        .catch(() => undefined);
    };
    refresh();
    addEventListener('but-reward-change', refresh);
    return () => {
      active = false;
      removeEventListener('but-reward-change', refresh);
    };
  }, [account, connected]);

  return (
    <div
      className={`coin-indicator${connected ? '' : ' is-guest'}`}
      title={connected ? t.coins : t.rewardGuestDescription}
      aria-label={`${t.coins}: ${coins}`}
    >
      <Icon name="coin" />
      <strong>{coins}</strong>
    </div>
  );
}

export function RewardToast({
  notice,
  onDismiss,
}: {
  notice: RewardNotice | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(onDismiss, 5200);
    return () => window.clearTimeout(timer);
  }, [notice, onDismiss]);

  return (
    <AnimatePresence>
      {notice && (
        <motion.aside
          className="reward-toast"
          initial={{ opacity: 0, y: -10, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          role="status"
          aria-live="polite"
        >
          <span className="reward-toast-icon" aria-hidden="true">
            <Icon name="coin" />
          </span>
          <div>
            <strong>{t.coinsEarned(notice.amount)}</strong>
            <div className="reward-toast-breakdown">
              {notice.breakdown.map((reward) => (
                <span key={reward.kind}>
                  {t.rewardKinds[reward.kind]} +{reward.amount}
                </span>
              ))}
            </div>
          </div>
          <button
            className="reward-toast-close"
            type="button"
            aria-label={t.community.dismiss}
            onClick={onDismiss}
          >
            ×
          </button>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
