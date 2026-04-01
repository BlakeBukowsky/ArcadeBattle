import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import type { LobbyConfig } from '@arcade-battle/shared';
import { RECONNECT_TIMEOUT_SECONDS } from '@arcade-battle/shared';
import { initDatabase } from './db.js';
import { createAuthRouter } from './auth.js';
import { authMiddleware, UserSocketMap } from './middleware.js';
import { LobbyManager } from './lobby.js';
import { MatchManager } from './match.js';
import { gameRegistry } from './games/registry.js';

initDatabase();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.join(__dirname, '..', '..', 'client', 'dist');
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const IS_PROD = process.env.NODE_ENV === 'production';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: IS_PROD
    ? undefined // same origin, no CORS needed
    : { origin: CLIENT_URL, methods: ['GET', 'POST'] },
});

app.use('/auth', createAuthRouter());
io.use(authMiddleware);

const userSocketMap = new UserSocketMap();
const lobbyManager = new LobbyManager(userSocketMap);
const matchManager = new MatchManager(io, gameRegistry, userSocketMap);

// Grace period timers for reconnection
const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

io.on('connection', (socket) => {
  const userId = socket.data.userId;
  const displayName = socket.data.displayName;
  console.log(`Player connected: ${displayName} (${userId})`);

  userSocketMap.register(userId, socket.id);

  // Cancel any pending disconnect cleanup for this user (they reconnected)
  const pendingTimer = disconnectTimers.get(userId);
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    disconnectTimers.delete(userId);
    console.log(`Player reconnected: ${displayName} (${userId}) — cancelled disconnect`);

    // Re-join their lobby room if they were in one
    const lobbyId = lobbyManager.getPlayerLobby(userId);
    if (lobbyId) {
      socket.join(lobbyId);
      lobbyManager.emitStateToAll(lobbyId, io);
    }
  }

  // Send identity to client
  socket.emit('auth:identity', {
    id: userId,
    displayName: socket.data.displayName,
    avatarUrl: socket.data.avatarUrl,
    isGuest: socket.data.isGuest,
  });

  socket.on('lobby:create', (callback: (lobbyId: string) => void) => {
    const lobbyId = lobbyManager.createLobby(userId, displayName, socket.data.avatarUrl);
    socket.join(lobbyId);
    socket.emit('lobby:state', lobbyManager.getLobbyState(lobbyId, userId));
    callback(lobbyId);
  });

  socket.on('lobby:join', ({ lobbyId }: { lobbyId: string }) => {
    const result = lobbyManager.joinLobby(lobbyId, userId, displayName, socket.data.avatarUrl);
    if (!result.success) {
      socket.emit('lobby:error', { message: result.error });
      return;
    }
    socket.join(lobbyId);
    lobbyManager.emitStateToAll(lobbyId, io);
  });

  socket.on('lobby:leave', () => {
    const lobbyId = lobbyManager.leaveLobby(userId);
    if (lobbyId) {
      socket.leave(lobbyId);
      lobbyManager.emitStateToAll(lobbyId, io);
    }
  });

  socket.on('lobby:config', (update: Partial<LobbyConfig>) => {
    const lobbyId = lobbyManager.getPlayerLobby(userId);
    if (!lobbyId) return;
    if (!lobbyManager.isHost(lobbyId, userId)) return;
    lobbyManager.updateConfig(lobbyId, update);
    lobbyManager.emitStateToAll(lobbyId, io);
  });

  socket.on('lobby:ready', () => {
    const lobbyId = lobbyManager.getPlayerLobby(userId);
    if (!lobbyId) return;

    lobbyManager.setReady(lobbyId, userId);
    lobbyManager.emitStateToAll(lobbyId, io);

    if (lobbyManager.allReady(lobbyId)) {
      lobbyManager.startCountdown(lobbyId, io, () => {
        const config = lobbyManager.getConfig(lobbyId);
        if (!config) return;
        matchManager.startMatch(lobbyId, lobbyManager.getPlayerIds(lobbyId), config);
      });
    }
  });

  socket.on('lobby:unready', () => {
    const lobbyId = lobbyManager.getPlayerLobby(userId);
    if (!lobbyId) return;

    lobbyManager.setUnready(lobbyId, userId);
    lobbyManager.emitStateToAll(lobbyId, io);
  });

  socket.on('game:input', (data: unknown) => {
    matchManager.handleGameInput(userId, data);
  });

  socket.on('match:playAgain', () => {
    const lobbyId = lobbyManager.getPlayerLobby(userId);
    if (!lobbyId) return;

    lobbyManager.playerPlayAgain(lobbyId, userId);
    lobbyManager.emitStateToAll(lobbyId, io);

    if (lobbyManager.allReady(lobbyId)) {
      lobbyManager.startCountdown(lobbyId, io, () => {
        const config = lobbyManager.getConfig(lobbyId);
        if (!config) return;
        matchManager.startMatch(lobbyId, lobbyManager.getPlayerIds(lobbyId), config);
      });
    }
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${displayName} (${userId}) — grace period started`);

    // Don't immediately remove — give them time to reconnect
    const timer = setTimeout(() => {
      disconnectTimers.delete(userId);
      console.log(`Player timed out: ${displayName} (${userId}) — removing from lobby`);

      const lobbyId = lobbyManager.getPlayerLobby(userId);
      if (lobbyId) {
        matchManager.handleDisconnect(userId);
        lobbyManager.handleDisconnect(userId);
        lobbyManager.emitStateToAll(lobbyId, io);
      }
      userSocketMap.unregister(socket.id);
    }, RECONNECT_TIMEOUT_SECONDS * 1000);

    disconnectTimers.set(userId, timer);
  });
});

matchManager.onMatchEnd = (lobbyId: string) => {
  lobbyManager.enterPostMatch(lobbyId);
  lobbyManager.emitStateToAll(lobbyId, io);
};

// In production, serve the built client
if (IS_PROD) {
  app.use(express.static(CLIENT_DIST));
  app.get('{*path}', (_req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Arcade Battle server running on http://localhost:${PORT}`);
});
