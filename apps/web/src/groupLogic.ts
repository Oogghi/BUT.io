import type { GroupLobbyInviteView } from './supabaseData';

export function isGroupCode(value: string) {
  return /^[A-Z0-9]{6}$/.test(value.trim().toUpperCase());
}

export function groupLobbyInviteKey(
  invite: Pick<GroupLobbyInviteView, 'groupId' | 'lobbyCode'>,
) {
  return `${invite.groupId}:${invite.lobbyCode}`;
}

export function activeGroupLobbyInvites(
  invites: GroupLobbyInviteView[],
  now = Date.now(),
) {
  const seen = new Set<string>();
  return invites.filter((invite) => {
    const active = Date.parse(invite.expiresAt) > now;
    const key = groupLobbyInviteKey(invite);
    if (!active || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
