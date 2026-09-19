import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Icon } from './Icon';
import { inviteErrorMessage, useGroupSession } from './GroupSession';
import { t } from './i18n';
import {
  loadFriendState,
  searchProfiles,
  type Account,
  type FriendState,
  type ProfileRecord,
} from './supabaseData';
import { isGroupCode } from './groupLogic';

export function GroupFeature({ account }: { account: Account }) {
  const session = useGroupSession();
  const [code, setCode] = useState('');
  const [friends, setFriends] = useState<FriendState | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileRecord[]>([]);
  const [copied, setCopied] = useState(false);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void loadFriendState(account.userId)
      .then((next) => {
        if (active) setFriends(next);
      })
      .catch(() => {
        if (active) setFriends({ friends: [], incoming: [], outgoing: [] });
      });
    return () => {
      active = false;
    };
  }, [account.userId]);

  async function run(key: string, operation: () => Promise<void>) {
    setBusy(key);
    setError('');
    try {
      await operation();
    } catch (cause) {
      setError(inviteErrorMessage(cause));
    } finally {
      setBusy('');
    }
  }

  async function submitJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!isGroupCode(normalized)) {
      setError(t.community.invalidGroupCode);
      return;
    }
    await run('join', () => session.joinGroup(normalized));
    setCode('');
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (query.trim().length < 2) {
      setError(t.community.searchTooShort);
      return;
    }
    await run('search', async () => {
      setResults(await searchProfiles(query, account.userId));
    });
  }

  async function copyCode() {
    if (!session.state.group) return;
    try {
      await navigator.clipboard.writeText(session.state.group.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError(t.copyFailed);
    }
  }

  const memberIds = useMemo(
    () => new Set(session.state.group?.members.map((member) => member.userId)),
    [session.state.group?.members],
  );

  if (
    session.loading &&
    !session.state.group &&
    !session.state.invites.length
  ) {
    return (
      <p className="loading-state" role="status">
        {t.community.loading}
      </p>
    );
  }

  return (
    <div className="community-content group-content">
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {session.error && !error && (
        <p className="notice" role="alert">
          {t.community.genericError}
        </p>
      )}

      {session.state.invites.length > 0 && (
        <section className="community-section">
          <div className="section-heading">
            <h2>{t.community.pendingGroupInvites}</h2>
            <span className="community-count">
              {session.state.invites.length}
            </span>
          </div>
          <ul className="community-list panel group-invite-list">
            {session.state.invites.map((invite) => (
              <li key={invite.id}>
                <span>
                  <strong>{t.group}</strong>
                  <small>{t.community.invitedBy(invite.inviterUsername)}</small>
                </span>
                <span className="community-actions">
                  <button
                    className="button primary compact-button"
                    type="button"
                    disabled={busy === `accept:${invite.id}`}
                    onClick={() =>
                      void run(`accept:${invite.id}`, () =>
                        session.respondToInvite(invite.id, true),
                      )
                    }
                  >
                    {t.community.accept}
                  </button>
                  <button
                    className="text-link is-muted"
                    type="button"
                    disabled={busy === `decline:${invite.id}`}
                    onClick={() =>
                      void run(`decline:${invite.id}`, () =>
                        session.respondToInvite(invite.id, false),
                      )
                    }
                  >
                    {t.community.decline}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!session.state.group ? (
        <div className="group-entry-grid">
          <section className="panel group-action-card">
            <span className="group-card-icon">
              <Icon name="users" />
            </span>
            <h2>{t.community.createGroup}</h2>
            <p>{t.community.createGroupDescription}</p>
            <button
              className="button primary"
              type="button"
              disabled={busy === 'create'}
              onClick={() => void run('create', () => session.createGroup())}
            >
              {busy === 'create'
                ? t.community.working
                : t.community.createGroup}
              <Icon name="arrow" />
            </button>
          </section>
          <form className="panel group-action-card" onSubmit={submitJoin}>
            <span className="group-card-icon is-mint">
              <Icon name="copy" />
            </span>
            <h2>{t.community.joinGroup}</h2>
            <p>{t.community.joinGroupDescription}</p>
            <label className="field">
              <span>{t.community.groupCode}</span>
              <input
                maxLength={6}
                autoCapitalize="characters"
                placeholder={t.community.enterGroupCode}
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
              />
            </label>
            <button
              className="button primary"
              type="submit"
              disabled={busy === 'join'}
            >
              {busy === 'join' ? t.community.working : t.community.joinGroup}
              <Icon name="arrow" />
            </button>
          </form>
        </div>
      ) : (
        <>
          <section className="panel group-panel">
            <header className="group-panel-header">
              <div>
                <span className="eyebrow">{t.group}</span>
                <h2>{session.state.group.code}</h2>
              </div>
              <button
                className="text-link"
                type="button"
                onClick={() => void copyCode()}
              >
                <Icon name={copied ? 'check' : 'copy'} />
                {copied
                  ? t.community.groupCodeCopied
                  : t.community.copyGroupCode}
              </button>
            </header>
            <div className="group-members-heading">
              <h3>{t.community.members}</h3>
              <span className="community-count">
                {session.state.group.members.length}
              </span>
            </div>
            <ul className="community-list group-member-list">
              {session.state.group.members.map((member) => (
                <li key={member.userId}>
                  <span className="group-member-name">
                    <span className="group-avatar" aria-hidden="true">
                      {member.username.slice(0, 1).toUpperCase()}
                    </span>
                    <strong>{member.username}</strong>
                    {member.userId === account.userId && (
                      <small>{t.community.you}</small>
                    )}
                    {member.isLeader && (
                      <span className="group-leader-badge">
                        <Icon name="crown" /> {t.community.leader}
                      </span>
                    )}
                  </span>
                  {session.state.group?.leaderId === account.userId &&
                    member.userId !== account.userId && (
                      <span className="community-actions">
                        <button
                          className="text-link is-muted"
                          type="button"
                          disabled={busy === `transfer:${member.userId}`}
                          onClick={() =>
                            void run(`transfer:${member.userId}`, () =>
                              session.transferLeadership(member.userId),
                            )
                          }
                        >
                          {t.community.transferLeadership}
                        </button>
                        <button
                          className="text-link is-muted"
                          type="button"
                          disabled={busy === `remove:${member.userId}`}
                          onClick={() =>
                            void run(`remove:${member.userId}`, () =>
                              session.removeMember(member.userId),
                            )
                          }
                        >
                          {t.community.removeMember}
                        </button>
                      </span>
                    )}
                </li>
              ))}
            </ul>
            {session.state.group.leaderId === account.userId && (
              <p className="community-muted group-leader-note">
                {t.community.leaderLeavesNote}
              </p>
            )}
            <button
              className="text-link is-danger"
              type="button"
              disabled={busy === 'leave'}
              onClick={() => void run('leave', () => session.leaveGroup())}
            >
              {t.community.leaveGroup}
            </button>
          </section>

          <section className="community-section">
            <div className="section-heading">
              <h2>{t.community.invitePlayer}</h2>
            </div>
            <form className="community-search panel" onSubmit={search}>
              <label htmlFor="group-player-search">
                {t.community.searchToInvite}
              </label>
              <div>
                <input
                  id="group-player-search"
                  value={query}
                  placeholder={t.community.searchPlaceholder}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <button
                  className="button primary"
                  type="submit"
                  disabled={busy === 'search'}
                >
                  {busy === 'search' ? t.community.working : t.community.search}
                </button>
              </div>
              {results.length > 0 && (
                <ul className="community-list community-search-results">
                  {results.map((profile) => (
                    <li key={profile.id}>
                      <strong>{profile.username}</strong>
                      {memberIds.has(profile.id) ? (
                        <span className="community-status">
                          {t.community.members}
                        </span>
                      ) : (
                        <InviteButton
                          invited={invitedIds.has(profile.id)}
                          onInvite={() =>
                            void run(`invite:${profile.id}`, async () => {
                              await session.inviteToGroup(profile.id);
                              setInvitedIds((current) =>
                                new Set(current).add(profile.id),
                              );
                            })
                          }
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </form>
            <div className="panel group-friend-invites">
              <h3>{t.community.inviteFriend}</h3>
              {friends?.friends.length ? (
                <ul className="community-list">
                  {friends.friends.map((friend) => (
                    <li key={friend.userId}>
                      <strong>{friend.username}</strong>
                      <InviteButton
                        invited={invitedIds.has(friend.userId)}
                        onInvite={() =>
                          void run(`friend:${friend.userId}`, async () => {
                            await session.inviteToGroup(friend.userId);
                            setInvitedIds((current) =>
                              new Set(current).add(friend.userId),
                            );
                          })
                        }
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="community-muted">
                  {t.community.noFriendsToInvite}
                </p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function InviteButton({
  invited,
  onInvite,
}: {
  invited: boolean;
  onInvite: () => void;
}) {
  return (
    <button
      className="text-link"
      type="button"
      disabled={invited}
      onClick={onInvite}
    >
      {invited ? t.community.invited : t.community.invite}
    </button>
  );
}
