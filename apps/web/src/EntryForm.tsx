import { useAppReducedMotion as useReducedMotion } from './MotionPreferences';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import {
  DISPLAY_NAME_MAX_LENGTH,
  LOBBY_CODE_PATTERN,
  resolvePlayerAvatar,
  type CosmeticLoadout,
} from '@but/shared';
import { bombParty } from '@but/bomb-party';
import { tankArena } from '@but/tank-arena';
import { blackjackParty } from '@but/blackjack-party';
import { pokerParty } from '@but/poker-party';
import { Icon } from './Icon';
import { ProfileAvatar } from './Avatar';
import { loadProfile, saveProfile, type Profile } from './profile';
import { t } from './i18n';
import { CardOptions, GameCard } from './GameCard';
import { gameCards } from './gameCards';
import { useGroupSession } from './GroupSession';
import type { AuthMode, CommunitySection } from './CommunityView';
import type { Destination } from './App';
import { loadRewardState } from './supabaseData';

/** Games with a server room; the other cards are placeholders. */
const playable: string[] = [
  bombParty.id,
  tankArena.id,
  blackjackParty.id,
  pokerParty.id,
];

interface Props {
  code?: string;
  pending: boolean;
  error: string;
  connect: (profile: Profile, destination: Destination) => Promise<void>;
  onOpenCommunity?: (section: CommunitySection, authMode?: AuthMode) => void;
  onOpenSettings?: () => void;
  onOpenLocker?: () => void;
  settingsOpen?: boolean;
}

