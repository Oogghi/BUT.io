import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Link, useLocation } from 'react-router';
import { Icon } from './Icon';
import { loadProfile } from './profile';
import {
  createGroup as createGroupRequest,
  currentAccount,
  DataLayerError,
  inviteToGroup,
  joinGroup as joinGroupRequest,
  leaveGroup as leaveGroupRequest,
  loadGroupState,
  publishGroupLobbyInvite as publishLobbyInviteRequest,
  removeGroupMember as removeGroupMemberRequest,
  respondToGroupInvite,
  subscribeToGroupEvents,
  supabase,
  transferGroupLeadership as transferLeadershipRequest,
  type Account,
  type GameId,
  type GroupLobbyInviteView,
  type GroupState,
} from './supabaseData';
import { activeGroupLobbyInvites, groupLobbyInviteKey } from './groupLogic';
import { t } from './i18n';

const emptyState: GroupState = {
  group: null,
  invites: [],
  lobbyInvites: [],
};

interface GroupSessionValue {
  account: Account | null;
  state: GroupState;
  lobbyInvites: GroupLobbyInviteView[];
  accountLoading: boolean;
  loading: boolean;
  error: string;
  refresh: () => Promise<GroupState>;
  createGroup: () => Promise<void>;
  joinGroup: (code: string) => Promise<void>;
  inviteToGroup: (userId: string) => Promise<void>;
  respondToInvite: (inviteId: string, accept: boolean) => Promise<void>;
  leaveGroup: () => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
  transferLeadership: (userId: string) => Promise<void>;
  publishLobbyInvite: (
    lobbyCode: string,
    gameId: GameId,
    gameName: string,
    groupId?: string,
  ) => Promise<void>;
  dismissLobbyInvite: (invite: GroupLobbyInviteView) => void;
}

const GroupSessionContext = createContext<GroupSessionValue | null>(null);

const seenStorageKey = (userId: string) => `but.group-lobby-seen.${userId}`;

function readSeenInvites(userId: string) {
  try {
    const value = JSON.parse(
      localStorage.getItem(seenStorageKey(userId)) ?? '[]',
    );
    return Array.isArray(value) &&
      value.every((item) => typeof item === 'string')
      ? value.slice(-50)
      : [];
  } catch {
    return [];
  }
}

function rememberSeenInvite(userId: string, key: string) {
  const seen = [...new Set([...readSeenInvites(userId), key])].slice(-50);
  try {
    localStorage.setItem(seenStorageKey(userId), JSON.stringify(seen));
  } catch {
    // Private browsing/storage-disabled environments still get a working session.
  }
  return seen;
}

export function GroupProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [state, setState] = useState(emptyState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [seenInvites, setSeenInvites] = useState<string[]>([]);

  const refresh = useCallback(async (): Promise<GroupState> => {
    if (!account) {
      setState(emptyState);
      return emptyState;
    }
    setLoading(true);
    try {
      const next = await loadGroupState(account.userId);
      setState(next);
      setError('');
      return next;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t.community.genericError,
      );
      throw cause;
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    let active = true;
    const syncAccount = async () => {
      try {
        const next = await currentAccount(loadProfile().displayName);
        if (!active) return;
        setAccount(next);
        setSeenInvites(next ? readSeenInvites(next.userId) : []);
      } catch {
        if (active) {
          setAccount(null);
          setSeenInvites([]);
        }
      } finally {
        if (active) setAccountLoading(false);
      }
    };
    void syncAccount();

    const authListener = currentSupabaseAuthListener(syncAccount);
    return () => {
      active = false;
      authListener?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!account) {
      setState(emptyState);
      return;
    }
    void refresh().catch(() => undefined);
  }, [account, refresh]);

  useEffect(() => {
    if (!account) return;
    let timer: number | undefined;
    const scheduleRefresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void refresh().catch(() => undefined);
      }, 80);
    };
    const stop = subscribeToGroupEvents(
      account.userId,
      state.group?.id ?? null,
      scheduleRefresh,
    );
    return () => {
      window.clearTimeout(timer);
      stop();
    };
  }, [account, refresh, state.group?.id]);

  const run = useCallback(
    async (operation: () => Promise<void>) => {
      setError('');
      await operation();
      await refresh();
    },
    [refresh],
  );

  const value = useMemo<GroupSessionValue>(
    () => ({
      account,
      state,
      lobbyInvites: activeGroupLobbyInvites(state.lobbyInvites).filter(
        (invite) =>
          invite.leaderId !== account?.userId &&
          !seenInvites.includes(groupLobbyInviteKey(invite)),
      ),
      accountLoading,
      loading,
      error,
      refresh,
      createGroup: () => run(() => createGroupRequest()),
      joinGroup: (code) => run(() => joinGroupRequest(code)),
      inviteToGroup: (userId) => {
        if (!state.group)
          return Promise.reject(new DataLayerError('not-group-member', ''));
        return run(() => inviteToGroup(state.group!.id, userId));
      },
      respondToInvite: (inviteId, accept) =>
        run(() => respondToGroupInvite(inviteId, accept)),
      leaveGroup: () => {
        if (!state.group)
          return Promise.reject(new DataLayerError('not-group-member', ''));
        return run(() => leaveGroupRequest(state.group!.id));
      },
      removeMember: (userId) => {
        if (!state.group)
          return Promise.reject(new DataLayerError('not-group-member', ''));
        return run(() => removeGroupMemberRequest(state.group!.id, userId));
      },
      transferLeadership: (userId) => {
        if (!state.group)
          return Promise.reject(new DataLayerError('not-group-member', ''));
        return run(() => transferLeadershipRequest(state.group!.id, userId));
      },
      publishLobbyInvite: async (lobbyCode, gameId, gameName, groupId) => {
        const targetGroupId = groupId ?? state.group?.id;
        if (
          !targetGroupId ||
          (!groupId && state.group?.leaderId !== account?.userId)
        )
          return;
        await publishLobbyInviteRequest(
          targetGroupId,
          lobbyCode,
          gameId,
          gameName,
        );
      },
      dismissLobbyInvite: (invite) => {
        if (!account) return;
        setSeenInvites(
          rememberSeenInvite(account.userId, groupLobbyInviteKey(invite)),
        );
      },
    }),
    [account, accountLoading, error, loading, refresh, run, seenInvites, state],
  );

  return (
    <GroupSessionContext.Provider value={value}>
      {children}
    </GroupSessionContext.Provider>
  );
}

