import type { Server } from 'socket.io';
import type {
  MatchContext,
  MatchScore,
  RoundResult,
  GameInstance,
  ServerGameModule,
  TransitionData,
  LobbyConfig,
  GameSet,
} from '@arcade-battle/shared';
import { TRANSITION_SECONDS } from '@arcade-battle/shared';
import type { UserSocketMap } from './middleware.js';
import { createOptimizedEmitter } from './net-optimizer.js';

interface GameRegistry {
  getAll(): ServerGameModule[];
  get(id: string): ServerGameModule | undefined;
  getGameSets(): GameSet[];
  getGamesForSet(setId: string): ServerGameModule[];
}

const MIN_ROUND_DURATION = 500; // ms — prevent instant round endings from first-tick collisions

interface ActiveMatch {
  lobbyId: string;
  players: [string, string];
  pointsToWin: number;
  currentRound: number;
  score: MatchScore;
  rounds: RoundResult[];
  gameOrder: string[];
  currentGame: GameInstance | null;
  emitterCleanup: (() => void) | null;
  roundStartTime: number;
}

export class MatchManager {
  private io: Server;
  private registry: GameRegistry;
  private matches = new Map<string, ActiveMatch>();
  private playerToLobby = new Map<string, string>();
  public onMatchEnd?: (lobbyId: string, match: { players: [string, string]; score: MatchScore; rounds: RoundResult[]; winnerId: string }) => void;

  private userSocketMap: UserSocketMap;

  constructor(io: Server, registry: GameRegistry, userSocketMap: UserSocketMap) {
    this.io = io;
    this.registry = registry;
    this.userSocketMap = userSocketMap;
  }

  startMatch(lobbyId: string, players: [string, string], config: LobbyConfig): void {
    const games = this.registry.getGamesForSet(config.gameSetId);
    // Shuffle and pick enough games. If we run out, reshuffle (unlikely with pointsToWin <= 5).
    const needed = config.pointsToWin * 2 - 1; // max possible rounds
    const gameOrder: string[] = [];
    while (gameOrder.length < needed) {
      const shuffled = [...games].sort(() => Math.random() - 0.5);
      for (const g of shuffled) {
        if (gameOrder.length >= needed) break;
        gameOrder.push(g.info.id);
      }
    }

    const score: MatchScore = {};
    score[players[0]] = 0;
    score[players[1]] = 0;

    const match: ActiveMatch = {
      lobbyId,
      players,
      pointsToWin: config.pointsToWin,
      currentRound: 0,
      score,
      rounds: [],
      gameOrder,
      currentGame: null,
      emitterCleanup: null,
      roundStartTime: 0,
    };

    this.matches.set(lobbyId, match);
    this.playerToLobby.set(players[0], lobbyId);
    this.playerToLobby.set(players[1], lobbyId);

    this.io.to(lobbyId).emit('match:start', {
      pointsToWin: config.pointsToWin,
    });

    this.startTransition(match, undefined);
  }

  private startTransition(match: ActiveMatch, prevRoundWinner: string | undefined): void {
    const gameId = match.gameOrder[match.currentRound];
    const gameModule = this.registry.get(gameId);
    if (!gameModule) return;

    const totalRounds = match.pointsToWin * 2 - 1;

    const data: TransitionData = {
      gameId,
      gameName: gameModule.info.name,
      description: gameModule.info.description,
      controls: gameModule.info.controls,
      score: match.score,
      round: match.currentRound + 1,
      totalRounds,
      prevRoundWinner,
    };

    this.io.to(match.lobbyId).emit('match:transition', data);

    setTimeout(() => {
      this.startRound(match);
    }, TRANSITION_SECONDS * 1000);
  }

  private startRound(match: ActiveMatch): void {
    const gameId = match.gameOrder[match.currentRound];
    const gameModule = this.registry.get(gameId);
    if (!gameModule) return;

    // Wrap emit with network optimizer (send rate throttling + delta compression)
    const rawEmit = (event: string, data: unknown) => {
      this.io.to(match.lobbyId).emit(event, data);
    };
    const optimized = createOptimizedEmitter(rawEmit);
    match.emitterCleanup = optimized.cleanup;

    const ctx: MatchContext = {
      players: match.players,
      emit: optimized.emit,
      emitTo: (userId: string, event: string, data: unknown) => {
        const socketId = this.userSocketMap.getSocketId(userId);
        if (socketId) this.io.to(socketId).emit(event, data);
      },
      endRound: (winnerId: string) => {
        this.endRound(match, winnerId);
      },
    };

    match.roundStartTime = Date.now();
    match.currentGame = gameModule.create(ctx);
    this.io.to(match.lobbyId).emit('match:roundStart', { gameId });
  }

  private endRound(match: ActiveMatch, winnerId: string): void {
    // Guard against double-call or stale match
    if (!match.currentGame && !match.emitterCleanup) return;
    if (!this.matches.has(match.lobbyId)) return; // match already cleaned up

    // (MIN_ROUND_DURATION guard removed — caused deferred endRound calls to kill subsequent rounds)

    if (match.emitterCleanup) {
      match.emitterCleanup();
      match.emitterCleanup = null;
    }
    if (match.currentGame) {
      match.currentGame.cleanup();
      match.currentGame = null;
    }

    const gameId = match.gameOrder[match.currentRound];
    const gameModule = this.registry.get(gameId);

    match.score[winnerId]++;
    const result: RoundResult = {
      gameId,
      gameName: gameModule?.info.name ?? gameId,
      winnerId,
    };
    match.rounds.push(result);

    // Check for match winner
    if (match.score[winnerId] >= match.pointsToWin) {
      this.io.to(match.lobbyId).emit('match:end', {
        winnerId,
        finalScore: match.score,
        rounds: match.rounds,
      });
      this.cleanup(match);
      this.onMatchEnd?.(match.lobbyId, { players: match.players, score: match.score, rounds: match.rounds, winnerId });
      return;
    }

    match.currentRound++;
    // Go directly to next transition (which shows prev round result)
    this.startTransition(match, winnerId);
  }

  private cleanup(match: ActiveMatch): void {
    this.matches.delete(match.lobbyId);
    this.playerToLobby.delete(match.players[0]);
    this.playerToLobby.delete(match.players[1]);
  }

  /** Resync a reconnected player — send them current game state + roundStart */
  resyncPlayer(playerId: string, socketId: string): void {
    const lobbyId = this.playerToLobby.get(playerId);
    if (!lobbyId) return;
    const match = this.matches.get(lobbyId);
    if (!match || !match.currentGame) return;

    const gameId = match.gameOrder[match.currentRound];
    // Re-send roundStart so the client switches to the playing screen
    this.io.to(socketId).emit('match:roundStart', { gameId });
    // Send current full game state directly to this player
    const state = match.currentGame.getState();
    this.io.to(socketId).emit('game:state', { _full: true, ...(state as Record<string, unknown>) });
  }

  handleGameInput(playerId: string, data: unknown): void {
    const lobbyId = this.playerToLobby.get(playerId);
    if (!lobbyId) return;
    const match = this.matches.get(lobbyId);
    if (!match || !match.currentGame) return;
    match.currentGame.onPlayerInput(playerId, data);
  }

  handleDisconnect(playerId: string): void {
    const lobbyId = this.playerToLobby.get(playerId);
    if (!lobbyId) return;
    const match = this.matches.get(lobbyId);
    if (!match) return;

    const opponent = match.players.find((p) => p !== playerId);
    if (opponent && match.currentGame) {
      this.endRound(match, opponent);
    }
  }
}
