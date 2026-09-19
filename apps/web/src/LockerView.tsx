import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AVATAR_COUNT, DISPLAY_NAME_MAX_LENGTH } from '@but/shared';
import { Icon } from './Icon';
import { PlayerAvatar, ProfileAvatar } from './Avatar';
import { loadProfile, saveProfile, type Profile } from './profile';
import { t } from './i18n';
import { cosmetics, type CosmeticId } from './cosmetics';
import {
  currentAccount,
  DataLayerError,
  loadRewardState,
  purchaseCosmetic,
  setEquippedCosmetic,
  type Account,
  type RewardState,
} from './supabaseData';

export function LockerView() {
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [rewards, setRewards] = useState<RewardState | null>(null);
  const [rewardError, setRewardError] = useState('');
  const [busyCosmetic, setBusyCosmetic] = useState<CosmeticId | null>(null);

  useEffect(() => {
    let active = true;
    void currentAccount(loadProfile().displayName)
      .then(async (nextAccount) => {
        if (!active) return;
        setAccount(nextAccount);
        if (!nextAccount || nextAccount.isAnonymous) return;
        try {
          const nextRewards = await loadRewardState(nextAccount.userId);
          if (active) setRewards(nextRewards);
        } catch {
          if (active) setRewardError(t.rewardError);
        }
      })
      .catch(() => {
        if (active) setAccount(null);
      });
    return () => {
      active = false;
    };
  }, []);

  function updateProfile(changes: Partial<Profile>) {
    const next = { ...profile, ...changes };
    setProfile(next);
    saveProfile(next);
  }

  const previewName = profile.displayName.trim() || t.yourName;
  const connected = Boolean(account && !account.isAnonymous);

  async function reloadRewards() {
    if (!account || account.isAnonymous) return;
    const next = await loadRewardState(account.userId);
    setRewards(next);
  }

  function rewardFailure(cause: unknown) {
    if (cause instanceof DataLayerError) {
      if (cause.code === 'not-enough-coins') setRewardError(t.notEnoughCoins);
      else if (cause.code === 'cosmetic-owned') setRewardError(t.cosmeticOwned);
      else setRewardError(t.rewardError);
      return;
    }
    setRewardError(t.rewardError);
  }

  async function buy(cosmeticId: CosmeticId) {
    if (!connected) return;
    setBusyCosmetic(cosmeticId);
    setRewardError('');
    try {
      await purchaseCosmetic(cosmeticId);
      await reloadRewards();
      dispatchEvent(new CustomEvent('but-reward-change'));
    } catch (cause) {
      rewardFailure(cause);
    } finally {
      setBusyCosmetic(null);
    }
  }

  async function equip(cosmeticId: CosmeticId | null) {
    if (!connected) return;
    setBusyCosmetic(cosmeticId);
    setRewardError('');
    try {
      await setEquippedCosmetic(cosmeticId);
      await reloadRewards();
    } catch (cause) {
      rewardFailure(cause);
    } finally {
      setBusyCosmetic(null);
    }
  }

  return (
    <section className="locker-view" aria-labelledby="locker-title">
      <Link to="/" className="text-link locker-back">
        <Icon name="back" /> {t.backHome}
      </Link>

      <header className="locker-heading">
        <span className="locker-heading-icon" aria-hidden="true">
          <Icon name="locker" />
        </span>
        <div>
          <span className="eyebrow">{t.locker}</span>
          <h1 id="locker-title">{t.lockerTitle}</h1>
          <p>{t.lockerDescription}</p>
        </div>
      </header>

      <div className="locker-layout">
        <section
          className="locker-preview"
          aria-labelledby="locker-preview-title"
        >
          <div className="locker-preview-topline">
            <span id="locker-preview-title">{t.lockerPreview}</span>
            <span className="locker-saved">{t.lockerSaved}</span>
          </div>
          <div className="locker-preview-stage">
            <div
              className={`locker-avatar-frame${rewards?.equippedCosmetic ? ` is-${rewards.equippedCosmetic}` : ''}`}
            >
              <ProfileAvatar
                avatar={profile.avatar}
                onChange={(avatar) => updateProfile({ avatar })}
              />
            </div>
            <div className="locker-preview-copy">
              <strong>{previewName}</strong>
              <span>{t.profile}</span>
            </div>
          </div>
          <div className="locker-preview-rule" />
          <p>{t.lockerAvatarDescription}</p>
        </section>

        <section
          className="locker-editor"
          aria-labelledby="locker-editor-title"
        >
          <div className="locker-section-heading">
            <div>
              <span className="eyebrow">{t.profile}</span>
              <h2 id="locker-editor-title">{t.lockerAvatar}</h2>
            </div>
            <span className="locker-selection-count">
              {profile.avatar + 1} / {AVATAR_COUNT}
            </span>
          </div>
          <div className="locker-name-field">
            <label htmlFor="locker-name">{t.displayName}</label>
            <input
              id="locker-name"
              value={profile.displayName}
              placeholder={t.yourName}
              autoComplete="off"
              maxLength={DISPLAY_NAME_MAX_LENGTH}
              onChange={(event) =>
                updateProfile({ displayName: event.target.value })
              }
            />
          </div>
          <div
            className="locker-avatar-grid"
            role="radiogroup"
            aria-label={t.lockerAvatar}
          >
            {Array.from({ length: AVATAR_COUNT }, (_, avatar) => (
              <button
                key={avatar}
                className={`locker-avatar-option${profile.avatar === avatar ? ' is-selected' : ''}`}
                type="button"
                role="radio"
                aria-checked={profile.avatar === avatar}
                aria-label={`${t.lockerAvatar} ${avatar + 1}`}
                onClick={() => updateProfile({ avatar })}
              >
                <PlayerAvatar avatar={avatar} />
              </button>
            ))}
          </div>
        </section>
      </div>

      <section
        className="locker-rewards"
        aria-labelledby="locker-rewards-title"
      >
        <div className="locker-rewards-heading">
          <div>
            <span className="eyebrow">{t.coins}</span>
            <h2 id="locker-rewards-title">{t.rewardsTitle}</h2>
          </div>
          <div className="locker-coin-total">
            <Icon name="coin" />
            <strong>{rewards?.coins ?? 0}</strong>
          </div>
        </div>
        <p className="locker-rewards-description">
          {connected
            ? t.rewardConnected(rewards?.coins ?? 0)
            : t.rewardGuestDescription}
        </p>
        {rewardError && (
          <p className="notice global-notice" role="alert">
            {rewardError}
          </p>
        )}
        <div className="locker-cosmetics-heading">
          <h3>{t.cosmeticShop}</h3>
          {!connected && <span>{t.signInToUnlock}</span>}
        </div>
        <div className="locker-cosmetic-grid">
          {cosmetics.map((cosmetic) => {
            const owned =
              rewards?.ownedCosmetics.includes(cosmetic.id) ?? false;
            const equipped = rewards?.equippedCosmetic === cosmetic.id;
            const busy = busyCosmetic === cosmetic.id;
            return (
              <article
                className={`locker-cosmetic-card is-${cosmetic.id}`}
                key={cosmetic.id}
              >
                <span className="locker-cosmetic-swatch" aria-hidden="true" />
                <div>
                  <strong>{cosmetic.name}</strong>
                  <p>{cosmetic.description}</p>
                </div>
                <div className="locker-cosmetic-footer">
                  <span className="locker-cosmetic-price">
                    <Icon name="coin" /> {cosmetic.price}
                  </span>
                  {!connected ? (
                    <span className="locker-cosmetic-muted">
                      {t.signInToUnlock}
                    </span>
                  ) : equipped ? (
                    <button
                      className="button compact-button"
                      type="button"
                      disabled
                    >
                      {t.equipped}
                    </button>
                  ) : owned ? (
                    <button
                      className="button secondary compact-button"
                      type="button"
                      disabled={busyCosmetic !== null}
                      onClick={() => void equip(cosmetic.id)}
                    >
                      {busy ? t.community.working : t.equip}
                    </button>
                  ) : (
                    <button
                      className="button primary compact-button"
                      type="button"
                      disabled={busyCosmetic !== null}
                      onClick={() => void buy(cosmetic.id)}
                    >
                      {busy ? t.community.working : t.buy}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </section>
  );
}
