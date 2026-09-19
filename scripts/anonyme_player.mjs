import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import readline from 'node:readline';

const require = createRequire(
  new URL('../apps/web/package.json', import.meta.url),
);
const { Client } = require('@colyseus/sdk');

const code = (process.argv[2] || '9FRC9S').toUpperCase().trim();
const wordFile = process.argv[3] || 'word_pipe.txt';

const displayName = 'Anonyme 🤫🫆';
const serverUrl = process.env.VITE_SERVER_URL || 'http://127.0.0.1:2567';

writeFileSync(wordFile, '');

console.log(`Connecting to ${serverUrl} room ${code} as "${displayName}"...`);

const client = new Client(serverUrl);
let room;
try {
  room = await client.joinById(code, { displayName, avatar: 4 });
  room.reconnection.enabled = false;
} catch (error) {
  console.error(`JOIN_FAILED: ${error.message ?? error}`);
  process.exit(1);
}

console.log(`JOINED ${code} as ${displayName} (session: ${room.sessionId})`);
room.send('ready', true);
console.log('SENT ready: true');

// Stdin listener
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  if (trimmed === 'ready') {
    room.send('ready', true);
    console.log('SENT ready');
  } else {
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      const turnId = Number(parts[0]);
      const word = parts[1];
      room.send('word', { word, turnId });
      console.log(`SENT word: "${word}" for turn ${turnId}`);
    }
  }
});

// File listener
let lastSent = '';
setInterval(() => {
  if (!existsSync(wordFile)) return;
  const line = readFileSync(wordFile, 'utf8').trim();
  if (!line || line === lastSent) return;
  lastSent = line;
  const [turn, word] = line.split(/\s+/);
  if (!word) return;
  room.send('word', { word, turnId: Number(turn) });
  console.log(`SENT_FROM_FILE word: "${word}" for turn ${turn}`);
}, 100);

let announcedTurn = -1;
let lastEventTurn = -1;

room.onMessage('word-error', (error) => console.log(`WORD_ERROR ${error}`));
room.onMessage('action-error', (error) => console.log(`ACTION_ERROR ${error}`));

room.onStateChange((state) => {
  if (!state?.game) return;
  const game = state.game;

  if (state.phase === 'lobby') {
    const me = state.players.get(room.sessionId);
    if (me && !me.ready) {
      room.send('ready', true);
      console.log('AUTO_READY in lobby');
    }
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
        : `ACCEPTED ${who}: ${game.lastWord}`
    );
  }

  if (game.activePlayerId === room.sessionId && game.turnId !== announcedTurn) {
    announcedTurn = game.turnId;
    const me = game.players.get(room.sessionId);
    console.log(
      `>>> MY_TURN turn=${game.turnId} prompt=${game.prompt.toUpperCase()} lives=${me?.lives} <<<`
    );
  } else if (game.activePlayerId !== room.sessionId && game.turnId !== announcedTurn) {
    announcedTurn = game.turnId;
    const active = state.players.get(game.activePlayerId)?.displayName ?? '?';
    console.log(
      `OTHER_TURN turn=${game.turnId} player=${active} prompt=${game.prompt.toUpperCase()}`
    );
  }
});

room.onLeave((reason) => {
  console.log(`LEFT ${reason}`);
  process.exit(0);
});
