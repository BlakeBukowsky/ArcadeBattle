# Arcade Battle

A real-time 1v1 mini-game battle platform where two players compete in a series of short arcade games. Create a lobby, invite a friend, and play through randomized rounds of skill-based mini-games until someone hits the target score.

> Licensed under [MIT](LICENSE). Self-hosting friendly — see below.

## Getting Started

Requirements: Node.js 20+ and npm 10+.

```bash
git clone https://github.com/<your-fork>/ArcadeBattle.git
cd ArcadeBattle
npm install
cp .env.example .env       # Windows: copy .env.example .env
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001

Open two browser tabs, create a lobby in one, copy the invite link to the other, ready up, and play. You can play as a guest with no setup; magic-link sign-in only requires `RESEND_API_KEY` (see below).

## Configuration

All config is via environment variables — see [`.env.example`](.env.example).

| Var | Required | Notes |
|-----|----------|-------|
| `JWT_SECRET` | Yes (prod) | Random string; signs session tokens. The placeholder is fine for local dev. |
| `RESEND_API_KEY` | For sign-in | Get one free at [resend.com](https://resend.com). Without it, sign-in is disabled but guests still work. |
| `RESEND_FROM` | For sign-in | E.g. `noreply@yourdomain.com`. In dev you can use `onboarding@resend.dev`, which only delivers to the email on your Resend account. |
| `CLIENT_URL` | No | Defaults to `http://localhost:5173`. Set to your prod domain if client and server are split. |
| `SERVER_URL` | No | Defaults to `http://localhost:3001`. On Railway, `RAILWAY_PUBLIC_DOMAIN` is auto-detected. |
| `FEEDBACK_SECRET` | No | Set this to enable the `/api/feedback/view?key=…` admin dashboard. |

## Deployment

Single service — Express serves both the Socket.IO API and the built React client. Anywhere that runs Node will work; the project is set up for Railway out of the box.

```bash
npm run build   # Builds the React client into client/dist
npm run start   # Starts the production server (serves the built client)
```

In production, set `NODE_ENV=production` and at minimum `JWT_SECRET`. The server enables `trust proxy` so per-IP rate limiting works behind a reverse proxy.

## How It Works

1. **Create a lobby** — you get a shareable invite link
2. **Configure the match** — host sets points to win (1-10) and game set
3. **Ready up** — 5-second countdown when both ready
4. **Play rounds** — each round is a different randomly-selected mini-game
5. **Win the match** — first player to reach the target score wins
6. **Play again** — each player clicks Play Again to ready up for the next match
7. **Rate games** — thumbs up/down each game on the results screen

## Accounts

Optional — guests can play without signing in. Sign in with a magic link sent to your email for:
- Persistent identity across sessions
- Customizable display name and avatar (Profile page with upload)
- Match history on Profile page
- Future: skins, matchmaking/elo

Guest IDs persist in `localStorage` across browser sessions on the same machine.

## Project Structure