export function EntryForm({
  code,
  pending,
  error,
  connect,
  onOpenCommunity,
  onOpenSettings,
  onOpenLocker,
  settingsOpen = false,
}: Props) {
  const navigate = useNavigate();
  const { account, accountLoading, disconnect } = useGroupSession();
  const [profile, setProfile] = useState(loadProfile);
  const [avatarEquipment, setAvatarEquipment] = useState<{
    userId: string;
    loadout: CosmeticLoadout;
  } | null>(null);
  const equippedLoadout =
    account &&
    !account.isAnonymous &&
    avatarEquipment?.userId === account.userId
      ? avatarEquipment.loadout
      : {};
  const shownAvatar = resolvePlayerAvatar(profile.avatar, equippedLoadout);
  useEffect(() => {
    if (!account || account.isAnonymous) return;
    let active = true;
    let request = 0;
    const userId = account.userId;
    const refresh = () => {
      const current = ++request;
      void loadRewardState(userId)
        .then((rewards) => {
          if (active && current === request)
            setAvatarEquipment({ userId, loadout: rewards.equippedCosmetics });
        })
        .catch(() => {
          if (active && current === request) setAvatarEquipment(null);
        });
    };
    refresh();
    window.addEventListener('but-reward-change', refresh);
    return () => {
      active = false;
      window.removeEventListener('but-reward-change', refresh);
    };
  }, [account?.userId, account?.isAnonymous]);
  const name = profile.displayName;
  const [joinCode, setJoinCode] = useState(code ?? '');
  const [mode, setMode] = useState<'create' | 'join'>(code ? 'join' : 'create');
  const [errors, setErrors] = useState({ name: '', code: '' });
  const nameInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const joinShortcut = useRef<HTMLButtonElement>(null);
  const [directJoin, setDirectJoin] = useState(false);
  const reducedMotion = useReducedMotion();
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const [catalogColumns, setCatalogColumns] = useState(1);
  const activeIndex = gameCards.findIndex((game) => game.id === activeGame);
  const expandedRow = Math.floor(Math.max(0, activeIndex) / catalogColumns) + 1;
  const grid = useRef<HTMLDivElement>(null);
  // Invite links name their game so the card matches before joining.
  const [searchParams] = useSearchParams();
  const invitedGame =
    gameCards.find((game) => game.id === searchParams.get('game')) ??
    gameCards[0];
  // Use the collapsed catalog's columns, even while an open card changes the grid.
  useEffect(() => {
    const element = grid.current;
    if (!element) return;
    const updateColumns = () => {
      setCatalogColumns(
        Number(
          getComputedStyle(element).getPropertyValue('--catalog-columns'),
        ) || 1,
      );
    };
    updateColumns();
    const observer = new ResizeObserver(updateColumns);
    observer.observe(element);
    return () => observer.disconnect();
  }, [code]);

  useEffect(() => {
    const panel = document.getElementById(
      directJoin ? 'join-options' : activeGame ? activeGame + '-options' : '',
    );
    if (panel && panel.getBoundingClientRect().bottom > window.innerHeight) {
      panel.scrollIntoView({
        block: 'nearest',
        behavior: reducedMotion ? 'instant' : 'smooth',
      });
    }
  }, [activeGame, directJoin, reducedMotion]);

  function closeOptions() {
    if (pending) return;
    if (directJoin) joinShortcut.current?.focus({ preventScroll: true });
    else
      document
        .getElementById(`${activeGame}-tile`)
        ?.focus({ preventScroll: true });
    setActiveGame(null);
    setDirectJoin(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target =
      code ?? (mode === 'join' ? joinCode.trim().toUpperCase() : undefined);
    const next = {
      name: name.trim() ? '' : t.nameRequired,
      code:
        target === undefined || LOBBY_CODE_PATTERN.test(target)
          ? ''
          : t.invalidCode,
    };
    setErrors(next);
    if (next.name) nameInput.current?.focus();
    else if (next.code) codeInput.current?.focus();
    else
      void connect(
        { ...profile, displayName: name.trim() },
        target === undefined
          ? { gameId: activeGame ?? bombParty.id }
          : { code: target },
      );
  }

  function updateProfile(changes: Partial<Profile>) {
    const next = { ...profile, ...changes };
    setProfile(next);
    saveProfile(next);
  }

  function changeName(value: string) {
    updateProfile({ displayName: value });
    setErrors((current) => ({ ...current, name: '' }));
  }

  function invalidProps(field: 'name' | 'code') {
    return {
      'aria-invalid': Boolean(errors[field]),
      'aria-describedby': errors[field] ? `${field}-error` : undefined,
    };
  }

  function toggleGame(id: string) {
    if (pending) return;
    if (!activeGame || directJoin) setMode('create');
    setDirectJoin(false);
    setActiveGame((current) => (current === id ? null : id));
    if (activeGame !== id && playable.includes(id) && !name.trim()) {
      nameInput.current?.focus({ preventScroll: true });
    }
  }

  return (
    <>
      {!code && (
        <section className="hero" aria-label={t.profile}>
          <div className="profile-card">
            <ProfileAvatar
              avatar={shownAvatar}
              onChange={(avatar) => {
                if (equippedLoadout.avatar) {
                  if (onOpenLocker) onOpenLocker();
                  else void navigate('/locker');
                } else updateProfile({ avatar });
              }}
            />
            <div className="profile-identity">
              <label className="profile-name">
                <input
                  ref={nameInput}
                  id="profile-name"
                  aria-label={t.displayName}
                  placeholder={t.yourName}
                  autoComplete="off"
                  maxLength={DISPLAY_NAME_MAX_LENGTH}
                  value={name}
                  disabled={pending}
                  onChange={(event) => changeName(event.target.value)}
                  {...invalidProps('name')}
                />
                <FieldError id="name-error" message={errors.name} />
              </label>
              {!accountLoading && (
                <div
                  className={`profile-account-status-row${account && !account.isAnonymous ? ' is-connected' : ''}`}
                >
                  {account && !account.isAnonymous ? (
                    <>
                      <span className="profile-account-status">
                        <span
                          className="profile-status-dot"
                          aria-hidden="true"
                        />
                        {t.community.signedInAs}{' '}
                        <strong>
                          {account.username || name || t.yourName}
                        </strong>
                      </span>
                      <button
                        className="profile-account-link"
                        type="button"
                        onClick={() => void disconnect()}
                      >
                        {t.community.signOut}
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="profile-account-status">
                        <span
                          className="profile-status-dot"
                          aria-hidden="true"
                        />
                        {account?.isAnonymous
                          ? t.community.guestAccount
                          : t.community.notConnected}
                      </span>
                      <span className="profile-account-links">
                        <button
                          className="profile-account-link"
                          type="button"
                          onClick={() =>
                            onOpenCommunity?.('friends', 'sign-in')
                          }
                        >
                          {t.community.signIn}
                        </button>
                        <button
                          className="profile-account-link is-primary"
                          type="button"
                          onClick={() =>
                            onOpenCommunity?.('friends', 'sign-up')
                          }
                        >
                          {t.community.createAccount}
                        </button>
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          <div
            className="profile-actions"
            role="group"
            aria-label={t.shortcuts}
          >
            <div className="profile-action profile-action-locker">
              <button
                type="button"
                aria-label={t.locker}
                onClick={onOpenLocker}
              >
                <span className="profile-action-icon">
                  <Icon name="locker" />
                </span>
                <span className="profile-action-label">{t.locker}</span>
              </button>
            </div>
            <div className="profile-action profile-action-social">
              <button
                type="button"
                aria-label={t.community.openCommunity}
                onClick={() => onOpenCommunity?.('friends')}
              >
                <span className="profile-action-icon">
                  <Icon name="users" />
                </span>
                <span className="profile-action-label">{t.social}</span>
              </button>
            </div>
            <div className="profile-action profile-action-trophy">
              <button
                type="button"
                aria-label={t.community.openArena}
                onClick={() => navigate('/stats')}
              >
                <span className="profile-action-icon">
                  <Icon name="trophy" />
                </span>
                <span className="profile-action-label">{t.arena}</span>
              </button>
            </div>
            <div className="profile-action profile-action-settings">
              <button
                type="button"
                aria-expanded={settingsOpen}
                aria-controls="settings-drawer"
                onClick={onOpenSettings}
              >
                <span className="profile-action-icon">
                  <Icon name="settings" />
                </span>
                <span className="profile-action-label">{t.settings}</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {code && (
        <div className="entry-heading">
          <Link to="/" className="text-link">
            <Icon name="back" /> {t.backHome}
          </Link>
          <h1>{t.joinHeading}</h1>
        </div>
      )}

      <section
        className={`play-section ${code ? 'invitation' : ''}`}
        id="games"
        aria-labelledby={code ? undefined : 'games-title'}
        aria-label={code ? t.joinGame(invitedGame.name) : undefined}
      >
        {!code && (
          <div className="section-heading">
            <h2 id="games-title">{t.pickGame}</h2>
            <button
              ref={joinShortcut}
              className="button secondary join-shortcut"
              type="button"
              disabled={pending}
              aria-expanded={directJoin}
              aria-controls={directJoin ? 'join-options' : undefined}
              onClick={() => {
                setActiveGame(null);
                setMode('join');
                setDirectJoin(!directJoin);
              }}
            >
              <Icon name="users" /> {t.joinRoom}
            </button>
          </div>
        )}
        {code ? (
          <div className="invitation-layout">
            <GameCard
              game={invitedGame}
              open={false}
              pending={pending}
              onToggle={() => nameInput.current?.focus()}
            />
            {roomForm()}
          </div>
        ) : (
          <LayoutGroup>
            <div className="game-grid" ref={grid}>
              {gameCards.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  open={activeGame === game.id}
                  expandedRow={expandedRow}
                  pending={pending}
                  onToggle={() => toggleGame(game.id)}
                >
                  {activeGame === game.id && (
                    <CardOptions
                      key={game.id + '-options'}
                      id={game.id + '-options'}
                      name={game.name}
                      color={game.color}
                      reducedMotion={reducedMotion}
                      onClose={closeOptions}
                    >
                      <div className="selection-heading">
                        <p>{t.gameTaglines[game.id]}</p>
                      </div>
                      {roomForm()}
                      {closeButton()}
                    </CardOptions>
                  )}
                </GameCard>
              ))}
            </div>
            <AnimatePresence initial={false}>
              {directJoin && (
                <CardOptions
                  key="join-options"
                  id="join-options"
                  name={t.joinRoom}
                  color="sky"
                  reducedMotion={reducedMotion}
                  onClose={closeOptions}
                >
                  <div className="selection-heading">
                    <h3>{t.joinRoom}</h3>
                    <p>{t.polish.joinHint}</p>
                  </div>
                  {roomForm()}
                  {closeButton()}
                </CardOptions>
              )}
            </AnimatePresence>
          </LayoutGroup>
        )}
      </section>
    </>
  );

  function closeButton() {
    return (
      <button
        className="selection-close"
        type="button"
        aria-label={t.closeOptions}
        disabled={pending}
        onClick={closeOptions}
      >
        ×
      </button>
    );
  }

  function roomForm() {
    return (
      <div className="entry-panel" id="play">
        {code ? (
          <>
            <div className="invite-code">
              <span className="code-label">{t.lobbyCode}</span>
              <strong>{code}</strong>
            </div>
            <FieldError id="code-error" message={errors.code} />
          </>
        ) : !directJoin ? (
          <div className="mode-switch" role="group" aria-label={t.modeGroup}>
            {(
              [
                ['create', t.createRoom],
                ['join', t.joinRoom],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => {
                  setMode(value);
                  setErrors((current) => ({ ...current, code: '' }));
                }}
              >
                {mode === value && (
                  <motion.span className="mode-pill" layoutId="mode-pill" />
                )}
                <span>{label}</span>
              </button>
            ))}
          </div>
        ) : null}
        <motion.div
          key={mode}
          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <form onSubmit={submit} noValidate>
            <fieldset disabled={pending}>
              {/* On the home page the profile card owns the name. */}
              {code && (
                <div className="field">
                  <label htmlFor="display-name">{t.yourName}</label>
                  <input
                    ref={nameInput}
                    id="display-name"
                    placeholder={t.enterName}
                    autoComplete="off"
                    maxLength={DISPLAY_NAME_MAX_LENGTH}
                    value={name}
                    onChange={(event) => changeName(event.target.value)}
                    {...invalidProps('name')}
                  />
                  <FieldError id="name-error" message={errors.name} />
                </div>
              )}
              {!code && mode === 'join' && (
                <div className="field">
                  <label htmlFor="lobby-code">{t.lobbyCode}</label>
                  <input
                    ref={codeInput}
                    id="lobby-code"
                    placeholder="ABC234"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    maxLength={6}
                    value={joinCode}
                    onChange={(event) => {
                      setJoinCode(event.target.value.toUpperCase());
                      setErrors((current) => ({ ...current, code: '' }));
                    }}
                    {...invalidProps('code')}
                  />
                  <FieldError id="code-error" message={errors.code} />
                </div>
              )}
              <button
                className="button primary form-submit"
                type="submit"
                value={mode}
              >
                {pending
                  ? t.connecting
                  : mode === 'create'
                    ? t.createLobby
                    : t.joinLobby}
                <Icon name="arrow" />
              </button>
            </fieldset>
          </form>
        </motion.div>
        {pending && (
          <p role="status" className="sr-only">
            {t.connecting}
          </p>
        )}
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
      </div>
    );
  }
}

function FieldError({ id, message }: { id: string; message: string }) {
  return message ? (
    <span id={id} className="field-error" role="alert">
      {message}
    </span>
  ) : null;
}
