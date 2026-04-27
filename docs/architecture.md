# Architecture Guide

## Overview

Arcade Battle uses a **server-authoritative** architecture. All game logic runs on the server — clients send inputs and render the state they receive.

```
┌─────────────┐     WebSocket      ┌─────────────────┐     WebSocket      ┌─────────────┐
│   Player 1  │ ◄────────────────► │     Server      │ ◄────────────────► │   Player 2  │
│  (React UI) │   inputs / state   │ (Node+Socket.IO)│   inputs / state   │  (React UI) │
└─────────────┘                    │  SQLite + Auth  │                    └─────────────┘
                                   └─────────────────┘
```

## Packages

### `shared/`
Types and constants shared between client and server.
- **`AuthUser`** — User identity (id, displayName, avatarUrl, isGuest)
- **`Player`** — Player in a lobby (id, displayName, avatarUrl, status)
- **`LobbyState`** / **`LobbyConfig`** — Lobby info and settings
- **`GameInfo`** — Game metadata (id, name, description, controls, maxDuration)
- **`TransitionData`** — Between-round screen data
- **`MatchEndData`** — Final match result
- **`ServerGameModule`** / **`GameInstance`** / **`MatchContext`** — Game plugin interfaces
- **`GameSet`** — Named collection of games

### `server/`
- **`index.ts`** — Express + Socket.IO setup, event routing, static file serving, match history saving
- **`db.ts`** — SQLite: users, magic-link tokens, feedback, match history
- **`auth.ts`** — Magic-link email auth (Resend), JWT, profile API, avatar upload
- **`feedback.ts`** — Feedback API (ratings, bug reports) + admin dashboard with tabs (Activity, Feedback, Ratings, Match History)
- **`middleware.ts`** — Socket.IO auth middleware, `UserSocketMap`
- **`lobby.ts`** — Lobby management with reconnection grace period
- **`match.ts`** — Match orchestration, round lifecycle, scoring
- **`net-optimizer.ts`** — Send rate throttle (45fps) + delta compression
- **`games/`** — 23 game modules + registry + 4 game sets

### `client/`
- **`context/AuthContext.tsx`** — Magic-link request flow, JWT storage, profile/avatar updates
- **`context/SocketContext.tsx`** — Socket.IO connection with auth, guest ID persistence, `useMyId()` hook
- **`context/GameContext.tsx`** — UI state: screens, lobby state, match data
- **`screens/`** — Home, Profile, Lobby, LobbyNotFound, Transition, Playing, GameOver
- **`games/`** — 23 client-side game renderers + registry
- **`lib/sprites.ts`** — Sprite + background rendering with player skin support
- **`lib/prediction.ts`** — Client-side input prediction (`PositionPredictor`, `StateInterpolator`)
- **`lib/net.ts`** — Delta state merging (`applyStateUpdate`) + interpolation (`StateBuffer`)

## Authentication

### Identity Model
- **Authenticated users** — Magic-link email sign-in, persistent userId in SQLite, customizable name/avatar
- **Guests** — Auto-generated `guest_xxx` ID stored in `localStorage`, persists across browser sessions

### Magic-Link Flow
Client `POST /auth/magic-link` with email → server stores a one-time token (15 min TTL) and emails the link via Resend → user clicks `GET /auth/verify?token=…` → server consumes the token, finds-or-creates the user by email, signs a JWT, and redirects to `/auth/callback#token=…` (fragment, so the JWT never appears in HTTP referer headers or proxy logs) → client stores the JWT and socket reconnects with it.

The `/auth/magic-link` endpoint is rate-limited to 5 requests per minute per IP.

### Profile
Authenticated users can update display name and upload avatar images (resized to 256x256 client-side, validated server-side, stored at `/avatars/`).

## Data Flow

### Match Flow
```
Server
  │
  match:start ──────► (to both)
  │
  ┌─ loop ──────────┐
  │ match:transition │──► (game name, description, controls, scores)
  │ (4s delay)       │
  │ match:roundStart │──► (gameId)
  │ game:state       │◄──► (throttled 45fps, delta-compressed)
  │ game:input       │◄──── (player inputs)
  │ (game endRound)  │
  └──────────────────┘
  │
  match:end ────────► (winner, scores, rounds)
```

### Play Again Flow
Each player clicks independently. Status shows "End Screen" until they click. Both ready → countdown.

## Network Optimization

### Send Rate Throttling
`net-optimizer.ts` wraps `ctx.emit` — physics at 60fps, network at 45fps. Non-game events pass through immediately.

