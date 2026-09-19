import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { DISPLAY_NAME_MAX_LENGTH, LOBBY_CODE_PATTERN } from '@but/shared';
import { bombParty } from '@but/bomb-party';
import { tankArena } from '@but/tank-arena';
import { Icon } from './Icon';
import { ProfileAvatar } from './Avatar';
import { loadProfile, saveProfile, type Profile } from './profile';
import { t } from './i18n';
import { GameCard } from './GameCard';
import { gameCards } from './gameCards';
import { useGroupSession } from './GroupSession';
import type { AuthMode, CommunitySection } from './CommunityView';
import type { Destination } from './App';

/** Games with a server room; the other cards are placeholders. */
const playable: string[] = [bombParty.id, tankArena.id];

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
  const name = profile.displayName;
  const [joinCode, setJoinCode] = useState(code ?? '');
  const [mode, setMode] = useState<'create' | 'join'>(code ? 'join' : 'create');
  const [errors, setErrors] = useState({ name: '', code: '' });
  const nameInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [activeGame, setActiveGame] = useState<string | null>(null);
  // Invite links name their game so the card matches before joining.
  const [searchParams] = useSearchParams();
  const invitedGame =
    gameCards.find((game) => game.id === searchParams.get('game')) ??
    gameCards[0];
  const orderedGames = [...gameCards].sort(
    (a, b) => Number(b.id === activeGame) - Number(a.id === activeGame),
  );

  useEffect(() => {
    if (
      activeGame &&
      grid.current &&
      grid.current.getBoundingClientRect().top < 24
    ) {
      grid.current.scrollIntoView({
        block: 'start',
        behavior: reducedMotion ? 'instant' : 'smooth',
      });
    }
  }, [activeGame, reducedMotion]);

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
              avatar={profile.avatar}
              onChange={(avatar) => updateProfile({ avatar })}
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
              {orderedGames.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  open={activeGame === game.id}
                  pending={pending}
                  onToggle={() => toggleGame(game.id)}
                >
                  <div className="selection-heading">
                    <p>
                      {playable.includes(game.id)
                        ? t.gameTaglines[game.id as keyof typeof t.gameTaglines]
                        : t.gameComingSoon}
                    </p>
                  </div>
                  {playable.includes(game.id) && roomForm()}
                </GameCard>
              ))}
            </div>
          </LayoutGroup>
        )}
      </section>
    </>
  );

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
        ) : (
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
        )}
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
              {/* Rendered in both modes (hidden when creating) so switching modes never
                  changes the panel's height. */}
              {!code && (
                <div
                  className={`field ${mode === 'join' ? '' : 'is-reserved'}`}
                >
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
          <p role="status" className="fine-print">
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
