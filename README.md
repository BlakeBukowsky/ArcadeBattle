# Arcade Battle

A real-time 1v1 mini-game battle platform where two players compete in a series of short arcade games. Create a lobby, invite a friend, and play through randomized rounds of skill-based mini-games until someone hits the target score.

## Quick Start

```bash
# Install dependencies
npm install

# Run both client and server
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001

Open two browser tabs, create a lobby in one, copy the invite link to the other, ready up, and play.

## How It Works

1. **Create a lobby** from the home page — you get a shareable invite link
2. **Configure the match** — the host sets points to win (1-5) and the game set
3. **Ready up** — once both players are ready, a 5-second countdown starts
4. **Play rounds** — each round is a different randomly-selected mini-game
5. **Win the match** — first player to reach the target score wins
6. **Play again** — both players return to the lobby to go another round

## Project Structure

```
ArcadeBattle/
├── shared/              # Shared types, interfaces, and constants
│   └── src/
│       ├── types.ts     # All TypeScript interfaces
│       ├── constants.ts # Timing, config defaults
│       └── index.ts     # Barrel export
├── server/              # Node.js + Express + Socket.IO
│   └── src/
│       ├── index.ts     # Server entry, socket event handlers
│       ├── lobby.ts     # Lobby creation, joining, ready state
│       ├── match.ts     # Match orchestration, round management
│       └── games/       # Server-side game logic
│           ├── registry.ts
│           ├── pong.ts
│           ├── reaction-race.ts
│           └── aim-trainer.ts
├── client/              # React + Vite + TypeScript
│   └── src/
│       ├── App.tsx      # Root component, socket event routing
│       ├── context/     # React contexts (Socket, Game state)
│       ├── screens/     # UI screens (Home, Lobby, Transition, etc.)
│       └── games/       # Client-side game renderers
│           ├── registry.tsx
│           ├── PongGame.tsx
│           ├── ReactionRaceGame.tsx
│           └── AimTrainerGame.tsx
└── docs/
    ├── architecture.md  # System architecture deep-dive
    └── adding-games.md  # Guide to creating new mini-games
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, TypeScript |
| Backend | Node.js, Express, Socket.IO |
| Networking | WebSockets (Socket.IO) — server-authoritative |
| Rendering | HTML5 Canvas (games), React (UI) |
| Monorepo | npm workspaces |

## Current Games

| Game | Type | Description |
|------|------|-------------|
| Pong | Action | Classic paddle game, first to 5 points |
| Reaction Race | Speed | Wait for the signal, react fastest |
| Aim Trainer | Skill | Click targets for 15 seconds, most hits wins |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both client and server in dev mode |
| `npm run dev:client` | Start only the Vite dev server |
| `npm run dev:server` | Start only the game server |

## Documentation

- **[Architecture Guide](docs/architecture.md)** — How the system works end-to-end
- **[Adding Games Guide](docs/adding-games.md)** — Step-by-step guide to creating new mini-games
