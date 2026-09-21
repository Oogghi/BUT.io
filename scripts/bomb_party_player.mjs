import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import readline from 'node:readline';

const require = createRequire(
  new URL('../apps/web/package.json', import.meta.url),
);
const { Client } = require('@colyseus/sdk');

const mode = process.env.BOMB_PARTY_PLAYER_MODE || 'ai';
const anonymous = mode === 'anonyme';
const claude = mode === 'claude';
const code = (process.argv[2] || (anonymous ? '9FRC9S' : ''))
  .toUpperCase()
  .trim();
const name = anonymous
  ? 'Anonyme 🤫🫆'
  : claude
    ? 'Claude'
    : process.argv[3] || 'Antigravity 🧠';
const wordFile = anonymous || claude ? process.argv[3] : process.argv[4];
const avatar = anonymous ? 4 : claude ? 5 : 2;

if (!code || (claude && !wordFile)) {
  const usage = claude
    ? 'Usage: node scripts/claude_player.mjs <LOBBY_CODE> <WORD_FILE>'
    : anonymous
      ? 'Usage: node scripts/anonyme_player.mjs [LOBBY_CODE] [WORD_FILE]'
      : 'Usage: node scripts/ai_player.mjs <LOBBY_CODE> [NAME] [WORD_FILE]';
  console.error(usage);
  process.exit(1);
}

if (wordFile) writeFileSync(wordFile, '');

const serverUrl = process.env.VITE_SERVER_URL || 'http://127.0.0.1:2567';
console.log(`Connecting to ${serverUrl} room ${code} as "${name}"...`);

const client = new Client(serverUrl);
let room;
try {
  const options = { displayName: name, avatar };
  room =
    code === 'CREATE' && !anonymous && !claude
      ? await client.create('bomb-party', options)
      : await client.joinById(code, options);
  room.reconnection.enabled = false;
} catch (error) {
  console.error(`JOIN_FAILED: ${error.message ?? error}`);
  process.exit(1);
}

console.log(`JOINED ${room.roomId} as ${name} (session: ${room.sessionId})`);
if (code === 'CREATE')
  console.log(`LOBBY_URL: http://127.0.0.1:5173/lobby/${room.roomId}`);
if (anonymous || claude) room.send('ready', true);

function sendWord(line) {
  const [turn, word] = line.trim().split(/\s+/);
  if (!word) return;
  room.send('word', { word, turnId: Number(turn) });
  console.log(`SENT word: "${word}" for turn ${turn}`);
}

if (!claude) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (trimmed === 'start' && !anonymous) {
      room.send('start-game');
      console.log('SENT start-game');
    } else if (trimmed === 'ready') {
      room.send('ready', true);
      console.log('SENT ready');
    } else {
      sendWord(trimmed);
    }
  });
}

let lastSent = '';
if (wordFile) {
  setInterval(
    () => {
      if (!existsSync(wordFile)) return;
      const line = readFileSync(wordFile, 'utf8').trim();
      if (!line || line === lastSent) return;
      lastSent = line;
      sendWord(line);
    },
    claude ? 150 : 100,
  );
}

let announcedTurn = -1;
let lastEventTurn = -1;
room.onMessage('word-error', (error) => console.log(`WORD_ERROR ${error}`));
room.onMessage('action-error', (error) => console.log(`ACTION_ERROR ${error}`));

room.onStateChange((state) => {
  if (!state?.game) return;
  const game = state.game;

  if (state.phase === 'lobby') {
    const me = state.players.get(room.sessionId);
    if (
      me &&
      !me.ready &&
      (anonymous || claude || state.hostId !== room.sessionId)
    ) {
      room.send('ready', true);
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
        : `ACCEPTED ${who}: ${game.lastWord}`,
    );
  }

  if (game.activePlayerId === room.sessionId && game.turnId !== announcedTurn) {
    announcedTurn = game.turnId;
    const me = game.players.get(room.sessionId);
    console.log(
      `MY_TURN turn=${game.turnId} prompt=${game.prompt.toUpperCase()} lives=${me?.lives}`,
    );
  } else if (
    anonymous &&
    game.activePlayerId !== room.sessionId &&
    game.turnId !== announcedTurn
  ) {
    announcedTurn = game.turnId;
    const active = state.players.get(game.activePlayerId)?.displayName ?? '?';
    console.log(
      `OTHER_TURN turn=${game.turnId} player=${active} prompt=${game.prompt.toUpperCase()}`,
    );
  }
});

room.onLeave((reason) => {
  console.log(`LEFT ${reason}`);
  process.exit(0);
});
