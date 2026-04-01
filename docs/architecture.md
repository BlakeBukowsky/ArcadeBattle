# Architecture Guide

## Overview

Arcade Battle uses a **server-authoritative** architecture. All game logic runs on the server — clients send inputs and render the state they receive. This prevents cheating and ensures both players see consistent game state.

```
┌─────────────┐     WebSocket      ┌─────────────────┐     WebSocket      ┌─────────────┐
│   Player 1  │ ◄────────────────► │     Server      │ ◄────────────────► │   Player 2  │
│  (React UI) │   inputs / state   │ (Node+Socket.IO)│   inputs / state   │  (React UI) │
└─────────────┘                    │     SQLite DB   │                    └─────────────┘
                                   └─────────────────┘
```

## Packages

The project is a monorepo with three npm workspace packages:

### `shared/`

Shared TypeScript types and constants used by both client and server. This is the contract between the two — any interface change starts here.

Key exports:
- **`AuthUser`** — Authenticated or guest user identity (id, displayName, avatarUrl, isGuest)
- **`Player`** — Player in a lobby (id, displayName, avatarUrl, status)
- **`LobbyState`** / **`LobbyConfig`** — Lobby info and configurable settings
- **`TransitionData`** — Between-round screen data (game name, scores, prev result)
- **`MatchEndData`** — Final match result (winner, scores, round history)
- **`ServerGameModule`** / **`GameInstance`** / **`MatchContext`** — Game plugin interfaces
- **`GameInfo`** — Game metadata (id, name, description, maxDuration)
- **`GameSet`** — Named collection of games for lobby configuration

### `server/`

The game server. Handles auth, lobbies, match orchestration, and all game logic.

Key modules:
- **`index.ts`** — Express + Socket.IO setup, socket event routing, static file serving in production
- **`db.ts`** — SQLite database init, user CRUD (find, create, update), OAuth account linking
- **`auth.ts`** — Express router: OAuth flows (Google, Discord), JWT sign/verify, `/auth/me`, `/auth/profile`, avatar upload
- **`middleware.ts`** — Socket.IO auth middleware (JWT → user, or guest fallback), `UserSocketMap` class
- **`lobby.ts`** — `LobbyManager` class: create/join/ready/config/disconnect, reconnection support
- **`match.ts`** — `MatchManager` class: game selection, round lifecycle, scoring. Wraps game emit with network optimizer.
- **`net-optimizer.ts`** — Send rate throttling (60fps physics → 20fps network) and delta compression. Transparent layer between game logic and Socket.IO.
- **`games/`** — 13 game modules + registry + game sets

### `client/`

The React frontend. Renders UI and game visuals, sends player inputs to server.

Key modules:
- **`context/AuthContext.tsx`** — OAuth login (popup flow), JWT storage, profile updates, avatar upload
- **`context/SocketContext.tsx`** — Socket.IO connection with auth token, guest ID persistence
- **`context/GameContext.tsx`** — UI state: current screen, lobby state, match data
- **`screens/`** — Home, Profile, Lobby, LobbyNotFound, Transition, Playing, GameOver
- **`games/`** — 13 client-side game renderers + registry
- **`lib/sprites.ts`** — Sprite and background rendering system with skin support
- **`lib/prediction.ts`** — Client-side input prediction (PositionPredictor, StateInterpolator)
- **`lib/net.ts`** — Delta state merging for network-optimized updates

## Authentication

### Identity Model

Players have two identity types:

- **Authenticated users** — Signed in via Google or Discord OAuth. Have a persistent `userId` stored in SQLite, customizable display name and avatar. Only one OAuth provider required; the other can be linked later.
- **Guests** — No sign-in required. Get a temporary `guest_xxxx` ID and auto-generated name ("Guest 1234"). Guest IDs persist within a browser session via `sessionStorage` to survive Socket.IO reconnects.

### OAuth Flow

```
1. User clicks "Sign in with Google/Discord" on HomeScreen
2. AuthContext opens a popup to /auth/google (or /auth/discord)
3. Server redirects popup to OAuth provider consent screen
4. Provider redirects back to /auth/google/callback with auth code
5. Server exchanges code for tokens, fetches profile
6. Server finds or creates user in SQLite, signs a JWT
7. Callback HTML sends JWT to opener via window.postMessage()
8. AuthContext receives token, stores in localStorage, fetches /auth/me
9. SocketContext reconnects with the JWT in auth handshake
10. Socket.IO middleware validates JWT, attaches userId to socket.data
```

### Profile

Authenticated users can update their display name and avatar URL via the Profile screen. The `PUT /auth/profile` endpoint validates and persists changes to SQLite.

### Socket.IO Auth Middleware

