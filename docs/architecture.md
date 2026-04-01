# Architecture Guide

## Overview

Arcade Battle uses a **server-authoritative** architecture. All game logic runs on the server — clients send inputs and render the state they receive. This prevents cheating and ensures both players see consistent game state.

```
┌─────────────┐     WebSocket      ┌─────────────────┐     WebSocket      ┌─────────────┐
│   Player 1  │ ◄────────────────► │     Server      │ ◄────────────────► │   Player 2  │
│  (React UI) │   inputs / state   │ (Node+Socket.IO)│   inputs / state   │  (React UI) │
└─────────────┘                    └─────────────────┘                    └─────────────┘
```

## Packages

The project is a monorepo with three npm workspace packages:

### `shared/`

Shared TypeScript types and constants used by both client and server. This is the contract between the two — any interface change starts here.

Key exports:
- **`LobbyState`** — Current lobby info (players, ready state, config)
- **`LobbyConfig`** — Match settings (pointsToWin, gameSetId)
- **`TransitionData`** — Data for between-round screen (game name, scores, prev result)
- **`MatchEndData`** — Final match result (winner, scores, round history)
- **`ServerGameModule`** / **`GameInstance`** — Server-side game plugin interface
- **`GameInfo`** — Game metadata (id, name, description, maxDuration)
- **`MatchContext`** — API given to game instances for communication
- **`GameSet`** — Named collection of games

### `server/`

The game server. Handles lobbies, match orchestration, and all game logic.

Key modules:
- **`index.ts`** — Express + Socket.IO setup, socket event routing
- **`lobby.ts`** — `LobbyManager` class: create/join/ready/config/disconnect
- **`match.ts`** — `MatchManager` class: game selection, round lifecycle, scoring
- **`games/`** — Individual game modules + registry

### `client/`

The React frontend. Renders UI and game visuals, sends player inputs to server.

Key modules:
- **`context/SocketContext.tsx`** — Provides the Socket.IO connection to all components
- **`context/GameContext.tsx`** — Global UI state: current screen, lobby state, match data
- **`screens/`** — One component per screen in the app flow
- **`games/`** — Client-side game renderers + registry

## Data Flow

### Lobby Flow

```
Player 1                    Server                     Player 2
   │                          │                           │
   ├── lobby:create ─────────►│                           │
   │◄── lobby:state ──────────┤                           │
   │                          │◄── lobby:join ────────────┤
   │◄── lobby:state ──────────┤── lobby:state ───────────►│
   │                          │                           │
   ├── lobby:config ─────────►│  (host only)              │
   │◄── lobby:state ──────────┤── lobby:state ───────────►│
   │                          │                           │
   ├── lobby:ready ──────────►│                           │
   │                          │◄── lobby:ready ───────────┤
   │◄── lobby:state ──────────┤── lobby:state ───────────►│
   │   (countdown ticks)      │   (countdown ticks)       │
   │◄── lobby:state ──────────┤── lobby:state ───────────►│
   │   (status: playing)      │   (status: playing)       │
```

### Match Flow

```
                        Server
                          │
    match:start ──────────┤──────────► (to both)
                          │
  ┌─loop per round────────┤
  │ match:transition ─────┤──────────► (game name, scores, prev result)
  │   (TRANSITION_SECONDS) │
  │ match:roundStart ─────┤──────────► (gameId)
  │                       │
  │ game:state ◄──────────┤──────────► (tick loop, ~30-60fps)
  │ game:input ──────────►│◄────────── (player inputs)
  │                       │
  │ (game calls endRound) │
  └───────────────────────┤
                          │
    match:end ────────────┤──────────► (winner, final scores, history)
```

### Game Tick Cycle (During a Round)

```
1. Client captures input (keydown, click, etc.)
2. Client emits game:input with input data
3. Server game instance processes input in onPlayerInput()
4. Server game loop updates state (physics, collision, scoring)
5. Server emits game:state to both players
6. Client receives state and renders it
7. Repeat at tick rate (60fps for Pong, 30fps for Aim Trainer)
```

