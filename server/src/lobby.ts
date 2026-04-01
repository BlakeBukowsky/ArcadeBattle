import { nanoid } from 'nanoid';
import type { Server } from 'socket.io';
import type { LobbyState, Player, LobbyConfig } from '@arcade-battle/shared';
import { LOBBY_COUNTDOWN_SECONDS, DEFAULT_POINTS_TO_WIN, DEFAULT_GAME_SET_ID } from '@arcade-battle/shared';
import type { UserSocketMap } from './middleware.js';

interface InternalPlayer extends Player {
  // Player interface already has id, displayName, avatarUrl?, status
}

interface Lobby {
  id: string;
  hostId: string;
  players: InternalPlayer[];
  status: 'waiting' | 'countdown' | 'playing' | 'finished';
  countdownTimer?: ReturnType<typeof setInterval>;
  countdown?: number;
  config: LobbyConfig;
}

export class LobbyManager {
  private lobbies = new Map<string, Lobby>();
  private playerToLobby = new Map<string, string>();
  private userSocketMap: UserSocketMap;

  constructor(userSocketMap: UserSocketMap) {
    this.userSocketMap = userSocketMap;
  }

  createLobby(userId: string, displayName: string, avatarUrl?: string): string {
    const lobbyId = nanoid(8);
    const lobby: Lobby = {
      id: lobbyId,
      hostId: userId,
      players: [{ id: userId, displayName, avatarUrl, status: 'notReady' }],
      status: 'waiting',
      config: {
        pointsToWin: DEFAULT_POINTS_TO_WIN,
        gameSetId: DEFAULT_GAME_SET_ID,
      },
    };
    this.lobbies.set(lobbyId, lobby);
    this.playerToLobby.set(userId, lobbyId);
    return lobbyId;
  }

  joinLobby(lobbyId: string, userId: string, displayName: string, avatarUrl?: string): { success: boolean; error?: string } {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return { success: false, error: 'Lobby not found' };
    if (lobby.players.some((p) => p.id === userId)) return { success: true };
    if (lobby.players.length >= 2) return { success: false, error: 'Lobby is full' };

    lobby.players.push({ id: userId, displayName, avatarUrl, status: 'notReady' });
    this.playerToLobby.set(userId, lobbyId);
    return { success: true };
  }

  getPlayerLobby(userId: string): string | undefined {
    return this.playerToLobby.get(userId);
  }

  getLobbyState(lobbyId: string, forUserId?: string): LobbyState | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return null;
    return {
      lobbyId: lobby.id,
      players: lobby.players,
      status: lobby.status,
      countdown: lobby.countdown,
      config: lobby.config,
      isHost: forUserId === lobby.hostId,
    };
  }

  getConfig(lobbyId: string): LobbyConfig | null {
    return this.lobbies.get(lobbyId)?.config ?? null;
  }

  getPlayerIds(lobbyId: string): [string, string] {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.players.length < 2) throw new Error('Not enough players');
    return [lobby.players[0].id, lobby.players[1].id];
  }

  isHost(lobbyId: string, userId: string): boolean {
    return this.lobbies.get(lobbyId)?.hostId === userId;
  }

  updateConfig(lobbyId: string, update: Partial<LobbyConfig>): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
    Object.assign(lobby.config, update);
  }

  setReady(lobbyId: string, userId: string): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
    const player = lobby.players.find((p) => p.id === userId);
    if (player) player.status = 'ready';
  }

  setUnready(lobbyId: string, userId: string): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
    if (lobby.status === 'countdown') {
      this.cancelCountdown(lobbyId);
    }
    const player = lobby.players.find((p) => p.id === userId);
    if (player) player.status = 'notReady';
  }

  allReady(lobbyId: string): boolean {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.players.length < 2) return false;
    return lobby.players.every((p) => p.status === 'ready');
  }

  setStatus(lobbyId: string, status: Lobby['status']): void {
    const lobby = this.lobbies.get(lobbyId);
    if (lobby) lobby.status = status;
  }

  enterPostMatch(lobbyId: string): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
    lobby.status = 'waiting';
    lobby.countdown = undefined;
    lobby.players.forEach((p) => (p.status = 'endScreen'));
  }

  playerPlayAgain(lobbyId: string, userId: string): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
    const player = lobby.players.find((p) => p.id === userId);
    if (player) player.status = 'ready';
  }

  startCountdown(lobbyId: string, io: Server, onComplete: () => void): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;

    lobby.status = 'countdown';
    lobby.countdown = LOBBY_COUNTDOWN_SECONDS;
    this.emitStateToAll(lobbyId, io);

    lobby.countdownTimer = setInterval(() => {
      lobby.countdown!--;
      if (lobby.countdown! <= 0) {
        clearInterval(lobby.countdownTimer);
        lobby.countdownTimer = undefined;
        lobby.status = 'playing';
        this.emitStateToAll(lobbyId, io);
        onComplete();
      } else {
        this.emitStateToAll(lobbyId, io);
      }
    }, 1000);
  }

  private cancelCountdown(lobbyId: string): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
    if (lobby.countdownTimer) {
      clearInterval(lobby.countdownTimer);
      lobby.countdownTimer = undefined;
    }
    lobby.status = 'waiting';
    lobby.countdown = undefined;
  }

  emitStateToAll(lobbyId: string, io: Server): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
    for (const player of lobby.players) {
      const socketId = this.userSocketMap.getSocketId(player.id);
      if (socketId) {
        io.to(socketId).emit('lobby:state', this.getLobbyState(lobbyId, player.id));
      }
    }
  }

  handleDisconnect(userId: string): void {
    const lobbyId = this.playerToLobby.get(userId);
    if (!lobbyId) return;
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;

    this.cancelCountdown(lobbyId);
    lobby.players = lobby.players.filter((p) => p.id !== userId);
    lobby.status = 'waiting';
    this.playerToLobby.delete(userId);

    if (lobby.players.length === 0) {
      this.lobbies.delete(lobbyId);
    }
  }

  leaveLobby(userId: string): string | undefined {
    const lobbyId = this.playerToLobby.get(userId);
    if (!lobbyId) return undefined;
    this.handleDisconnect(userId);
    return lobbyId;
  }
}
