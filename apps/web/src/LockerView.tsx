import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  AVATAR_COUNT,
  DISPLAY_NAME_MAX_LENGTH,
  resolvePlayerAvatar,
} from '@but/shared';
import { Icon } from './Icon';
import { PlayerAvatar, ProfileAvatar } from './Avatar';
import { loadProfile, saveProfile, type Profile } from './profile';
import { t } from './i18n';
import {
  cosmetics,
  cosmeticSlots,
  cosmeticLabels as c,
  type CosmeticSlot,
  type CosmeticId,
} from './cosmetics';
import { CosmeticPreview } from './CosmeticPreview';
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
  const [saveFailed, setSaveFailed] = useState(false);
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const latestProfile = useRef(profile);
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [rewards, setRewards] = useState<RewardState | null>(null);
  const [rewardError, setRewardError] = useState('');
  const [busyCosmetic, setBusyCosmetic] = useState<string | null>(null);
  const [category, setCategory] = useState<CosmeticSlot | 'all'>('all');

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
    const next = { ...latestProfile.current, ...changes };
    latestProfile.current = next;
    setProfile(next);
    setSaveFailed(!saveProfile(next));
  }

  const previewName = profile.displayName.trim() || t.yourName;
  const connected = Boolean(account && !account.isAnonymous);
  const equippedAvatar = rewards?.equippedCosmetics.avatar;
  const avatarBusy =
    busyCosmetic !== null || account === undefined || (connected && !rewards);
  const shownAvatar = resolvePlayerAvatar(
    profile.avatar,
    rewards?.equippedCosmetics ?? {},
  );

  async function selectFreeAvatar(avatar: number) {
    if (avatarBusy) return;
    // Keep the account selection and the local fallback in agreement.
    if (equippedAvatar && !(await equip('avatar', null))) return;
    updateProfile({ avatar });
  }

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
    if (!connected || busyCosmetic || !rewards) return;
    setBusyCosmetic(cosmeticId);
    setRewardError('');
    try {
      await purchaseCosmetic(cosmeticId);
      await reloadRewards();
      dispatchEvent(new CustomEvent('but-reward-change'));
      return true;
    } catch (cause) {
      rewardFailure(cause);
      return false;
    } finally {
      setBusyCosmetic(null);
    }
  }

  async function equip(slot: CosmeticSlot, cosmeticId: CosmeticId | null) {
    if (!connected || busyCosmetic || !rewards) return;
    setBusyCosmetic(cosmeticId ?? slot);
    setRewardError('');
    try {
      await setEquippedCosmetic(cosmeticId, slot);
      await reloadRewards();
      dispatchEvent(new CustomEvent('but-reward-change'));
      return true;
    } catch (cause) {
      rewardFailure(cause);
      return false;
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
            <span className="locker-saved">
              {saveFailed ? t.polish.profileUnsaved : t.polish.profileLocal}
            </span>
          </div>
          <div className="locker-preview-stage">
            <div
              className={`locker-avatar-frame${rewards?.equippedCosmetic ? ` is-${rewards.equippedCosmetic}` : ''}`}
            >
              <ProfileAvatar
                avatar={shownAvatar}
                onChange={(avatar) => void selectFreeAvatar(avatar)}
              />
            </div>
            <div className="locker-preview-copy">
              <strong>{previewName}</strong>
              <span>
                {cosmetics.find((item) => item.id === equippedAvatar)?.name ??
                  t.profile}
              </span>
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
              <h2 id="locker-editor-title">{c.freeAvatars}</h2>
            </div>
            <span className="locker-selection-count">
              {AVATAR_COUNT} · {c.free}
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
                className={`locker-avatar-option${!equippedAvatar && profile.avatar === avatar ? ' is-selected' : ''}`}
                type="button"
                role="radio"
                aria-checked={!equippedAvatar && profile.avatar === avatar}
                aria-label={c.freeNames[avatar]}
                title={c.freeNames[avatar]}
                disabled={avatarBusy}
                onClick={() => void selectFreeAvatar(avatar)}
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
          {!connected && (
            <Link className="text-link" to="/friends">
              {t.signInToUnlock} <Icon name="arrow" />
            </Link>
          )}
        </div>
        {connected && !rewards && !rewardError && (
          <p role="status">{c.loading}</p>
        )}
        <p className="locker-rewards-description">{c.hint}</p>
        {rewards && (
          <section className="cosmetic-loadout" aria-label={c.equipped}>
            {cosmeticSlots.map((slot) => {
              const id = rewards.equippedCosmetics[slot];
              return (
                <div key={slot}>
                  <span>{c[slot]}</span>
                  <strong>
                    {cosmetics.find((item) => item.id === id)?.name ?? c.empty}
                  </strong>
                  {id && (
                    <button
                      className="text-link"
                      type="button"
                      disabled={busyCosmetic !== null}
                      onClick={() => void equip(slot, null)}
                      aria-label={`${c.reset} ${c[slot]}`}
                    >
                      {c.reset}
                    </button>
                  )}
                </div>
              );
            })}
          </section>
        )}
        <div
          className="cosmetic-filters"
          role="group"
          aria-label={t.cosmeticShop}
        >
          {(['all', ...cosmeticSlots] as const).map((slot) => (
            <button
              key={slot}
              type="button"
              className="button secondary compact-button"
              aria-pressed={category === slot}
              onClick={() => setCategory(slot)}
            >
              {c[slot]}
            </button>
          ))}
        </div>
        <div
          className={`locker-cosmetic-grid${category === 'avatar' ? ' is-avatar-category' : ''}`}
        >
          {cosmetics
            .filter((item) => category === 'all' || item.slot === category)
            .map((cosmetic) => {
              const owned =
                rewards?.ownedCosmetics.some((id) => id === cosmetic.id) ??
                false;
              const equipped =
                rewards?.equippedCosmetics[cosmetic.slot] === cosmetic.id;
              const busy = busyCosmetic === cosmetic.id;
              return (
                <article
                  className={`locker-cosmetic-card is-${cosmetic.id}`}
                  key={cosmetic.id}
                >
                  <div className="locker-cosmetic-preview">
                    <CosmeticPreview id={cosmetic.id} avatar={profile.avatar} />
                  </div>
                  <div>
                    <span className="cosmetic-game-label">
                      {cosmetic.slot === 'avatar'
                        ? c.avatarGames
                        : cosmetic.slot === 'frame'
                          ? c.profile
                          : cosmetic.slot === 'tank-decal'
                            ? c.tanks
                            : cosmetic.slot === 'blackjack-celebration'
                              ? c.blackjack
                              : c.games}
                    </span>
                    <strong>{cosmetic.name}</strong>
                    <p>{cosmetic.description}</p>
                  </div>
                  <div className="locker-cosmetic-footer">
                    <span className="locker-cosmetic-price">
                      <Icon name="coin" /> {cosmetic.price}
                    </span>
                    {!connected ? (
                      <Link
                        className="text-link locker-cosmetic-muted"
                        to="/friends"
                      >
                        {t.community.signIn} <Icon name="arrow" />
                      </Link>
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
                        onClick={() => void equip(cosmetic.slot, cosmetic.id)}
                      >
                        {busy ? t.community.working : t.equip}
                      </button>
                    ) : (
                      <button
                        className="button primary compact-button"
                        type="button"
                        disabled={
                          busyCosmetic !== null ||
                          !rewards ||
                          rewards.coins < cosmetic.price
                        }
                        title={
                          rewards && rewards.coins < cosmetic.price
                            ? c.insufficient
                            : undefined
                        }
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
