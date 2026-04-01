# Arcade Battle

A real-time 1v1 mini-game battle platform where two players compete in a series of short arcade games. Create a lobby, invite a friend, and play through randomized rounds of skill-based mini-games until someone hits the target score.

## Quick Start (Local Dev)

```bash
# Install dependencies
npm install

# Run both client and server
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001

Open two browser tabs, create a lobby in one, copy the invite link to the other, ready up, and play.

## Deployment (Railway)

The app deploys as a single Railway service — the Express server serves both the Socket.IO API and the built React client.

```bash
npm run build   # Builds the React client
npm run start   # Starts the production server (serves client + API)
```

**Required env vars on Railway:**
- `NODE_ENV=production`
- `JWT_SECRET` — any random string
- `SERVER_URL` — your Railway domain (e.g., `https://your-app.up.railway.app`)

**Optional (for OAuth):**
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`

See `.env.example` for all options.

## How It Works

1. **Create a lobby** from the home page — you get a shareable invite link
2. **Configure the match** — the host sets points to win (1-10) and the game set
3. **Ready up** — once both players are ready, a 5-second countdown starts
4. **Play rounds** — each round is a different randomly-selected mini-game
5. **Win the match** — first player to reach the target score wins
6. **Play again** — each player clicks Play Again to ready up for the next match

## Accounts

Accounts are **optional** — guests can play without signing in. Sign in with Google or Discord for:
- Persistent identity (survives reconnects and sessions)
- Customizable display name and avatar (via Profile page)
- Future: skins, match history, matchmaking/elo

Guest players get an auto-generated name like "Guest 4821" that persists for the browser session.

## Project Structure

```
ArcadeBattle/
├── shared/                  # Shared types, interfaces, and constants
│   └── src/
│       ├── types.ts         # All TypeScript interfaces (Player, Lobby, Auth, Game)
│       ├── constants.ts     # Timing, config defaults
│       └── index.ts
├── server/                  # Node.js + Express + Socket.IO
│   └── src/
│       ├── index.ts         # Server entry, socket event handlers, static file serving
│       ├── db.ts            # SQLite database (users, OAuth accounts)
│       ├── auth.ts          # OAuth routes (Google, Discord), JWT, profile API
│       ├── middleware.ts    # Socket.IO auth middleware, UserSocketMap
│       ├── lobby.ts         # Lobby management
│       ├── match.ts         # Match orchestration (round management, scoring)
│       └── games/           # Server-side game logic (11 games)
│           ├── registry.ts
│           ├── pong.ts, aim-trainer.ts, joust.ts, air-hockey.ts,
│           ├── volleyball.ts, ball-brawl.ts, fencing.ts,
│           ├── asteroid-dodge.ts, flappy-race.ts,
│           ├── space-invaders.ts, cowboy-shootout.ts
│   └── data/                # SQLite database file (gitignored)
├── client/                  # React + Vite + TypeScript
│   └── src/
│       ├── App.tsx          # Root component, socket event routing
│       ├── context/         # React contexts (Auth, Socket, Game state)
│       ├── screens/         # UI screens (Home, Profile, Lobby, Transition, etc.)
│       ├── games/           # Client-side game renderers (11 games)
│       │   └── registry.tsx
│       └── lib/
│           └── sprites.ts   # Sprite rendering system (with skin support)
├── docs/
│   ├── architecture.md      # System architecture deep-dive
│   ├── adding-games.md      # Guide to creating new mini-games
│   └── sprite-requirements.md # Sprite asset catalog
└── .env.example             # Environment variable documentation
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, TypeScript |
| Backend | Node.js, Express 5, Socket.IO |
| Database | SQLite (better-sqlite3) |
| Auth | OAuth 2.0 (Google, Discord), JWT |
| Networking | WebSockets (Socket.IO) — server-authoritative |
| Rendering | HTML5 Canvas with sprite system |
| Deployment | Railway (single service) |
| Monorepo | npm workspaces |

## Current Games (11)

| Game | Type | Controls | Win Condition |
|------|------|----------|--------------|
| Pong | Paddle | W/S or Arrows | First to 3 |
| Aim Trainer | Mouse | Click targets | Most hits in 15s |
| Joust | Platform | A/D, W/Space flap | First to 3 stomps |
| Air Hockey | Mouse | Mouse moves mallet | First to 3 goals |
| Volleyball | Physics | A/D, W/Space jump | First to 5 |
| Ball Brawl | Lethal League | A/D, W/Space, J/K swing | First to 3 hits |
| Fencing | Nidhogg | A/D, W, Space, S guard | Reach opponent's end |
| Asteroid Dodge | Split-screen | A/D dodge | Last alive |
| Flappy Race | Split-screen | W/Space flap | Last alive |
| Space Invaders | Split-screen | A/D, Space shoot | Clear wave or survive |
| Cowboy Shootout | Shared screen | Right-click peek, Left-click shoot | Most kills in 30s |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both client and server in dev mode |
| `npm run dev:client` | Start only the Vite dev server |
| `npm run dev:server` | Start only the game server |
| `npm run build` | Build the React client for production |
| `npm run start` | Start the production server |

## Documentation

- **[Architecture Guide](docs/architecture.md)** — System architecture, auth, data flow, events
- **[Adding Games Guide](docs/adding-games.md)** — Step-by-step guide to creating new mini-games
- **[Sprite Requirements](docs/sprite-requirements.md)** — Catalog of all visual entities needing sprites
