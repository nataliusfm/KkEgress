import { Server } from 'socket.io';
import { verifySession } from './auth.js';
import { db } from './store.js';

let io = null;

/** Attach a Socket.IO server to the HTTP server with JWT auth. */
export function initRealtime(httpServer) {
  io = new Server(httpServer, { cors: { origin: true, credentials: true } });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const claims = token && verifySession(token);
    if (!claims) return next(new Error('unauthorized'));
    socket.user = claims;
    next();
  });

  io.on('connection', (socket) => {
    // Teachers broadcast live GPS during an active drill.
    socket.on('gps:update', (pos) => {
      const drill = db.activeDrill();
      if (!drill) return;
      emitToAll('gps:update', {
        userId: socket.user.sub,
        name: socket.user.name,
        lat: pos.lat,
        lng: pos.lng,
        accuracy: pos.accuracy,
        ts: new Date().toISOString(),
      });
    });
  });

  return io;
}

export function getIO() {
  return io;
}

/** Broadcast an event to every connected client. */
export function emitToAll(event, payload) {
  if (io) io.emit(event, payload);
}
