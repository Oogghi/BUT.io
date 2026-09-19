import { startServer } from './server.js';

const port = Number(process.env.PORT ?? 2567);
const server = await startServer(port);
const address = server.transport.server?.address();
const actualPort = typeof address === 'object' && address ? address.port : port;
console.log(`Colyseus server listening on ws://127.0.0.1:${actualPort}`);
