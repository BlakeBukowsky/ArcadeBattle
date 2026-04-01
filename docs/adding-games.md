# Adding Games Guide

Every mini-game in Arcade Battle has two parts:

1. **Server module** — Runs the game logic, processes inputs, determines winner
2. **Client component** — Renders the game and captures player input

This guide walks through creating both, using the existing games as reference.

## Step 1: Define Your Game

Before writing code, answer these questions:

- **What does each player do?** (click targets, press keys, move a paddle)
- **How is the winner determined?** (most points, first to finish, last one standing)
- **What state needs to be synced?** (positions, scores, timers, objects)
- **What inputs does it need?** (keyboard, mouse clicks, mouse position)
- **How long should it last?** (set a maxDuration as a timeout fallback)

## Step 2: Create the Server Module

Create a new file in `server/src/games/your-game.ts`.

### Template

```typescript
import type { ServerGameModule, MatchContext, GameInstance } from '@arcade-battle/shared';

// Game constants
const GAME_DURATION = 10000; // 10 seconds
const TICK_RATE = 1000 / 30; // 30fps state updates

// Define your game state — this gets sent to both clients
interface YourGameState {
  scores: Record<string, number>;
  timeRemaining: number;
  // ... whatever your game needs
}

export const yourGame: ServerGameModule = {
  info: {
    id: 'your-game',              // unique ID, used as registry key
    name: 'Your Game',            // shown on transition screen
    description: 'Description of the game and controls. Use Arrow Keys to move.', // shown on transition screen
    maxDuration: 15,              // timeout in seconds (server ends round if exceeded)
  },

  create(ctx: MatchContext): GameInstance {
    const [p1, p2] = ctx.players;
    let running = true;

    const state: YourGameState = {
      scores: { [p1]: 0, [p2]: 0 },
      timeRemaining: GAME_DURATION / 1000,
    };

    // Game loop — runs at TICK_RATE, sends state to both clients
    const startTime = Date.now();
    const interval = setInterval(() => {
      if (!running) return;

      // Update game state here (physics, timers, etc.)
      const elapsed = Date.now() - startTime;
      state.timeRemaining = Math.max(0, (GAME_DURATION - elapsed) / 1000);

      // Check for game end
      if (elapsed >= GAME_DURATION) {
        running = false;
        clearInterval(interval);
        // Determine winner and end the round
        const winner = state.scores[p1] >= state.scores[p2] ? p1 : p2;
        ctx.emit('game:state', state); // send final state
        ctx.endRound(winner);          // THIS ends the round
        return;
      }

      // Send state to both players every tick
      ctx.emit('game:state', state);
    }, TICK_RATE);

    return {
      onPlayerInput(playerId: string, data: unknown): void {
        if (!running) return;
        // Process player input — data shape is whatever the client sends
        const input = data as { action: string; /* ... */ };
        // Update state based on input
      },

      getState(): YourGameState {
        return state;
      },

      cleanup(): void {
        // MUST clean up all timers/intervals
        running = false;
        clearInterval(interval);
      },
    };
  },
};
```

### Key Rules for Server Modules

1. **`ctx.endRound(winnerId)`** is the only way to end a round. Call it exactly once.
2. **`ctx.emit(event, data)`** sends to both players. Use `ctx.emitTo(playerId, event, data)` for player-specific data.
3. **Always use `game:state` as the event name** for state updates — the client listens for this.
4. **`cleanup()` must stop everything** — clear all intervals, timeouts, and set a `running` flag to false. This is called when the round ends or a player disconnects.
5. **Always check `if (!running)` return** at the top of intervals and input handlers to avoid acting after cleanup.
6. **The server is the source of truth** — never trust client input for scoring. Validate everything server-side.
7. **Include controls in the description** — this is shown on the transition screen before the game starts.

### The MatchContext API

```typescript
interface MatchContext {
  players: [string, string];  // Socket IDs of both players

  // Send data to both players
  emit(event: string, data: unknown): void;

  // Send data to one specific player
  emitTo(playerId: string, event: string, data: unknown): void;

  // End the round — call exactly once with the winner's socket ID
  endRound(winnerId: string): void;
}
```

## Step 3: Create the Client Component

Create a new file in `client/src/games/YourGame.tsx`.

### Template (Canvas-based game)