function currentSupabaseAuthListener(syncAccount: () => Promise<void>) {
  if (!supabase) return null;
  const { data } = supabase.auth.onAuthStateChange(() => {
    window.setTimeout(() => void syncAccount(), 0);
  });
  return data.subscription;
}

export function useGroupSession() {
  const value = useContext(GroupSessionContext);
  if (!value)
    throw new Error('useGroupSession must be used inside GroupProvider');
  return value;
}

export function GroupLobbyInviteBanner({
  onJoin,
}: {
  onJoin: (invite: GroupLobbyInviteView) => void | Promise<void>;
}) {
  const { lobbyInvites, state, dismissLobbyInvite } = useGroupSession();
  const location = useLocation();
  const invite = lobbyInvites[0];
  const leaderName = invite
    ? (state.group?.members.find((member) => member.userId === invite.leaderId)
        ?.username ?? 'A group member')
    : '';

  useEffect(() => {
    if (
      invite &&
      location.pathname.toUpperCase() === `/LOBBY/${invite.lobbyCode}`
    ) {
      dismissLobbyInvite(invite);
    }
  }, [dismissLobbyInvite, invite, location.pathname]);

  return (
    <AnimatePresence>
      {invite && (
        <motion.aside
          className="group-lobby-banner"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          role="status"
        >
          <div>
            <strong>
              {leaderName} {t.community.launched} {invite.gameName}
            </strong>
            <span>{t.community.groupLobbyInvite}</span>
          </div>
          <button
            className="button primary compact-button"
            type="button"
            onClick={() => {
              dismissLobbyInvite(invite);
              void onJoin(invite);
            }}
          >
            {t.community.join}
          </button>
          <button
            className="group-banner-dismiss"
            type="button"
            aria-label={t.community.dismiss}
            onClick={() => dismissLobbyInvite(invite)}
          >
            ×
          </button>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

export function GroupIndicator() {
  const { account, accountLoading, state } = useGroupSession();
  if (accountLoading) return null;
  return (
    <Link
      className={`group-indicator${state.group ? ' is-active' : ''}`}
      to="/group"
      aria-label={state.group ? t.community.groupDetails : t.group}
    >
      <span className="group-indicator-icon" aria-hidden="true">
        <Icon name="users" />
      </span>
      <span>
        {state.group ? `${t.group} · ${state.group.members.length}` : t.group}
      </span>
      {account && state.group && (
        <span className="group-indicator-code">{state.group.code}</span>
      )}
    </Link>
  );
}

export function inviteErrorMessage(error: unknown) {
  if (!(error instanceof DataLayerError)) return t.community.genericError;
  const messages: Partial<Record<DataLayerError['code'], string>> = {
    'already-in-group': t.community.alreadyInGroup,
    'invalid-group-code': t.community.invalidGroupCode,
    'group-not-found': t.community.groupNotFound,
    'not-group-member': t.community.notGroupMember,
    'leader-only': t.community.leaderOnly,
    'member-not-found': t.community.memberNotFound,
    'self-invite': t.community.selfInvite,
    'invitee-already-in-group': t.community.inviteeAlreadyInGroup,
    'invite-not-found': t.community.inviteNotFound,
  };
  return messages[error.code] ?? t.community.genericError;
}
