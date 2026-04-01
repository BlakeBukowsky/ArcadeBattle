// ── Game Sets ──

export interface GameSet {
  id: string;
  name: string;
  description: string;
  gameIds: string[]; // empty = all games
}

// ── Lobby Config ──

export interface LobbyConfig {
  pointsToWin: number;
  gameSetId: string;
}

// ── Auth ──

export interface AuthUser {
  id: string;
  displayName: string;
  avatarUrl?: string;
  isGuest: boolean;
}

// ── Player & Lobby ──

export type PlayerStatus = 'notReady' | 'ready' | 'endScreen';

export interface Player {
  id: string;
  displayName: string;
  avatarUrl?: string;
  status: PlayerStatus;
}

export interface LobbyState {
  lobbyId: string;
  players: Player[];
  status: 'waiting' | 'countdown' | 'playing' | 'finished';
  countdown?: number;
  config: LobbyConfig;
  isHost: boolean; // per-player: true for lobby creator
}

// ── Match ──

export interface RoundResult {
  gameId: string;
  gameName: string;
  winnerId: string;
}

export interface MatchScore {
  [playerId: string]: number;
}

export interface MatchEndData {
  winnerId: string;
  finalScore: MatchScore;
  rounds: RoundResult[];
}

// ── Game Plugin (Client) ──

export interface GameInfo {
  id: string;
  name: string;
  description: string;
  maxDuration: number; // seconds
}

// ── Game Plugin (Server) ──

export interface MatchContext {
  players: [string, string];
  emit(event: string, data: unknown): void;
  emitTo(playerId: string, event: string, data: unknown): void;
  endRound(winnerId: string): void;
}

export interface GameInstance {
  onPlayerInput(playerId: string, data: unknown): void;
  getState(): unknown;
  cleanup(): void;
}

export interface ServerGameModule {
  info: GameInfo;
  create(ctx: MatchContext): GameInstance;
}

// ── Socket Events ──

export interface TransitionData {
  gameId: string;
  gameName: string;
  description: string;
  score: MatchScore;
  round: number;
  totalRounds: number;
  prevRoundWinner?: string; // undefined on first round
}

export interface RoundStartData {
  gameId: string;
}

export interface RoundEndData {
  winnerId: string;
  score: MatchScore;
}