```
ArcadeBattle/
├── shared/                  # Shared types, interfaces, and constants
│   └── src/
│       ├── types.ts         # All TypeScript interfaces
│       ├── constants.ts     # Timing, config defaults
│       └── index.ts
├── server/                  # Node.js + Express + Socket.IO
│   └── src/
│       ├── index.ts         # Server entry, socket events, static file serving
│       ├── db.ts            # SQLite (users, magic links, feedback, match history)
│       ├── auth.ts          # Magic-link email auth (Resend), JWT, profile, avatar upload
│       ├── feedback.ts      # Feedback API + admin dashboard
│       ├── middleware.ts     # Socket.IO auth, UserSocketMap
│       ├── lobby.ts         # Lobby management
│       ├── match.ts         # Match orchestration, round management
│       ├── net-optimizer.ts  # Send rate throttle + delta compression
│       └── games/           # Server-side game logic (23 games)
│           └── registry.ts  # Game + game set registration
│   └── data/                # SQLite database + avatars (gitignored)
├── client/                  # React + Vite + TypeScript
│   └── src/
│       ├── App.tsx          # Root component, socket event routing
│       ├── context/         # Auth, Socket, Game state contexts
│       ├── screens/         # Home, Profile, Lobby, Transition, Playing, GameOver, etc.
│       ├── games/           # Client-side game renderers (23 games)
│       │   └── registry.tsx
│       └── lib/
│           ├── sprites.ts   # Sprite + background rendering (with skin support)
│           ├── prediction.ts # Client-side input prediction
│           └── net.ts       # Delta state merging + interpolation
├── docs/
│   ├── architecture.md
│   ├── adding-games.md
│   └── sprite-requirements.md
└── .env.example
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, TypeScript |
| Backend | Node.js, Express 5, Socket.IO |
| Database | SQLite (better-sqlite3) |
| Auth | Magic-link email (Resend) + JWT |
| Networking | WebSockets — server-authoritative, delta-compressed, 45fps |
| Rendering | HTML5 Canvas with sprite system + skin support |
| Deployment | Railway (single service) |
| Monorepo | npm workspaces |

## Current Games (23)

| Game | Type | Controls | Win Condition |
|------|------|----------|--------------|
| Pong | Paddle | W/S, Arrows | First to 3 |
| Aim Trainer | Mouse | Click targets | Most hits in 15s |
| Joust | Platform | A/D, W/Space flap | First to 3 stomps |
| Air Hockey | Mouse | Mouse moves mallet | First to 3 goals |
| Volleyball | Physics | A/D, W/Space jump | First to 5 |
| Asteroid Dodge | Split-screen | A/D dodge | Last alive |
| Flappy Race | Split-screen | W/Space flap | Last alive |
| Space Invaders | Split-screen | A/D, Space shoot | Clear wave or survive |
| Cowboy Shootout | Shared screen | R-click peek, L-click shoot | Kill all 7 bandits |
| Arrow Sequence | Split-screen | Arrows or WASD | Clear 5 sequences first |
| Rhythm Rush | Split-screen | Arrows or WASD | Miss 3 = lose |
| Typing Race | Split-screen | Type letters | Finish 3 sentences first |
| Memory Arrows | Split-screen | Arrows or WASD | Last to fail |
| Tanks | Shared arena | W/S move, A/D turn, Space fire | First hit wins |
| Asteroids PvP | Shared arena | A/D rotate, W thrust, Space shoot | 3 lives |
| Space Boss | Split-screen | WASD move, Space shoot | Kill the boss, 3 lives |
| Cave Dive | Split-screen | A/D, W/Space jump | Reach exit first |
| Racing | Shared track | W/S/A/D, Shift drift | First to 3 laps |
| Balance | Split-screen | WASD | Navigate hidden path |
| Quilt | Split-screen | Click/R rotate/right-click remove | Complete 3 puzzles |
| Word Guess | Split-screen | Type + Enter | Guess the word first |
| Rounds | Shared arena | A/D, W/Space jump, click shoot | First to 3 kills |
| Control Panel | Split-screen | Click controls | Complete 10 commands |

## Game Sets

| Set | Default | Description |
|-----|---------|-------------|
| **Basic** | Yes | Simple, self-explanatory games — great for first-timers |
| **Standard** | | All straightforward games — skips bullet hells and puzzles |
| **Keyboard Only** | | No mouse needed |
| **All Games** | | Everything including complex ones |

## Admin Dashboard

Access at `/api/feedback/view?key=YOUR_FEEDBACK_SECRET`

Tabs: Activity (matches/players per hour/day/week), Feedback (ratings + bug reports), Ratings (per-game, raw + per-user average), Match History (global)

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both client and server in dev mode |
| `npm run dev:client` | Start only the Vite dev server |
| `npm run dev:server` | Start only the game server |
| `npm run build` | Build the React client for production |
| `npm run start` | Start the production server |

## Documentation

- **[Architecture Guide](docs/architecture.md)** — System architecture, auth, networking, data flow
- **[Adding Games Guide](docs/adding-games.md)** — Step-by-step guide to creating new mini-games
- **[Sprite Requirements](docs/sprite-requirements.md)** — Catalog of visual entities needing sprites