## State Management

### Server State

- **`LobbyManager`** — Map of `lobbyId → Lobby` and `playerId → lobbyId`
  - Owns lobby lifecycle, player tracking, ready state, config, countdown timers

- **`MatchManager`** — Map of `lobbyId → ActiveMatch` and `playerId → lobbyId`
  - Owns match state: round counter, scores, game order, active game instance
  - Cleans up its maps when match ends; lobby maps persist

- **`GameRegistry`** — Map of `gameId → ServerGameModule` and `setId → GameSet`
  - Static after startup, stores all registered games and game sets

### Client State

- **`SocketContext`** — Single Socket.IO connection, created once at app startup
- **`GameContext`** — All UI state in one context:
  - `screen` — Which screen to show (`home`, `lobby`, `lobbyNotFound`, `transition`, `playing`, `gameOver`)
  - `lobbyState` — Latest lobby state from server
  - `transitionData` — Current transition screen data
  - `currentGameId` — Active game being played
  - `matchEndData` — Match results for game-over screen
  - `lobbyError` — Error message for lobby-not-found screen
  - `resetMatchState()` — Clears all match data when returning to lobby

## Socket.IO Events Reference

### Lobby Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `lobby:create` | C→S | callback(lobbyId) | Create new lobby, returns ID |
| `lobby:join` | C→S | `{ lobbyId }` | Join existing lobby |
| `lobby:config` | C→S | `Partial<LobbyConfig>` | Host updates settings |
| `lobby:ready` | C→S | — | Toggle ready state on |
| `lobby:unready` | C→S | — | Toggle ready state off |
| `lobby:state` | S→C | `LobbyState` | Full lobby state update |
| `lobby:error` | S→C | `{ message }` | Lobby join error |

### Match Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `match:start` | S→C | `{ pointsToWin }` | Match is starting |
| `match:transition` | S→C | `TransitionData` | Show next game + scores |
| `match:roundStart` | S→C | `{ gameId }` | Begin playing the game |
| `match:end` | S→C | `MatchEndData` | Match is over |
| `match:playAgain` | C→S | — | Return to lobby |

### Game Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `game:state` | S→C | game-specific | Server pushes game state |
| `game:input` | C→S | game-specific | Player sends input |

## Lobby Configuration

The lobby host can configure:

- **Points to Win** (1-5): How many round wins needed to win the match
- **Game Set**: Which pool of games to draw from (currently only "All Games")

Config changes are sent via `lobby:config` and only accepted from the host (verified server-side). The config is stored in the lobby and passed to `MatchManager` when the match starts.

## Game Sets

Game sets define pools of games that can be selected for a match. Each set has:

```typescript
interface GameSet {
  id: string;          // e.g., 'all', 'action', 'speed'
  name: string;        // Display name
  description: string; // Shown in lobby
  gameIds: string[];   // List of game IDs; empty = all games
}
```

Sets are registered in `server/src/games/registry.ts`. When a match starts, the server picks games from the selected set, shuffles them, and assigns enough for the maximum possible rounds.

## Screen Flow

```
HomeScreen
  └─► LobbyScreen (create or join)
       └─► LobbyNotFoundScreen (if invalid link)
       └─► [Countdown]
            └─► TransitionScreen (shows prev result + next game)
                 └─► PlayingScreen (renders active game)
                      └─► TransitionScreen (loop until winner)
                           └─► GameOverScreen
                                └─► LobbyScreen (play again)
```

## Error Handling

- **Lobby not found / full**: Server emits `lobby:error`, client shows `LobbyNotFoundScreen`
- **Player disconnect mid-game**: Opponent wins the current round immediately; if that clinches the match, match ends. The disconnected player is removed from the lobby.
- **Player disconnect in lobby**: Player is removed, lobby reverts to waiting state
- **Countdown cancel**: If a player un-readies during countdown, it cancels and resets