Every socket connection goes through `authMiddleware`:
- **With JWT**: Validates token, looks up user in DB, attaches `userId`/`displayName` to `socket.data`
- **Without JWT**: Assigns a guest identity. If the client sends a `guestId` (from sessionStorage), it's reused for reconnection stability.

### UserSocketMap

Bridges persistent `userId` with ephemeral `socket.id`. All game logic uses `userId` as the player identifier. The map handles reconnections — when a user reconnects with a new socket, the old mapping is replaced.

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
  │ game:state ◄──────────┤──────────► (throttled to ~20fps, delta-compressed)
  │ game:input ──────────►│◄────────── (player inputs)
  │                       │
  │ (game calls endRound) │
  └───────────────────────┤
  (if winner reached pointsToWin, stop)
                          │
    match:end ────────────┤──────────► (winner, final scores, history)
```

### Play Again Flow

After a match ends, each player independently clicks "Play Again" or "Home":
- **Play Again**: Sends `match:playAgain`, player status becomes `ready` in lobby. Their opponent sees "End Screen" status until they also click.
- **Home**: Sends `lobby:leave`, player exits lobby entirely.
- When both players have clicked Play Again (both `ready`), countdown starts automatically.

## State Management

### Server State

- **`LobbyManager`** — Map of `lobbyId → Lobby` and `userId → lobbyId`
  - Owns lobby lifecycle, player tracking, ready state, config, countdown timers
  - Uses `UserSocketMap` for `userId → socketId` resolution when emitting events

- **`MatchManager`** — Map of `lobbyId → ActiveMatch` and `userId → lobbyId`
  - Owns match state: round counter, scores, game order, active game instance
  - Cleans up its maps when match ends; lobby maps persist
  - `onMatchEnd` callback notifies lobby to enter post-match state

- **`GameRegistry`** — Map of `gameId → ServerGameModule` and `setId → GameSet`
  - Static after startup, stores all registered games and game sets

### Client State

- **`AuthContext`** — User identity, JWT token, login/logout/updateProfile methods
- **`SocketContext`** — Socket.IO connection (gated on auth loading), `myId` (userId assigned by server)
- **`GameContext`** — All UI state:
  - `screen` — Which screen to show (`home`, `profile`, `lobby`, `lobbyNotFound`, `transition`, `playing`, `gameOver`)
  - `lobbyState`, `transitionData`, `currentGameId`, `matchEndData`, `lobbyError`
  - `resetMatchState()` — Clears all match data when returning to lobby

## Socket.IO Events Reference

### Auth Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `auth:identity` | S→C | `AuthUser` | Server sends assigned identity on connect |

### Lobby Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `lobby:create` | C→S | callback(lobbyId) | Create new lobby, returns ID |
| `lobby:join` | C→S | `{ lobbyId }` | Join existing lobby |
| `lobby:leave` | C→S | — | Leave current lobby |
| `lobby:config` | C→S | `Partial<LobbyConfig>` | Host updates settings |
| `lobby:ready` | C→S | — | Set ready status |
| `lobby:unready` | C→S | — | Unset ready status |
| `lobby:state` | S→C | `LobbyState` | Full lobby state update |
| `lobby:error` | S→C | `{ message }` | Lobby join error |

### Match Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `match:start` | S→C | `{ pointsToWin }` | Match is starting |
| `match:transition` | S→C | `TransitionData` | Show next game + scores |
| `match:roundStart` | S→C | `{ gameId }` | Begin playing the game |
| `match:end` | S→C | `MatchEndData` | Match is over |
| `match:playAgain` | C→S | — | Player ready for another match |

### Game Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `game:state` | S→C | game-specific | Server pushes game state |
| `game:input` | C→S | game-specific | Player sends input |

## Lobby Configuration

The lobby host can configure:

- **Points to Win** (1-10): How many round wins needed to win the match. Configurable via slider.
- **Game Set**: Which pool of games to draw from (currently only "All Games")

Config changes are sent via `lobby:config` and only accepted from the host (verified server-side). Non-host players see the settings as read-only.

## Game Sets

Game sets define pools of games that can be selected for a match:

```typescript
interface GameSet {
  id: string;          // e.g., 'all', 'action', 'speed'
  name: string;        // Display name
  description: string; // Shown in lobby
  gameIds: string[];   // List of game IDs; empty = all games
}
```

Sets are registered in `server/src/games/registry.ts`. When a match starts, the server picks games from the selected set, shuffles them, and assigns enough for the maximum possible rounds.

## Sprite System

Games render via `client/src/lib/sprites.ts`, which provides a sprite API with **player skin support**.

### Lookup Cascade

```
drawSprite(ctx, 'ball', x, y, w, h, { skin: playerId })

