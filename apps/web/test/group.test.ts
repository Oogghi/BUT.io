import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  activeGroupLobbyInvites,
  groupLobbyInviteKey,
  isGroupCode,
} from '../src/groupLogic.ts';

const invite = (
  overrides: Partial<
    Parameters<typeof activeGroupLobbyInvites>[0][number]
  > = {},
) => ({
  id: 'invite-1',
  groupId: 'group-1',
  leaderId: 'leader-1',
  lobbyCode: 'ABC123',
  gameId: 'bomb-party' as const,
  gameName: 'Bomb Party',
  createdAt: '2026-09-19T10:00:00.000Z',
  expiresAt: '2026-09-19T12:00:00.000Z',
  ...overrides,
});

test('validates short group codes without accepting partial values', () => {
  assert.equal(isGroupCode('abc123'), true);
  assert.equal(isGroupCode('ABC12'), false);
  assert.equal(isGroupCode('ABC1234'), false);
  assert.equal(isGroupCode('ABC-23'), false);
});

test('deduplicates and removes expired lobby invitations', () => {
  const first = invite();
  const duplicate = invite({ id: 'invite-2' });
  const other = invite({ id: 'invite-3', lobbyCode: 'XYZ789' });
  const expired = invite({
    id: 'invite-4',
    expiresAt: '2026-09-19T09:00:00.000Z',
  });

  assert.deepEqual(
    activeGroupLobbyInvites(
      [first, duplicate, other, expired],
      Date.parse('2026-09-19T10:30:00.000Z'),
    ),
    [first, other],
  );
  assert.equal(groupLobbyInviteKey(first), 'group-1:ABC123');
});
