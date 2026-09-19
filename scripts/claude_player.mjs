// Joins a Bomb Party lobby as "Claude". No dictionary: it only relays.
// It announces Claude's turns, and sends the word Claude writes to the word file
// ("<turnId> <word>", one line) — the words themselves are Claude's own choice.
// Usage: node scripts/claude_player.mjs <LOBBY_CODE> <WORD_FILE>
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(
  new URL('../apps/web/package.json', import.meta.url),
);
const { Client } = require('@colyseus/sdk');

const code = (process.argv[2] || '').toUpperCase().trim();
const wordFile = process.argv[3];
if (!code || !wordFile) {
  console.error(
    'Usage: node scripts/claude_player.mjs <LOBBY_CODE> <WORD_FILE>',
  );
  process.exit(1);
}
const serverUrl = process.env.VITE_SERVER_URL || 'http://127.0.0.1:2567';
writeFileSync(wordFile, '');

const room = await new Client(serverUrl)
  .joinById(code, { displayName: 'Claude', avatar: 5 })
  .catch((error) => {
    console.log(`JOIN_FAILED ${error.message ?? error}`);
    process.exit(1);
  });
console.log(`JOINED ${code}`);
room.send('ready', true);

let announcedTurn = -1;
let lastSent = '';
let lastEventTurn = -1;

// Send whatever Claude writes for the current turn.
setInterval(() => {
  if (!existsSync(wordFile)) return;
  const line = readFileSync(wordFile, 'utf8').trim();
  if (!line || line === lastSent) return;
  lastSent = line;
  const [turn, word] = line.split(/\s+/);
  if (!word) return;
  room.send('word', { word, turnId: Number(turn) });
}, 150);

room.onMessage('word-error', (error) => console.log(`WORD_ERROR ${error}`));
room.onMessage('action-error', (error) => console.log(`ACTION_ERROR ${error}`));

room.onStateChange((state) => {
  if (!state?.game) return;
  const game = state.game;
  if (state.phase === 'lobby') {
    const me = state.players.get(room.sessionId);
    if (me && !me.ready) room.send('ready', true);
    return;
  }
  if (state.phase === 'results') {
    if (announcedTurn !== -2) {
      announcedTurn = -2;
      const winner = state.players.get(game.winnerId);
      console.log(`GAME_OVER winner=${winner?.displayName ?? 'nobody'}`);
    }
    return;
  }
  if (state.phase !== 'playing') return;
  if (game.turnId !== lastEventTurn && game.lastEvent) {
    lastEventTurn = game.turnId;
    const who = state.players.get(game.lastPlayerId)?.displayName ?? '?';
    console.log(
      game.lastEvent === 'exploded'
        ? `BOOM on ${who}`
        : `ACCEPTED ${who}: ${game.lastWord}`,
    );
  }
  if (game.activePlayerId === room.sessionId && game.turnId !== announcedTurn) {
    announcedTurn = game.turnId;
    const me = game.players.get(room.sessionId);
    console.log(
      `MY_TURN turn=${game.turnId} prompt=${game.prompt.toUpperCase()} lives=${me?.lives}`,
    );
  }
});

room.onLeave((reason) => {
  console.log(`LEFT ${reason}`);
  process.exit(0);
});