1. Try: "{playerId}.ball" sprite sheet  →  player's custom skin
2. Try: "ball" sprite sheet             →  default sprite
3. Fall back: colored rectangle         →  placeholder
```

### Loading Sprites

```typescript
loadSpriteSheet('ball', '/sprites/ball.png', 32, 32);           // default
loadSpriteSheet('usr_abc.ball', '/skins/usr_abc/ball.png', 32, 32); // skin
```

### Background System

Backgrounds use the same sprite cache with a game-specific cascade:

```typescript
drawBackground(ctx, 'pong', 800, 500, { color: '#1a1a2e' });
// Cascade: "pong.bg" sheet → "bg" sheet → solid color fill

drawBackgroundLayer(ctx, 'flappy-race', 'clouds', 800, 500, { scrollX: offset, parallax: 0.3 });
// Cascade: "flappy-race.bg-clouds" → "bg-clouds" → no-op (layers are optional)
```

Supports scrolling (`scrollX`/`scrollY`), parallax depth multipliers, and tile mode for repeating patterns.

See [sprite-requirements.md](sprite-requirements.md) for the full catalog of entities needing sprites.

## Network Optimization

The server runs game physics at 60fps but network transmission is optimized to reduce bandwidth and latency impact.

### Send Rate Throttling

`server/src/net-optimizer.ts` wraps each game's `ctx.emit` transparently:

- **Physics**: 60fps (16.7ms) — unchanged, games don't know about the optimizer
- **Network**: 20fps (50ms) — the latest state is buffered and sent at the throttled rate
- **Non-game events** (match transitions, round starts) pass through immediately

### Delta Compression

Instead of sending the full state every frame:

```
Full state:  { _full: true, ball: {x:100,y:200}, paddles: {...}, scores: {...}, canvasWidth: 800, canvasHeight: 500 }
Delta state: { _delta: true, ball: {x:105,y:198} }
```

- Only changed fields are sent (deep comparison)
- Nested objects are recursively diffed
- Arrays that changed are sent in full (no element-level diffing)
- Every 10th send is a full state for reliability (recover from dropped deltas)

### Client-Side Handling

`client/src/lib/net.ts` provides `applyStateUpdate()`:

```typescript
socket.on('game:state', (data: unknown) => {
  stateRef.current = applyStateUpdate(stateRef.current, data);
  // Handles both _full and _delta messages automatically
});
```

### Client-Side Prediction

`client/src/lib/prediction.ts` provides `PositionPredictor` for reducing perceived input lag:

- Local player's inputs are applied immediately on the client
- Server corrections are blended smoothly (lerp toward authoritative position)
- Currently used by Pong; available for all keyboard-movement games

```typescript
const predictor = new PositionPredictor(0.25); // correction rate
predictor.applyInput(0, -PADDLE_SPEED);        // local input — instant
predictor.setServerPosition(0, serverY);        // server correction — blended
const { x, y } = predictor.getPosition();      // render this
```

### Impact

- ~3x fewer network messages (60fps → 20fps)
- ~40-70% smaller messages (delta compression)
- Physics fidelity unchanged (still 60fps server-side)

## Database Schema

```sql
users (id TEXT PK, display_name TEXT, avatar_url TEXT, created_at TEXT)
oauth_accounts (provider TEXT, provider_id TEXT, user_id TEXT FK, email TEXT, PK(provider, provider_id))
```

Future tables (not yet created): skins, match_history

## Reconnection Handling

- **Disconnect grace period**: When a socket disconnects, the server waits 15 seconds before removing the player. If they reconnect within that window, they're re-joined to their lobby.
- **Guest ID stability**: Guest IDs are stored in `sessionStorage` and sent back on reconnect so the same guest ID is reused.
- **Authenticated users**: JWT persists in `localStorage`. On reconnect, the same `userId` is resolved from the JWT, and the `UserSocketMap` updates to the new socket.

## Screen Flow

```
HomeScreen ──────────────────────────────────────────────────┐
  ├─► ProfileScreen (signed-in users)                        │
  │     └─► HomeScreen (back)                                │
  ├─► LobbyScreen (create or join)                           │
  │     ├─► HomeScreen (leave lobby)                         │
  │     ├─► LobbyNotFoundScreen (invalid link)               │
  │     │     └─► HomeScreen                                 │
  │     └─► [Countdown]                                      │
  │          └─► TransitionScreen (prev result + next game)  │
  │               └─► PlayingScreen (renders active game)    │
  │                    └─► TransitionScreen (loop)           │
  │                         └─► GameOverScreen               │
  │                              ├─► LobbyScreen (play again)│
  │                              └─► HomeScreen (home)       │
```

## Production Deployment

In production (`NODE_ENV=production`):
- Express serves the built React client from `client/dist/` as static files
- The catch-all route `{*path}` serves `index.html` for client-side routing
- Socket.IO runs on the same port — no CORS needed
- SQLite database is created at `server/data/arcade-battle.db` (directory auto-created)
- `RAILWAY_PUBLIC_DOMAIN` is auto-detected for OAuth callback URLs