### Delta Compression
Only changed fields sent. Full state every 10th send. Arrays always sent in full when changed.

### Client Handling
`applyStateUpdate()` handles `_full` and `_delta` messages. `StateBuffer` interpolates between updates. Integer values snap (no lerp on scores). Large jumps (>200px) snap (handles screen wrapping).

### Client-Side Prediction
`PositionPredictor` applies local inputs instantly, lerps toward server corrections. Used by Pong paddle.

### Resync
If no `game:state` received within 2s, client emits `game:resync`. Also emits on Socket.IO reconnect. Server responds with `match:roundStart` + full state.

## Socket.IO Events

### Auth
| Event | Direction | Description |
|-------|-----------|-------------|
| `auth:identity` | S→C | Server sends assigned identity on connect |

### Lobby
| Event | Direction | Description |
|-------|-----------|-------------|
| `lobby:create` | C→S | Create lobby, callback returns ID |
| `lobby:join` | C→S | Join existing lobby |
| `lobby:leave` | C→S | Leave lobby |
| `lobby:config` | C→S | Host updates settings |
| `lobby:ready` / `lobby:unready` | C→S | Toggle ready |
| `lobby:state` | S→C | Full lobby state |
| `lobby:error` | S→C | Join error |

### Match
| Event | Direction | Description |
|-------|-----------|-------------|
| `match:start` | S→C | Match starting |
| `match:transition` | S→C | Next game + scores + controls |
| `match:roundStart` | S→C | Begin game |
| `match:end` | S→C | Match over |
| `match:playAgain` | C→S | Player ready for rematch |
| `game:state` | S→C | Game state (delta-compressed) |
| `game:input` | C→S | Player input |
| `game:resync` | C→S | Request full state resend |

## Game Description System

Each game has two text fields:
- **`description`** — Short tagline shown on transition screen (e.g., "Classic 1v1 paddle game")
- **`controls`** — How to play, shown on transition screen AND as a persistent bar during gameplay

## Game Sets

4 sets registered in `server/src/games/registry.ts`:
- **All** (empty `gameIds` = all games)
- **Basic** — 10 simple games (default for new lobbies)
- **Standard** — 20 games, excludes bullet hells, puzzles, complex platformers
- **Keyboard Only** — 19 games that don't require mouse

## Lobby Configuration

Host can configure:
- **Points to Win** (1-10) via slider
- **Game Set** via card selector with descriptions

Config only accepted from host (verified server-side).

## Sprite System

`client/src/lib/sprites.ts` — skin cascade:
```
drawSprite(ctx, 'ball', x, y, w, h, { skin: playerId })
→ "{playerId}.ball" sheet → "ball" sheet → colored rectangle
```

Background system: `drawBackground(ctx, 'pong', W, H, { color, scrollX, parallax })`

## Database Schema

```sql
users (id, display_name, avatar_url, email UNIQUE, created_at)
magic_links (token PK, email, expires_at, used, created_at)
feedback (id, type, user_id, game_id, game_name, round_number, rating, message, lobby_id, created_at)
match_history (id, lobby_id, player1_id/name, player2_id/name, winner_id, scores, rounds JSON, game_set, played_at)
```

## Feedback System

- **Game Over Screen**: 👍/👎 per round, bug report text box
- **API**: `POST /api/feedback/rating`, `POST /api/feedback/bug`
- **Dashboard** (`/api/feedback/view?key=SECRET`): Activity tab (matches/players per hour/day/week), Feedback tab (filterable table), Ratings tab (raw totals + per-user average mode), Match History tab

## Reconnection Handling

- **Grace period**: 15s before removing disconnected player from lobby
- **Guest ID stability**: `localStorage` persists guest ID across sessions
- **Room re-join**: Every connection checks for existing lobby and re-joins
- **Game resync**: Server sends full state + roundStart on reconnect or client request

## Production Deployment

- Express serves `client/dist/` as static files
- Catch-all route `{*path}` serves `index.html` for client-side routing
- Socket.IO same-origin, no CORS needed
- SQLite at `server/data/arcade-battle.db` (auto-created)
- `RAILWAY_PUBLIC_DOMAIN` auto-detected as `SERVER_URL` when running on Railway
- `app.set('trust proxy', 1)` is enabled in production so per-IP rate limiting sees the real client IP behind the Railway proxy
- Users auto-recreated from valid JWT if DB was wiped (Railway redeploys)

## Multiple Layouts

Tanks and Joust randomly select from 4 layout variants each round. Layouts stored as arrays, randomly picked in `create()`. Client renders from state — no client changes needed.