```tsx
import { useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext.tsx';

// Match the state interface from your server module
interface YourGameState {
  scores: Record<string, number>;
  timeRemaining: number;
  // ...
}

export default function YourGame() {
  const socket = useSocket();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<YourGameState | null>(null);

  // Listen for game state updates
  useEffect(() => {
    function handleState(s: YourGameState) {
      stateRef.current = s;
    }
    socket.on('game:state', handleState);
    return () => { socket.off('game:state', handleState); };
  }, [socket]);

  // Handle player input
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Send input to server — shape must match what onPlayerInput expects
      socket.emit('game:input', { action: 'move', direction: e.key });
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [socket]);

  // Render loop
  useEffect(() => {
    let animId: number;
    function draw() {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const state = stateRef.current;
      if (!canvas || !ctx || !state) {
        animId = requestAnimationFrame(draw);
        return;
      }

      // Set canvas size
      canvas.width = 800;
      canvas.height = 500;

      // Clear and draw
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw your game here using state data
      // ...

      // Draw scores
      ctx.fillStyle = '#fff';
      ctx.font = '24px monospace';
      const players = Object.keys(state.scores);
      players.forEach((pid, i) => {
        const label = pid === socket.id ? 'You' : 'Opponent';
        ctx.fillText(`${label}: ${state.scores[pid]}`, 20, 30 + i * 30);
      });

      animId = requestAnimationFrame(draw);
    }
    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [socket]);

  return (
    <div className="game-container">
      <canvas ref={canvasRef} className="game-canvas" />
      <p className="controls-hint">Your controls description here</p>
    </div>
  );
}
```

### Template (DOM-based game)

For games that don't need a canvas (trivia, word games, button mashers):

```tsx
import { useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext.tsx';

interface YourGameState {
  // ...
}

export default function YourGame() {
  const socket = useSocket();
  const [state, setState] = useState<YourGameState | null>(null);

  useEffect(() => {
    socket.on('game:state', setState);
    return () => { socket.off('game:state', setState); };
  }, [socket]);

  function handleAction() {
    socket.emit('game:input', { action: 'buzz' });
  }

  if (!state) return <div>Loading...</div>;

  return (
    <div className="game-container">
      {/* Render your game UI with regular HTML/CSS */}
      <button onClick={handleAction}>Press Me!</button>
    </div>
  );
}
```

### Key Rules for Client Components

1. **Use `useRef` for state in canvas games** — React state causes re-renders which kill animation performance. Store the latest server state in a ref and read it in the draw loop.
2. **Use `useState` for DOM-based games** — Re-renders are fine here since React handles DOM updates efficiently.
3. **Always clean up listeners** in the `useEffect` return function.
4. **Send inputs immediately** — don't debounce or throttle game inputs. The server handles rate limiting if needed.
5. **Don't compute game logic client-side** — just render what the server sends. The client is a dumb terminal.
6. **Use `socket.id` to identify "you" vs "opponent"** when rendering scores, labels, etc.

## Step 4: Register the Game

### Server Registration

In `server/src/games/registry.ts`:

```typescript
import { yourGame } from './your-game.js';

// Add to the registrations at the bottom:
gameRegistry.register(yourGame);
```

### Client Registration

In `client/src/games/registry.tsx`:

```typescript
import YourGame from './YourGame.tsx';

export const gameComponents: Record<string, ComponentType> = {
  'pong': PongGame,
  'reaction-race': ReactionRaceGame,
  'aim-trainer': AimTrainerGame,
  'your-game': YourGame,  // key must match server info.id
};
```

**The game ID in both registrations must match exactly.**

## Step 5: Add to a Game Set (Optional)

If you want the game in a specific set (not just "All"), update the set registration in `server/src/games/registry.ts`:

```typescript
gameRegistry.registerSet({
  id: 'action',
  name: 'Action Games',
  description: 'Fast-paced reflex games',
  gameIds: ['pong', 'your-game'],
});
```

Games in the "All" set (empty `gameIds`) are automatically included.

## Existing Games as Reference

| Pattern | Example | File |
|---------|---------|------|
| Canvas + keyboard input | Pong | `pong.ts` / `PongGame.tsx` |
| Canvas + mouse clicks | Aim Trainer | `aim-trainer.ts` / `AimTrainerGame.tsx` |
| DOM + click/spacebar | Reaction Race | `reaction-race.ts` / `ReactionRaceGame.tsx` |
| Timed game with countdown | Aim Trainer | `aim-trainer.ts` |
| Score-based winner | Pong, Aim Trainer | first-to-N or most-in-time |
| Instant winner (one event) | Reaction Race | single decisive moment |

## Checklist

- [ ] Server module in `server/src/games/`
  - [ ] Implements `ServerGameModule` interface
  - [ ] `cleanup()` stops all timers
  - [ ] Calls `ctx.endRound()` exactly once
  - [ ] Description includes controls
- [ ] Client component in `client/src/games/`
  - [ ] Listens on `game:state`, sends via `game:input`
  - [ ] Cleans up event listeners
  - [ ] Uses refs for canvas state (not React state)
- [ ] Registered in both server and client registries
- [ ] Game IDs match between server and client
- [ ] Works with two browser tabs locally
