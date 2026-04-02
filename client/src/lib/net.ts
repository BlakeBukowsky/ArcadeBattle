/**
 * Client-side network utilities for handling optimized game state.
 *
 * The server sends two types of game:state messages:
 *   { _full: true, ...fullState }   — complete state (sent periodically for reliability)
 *   { _delta: true, ...changes }    — only fields that changed since last send
 *
 * Use applyStateUpdate() to merge either type into the current state.
 *
 * Usage in a game component:
 *   const stateRef = useRef<GameState | null>(null);
 *
 *   socket.on('game:state', (data: unknown) => {
 *     stateRef.current = applyStateUpdate(stateRef.current, data);
 *   });
 */

type AnyObject = { [key: string]: unknown };

/**
 * Deep merge a delta into an existing state object.
 */
function deepMerge(base: AnyObject, delta: AnyObject): AnyObject {
  const result: AnyObject = { ...base };

  for (const key of Object.keys(delta)) {
    if (key === '_delta' || key === '_full') continue;

    const baseVal = base[key];
    const deltaVal = delta[key];

    if (
      baseVal !== null && baseVal !== undefined &&
      deltaVal !== null && deltaVal !== undefined &&
      typeof baseVal === 'object' && typeof deltaVal === 'object' &&
      !Array.isArray(baseVal) && !Array.isArray(deltaVal)
    ) {
      result[key] = deepMerge(baseVal as AnyObject, deltaVal as AnyObject);
    } else {
      result[key] = deltaVal;
    }
  }

  return result;
}

/**
 * Apply a state update (full or delta) to the current state.
 *
 * @param current The current game state (null on first update)
 * @param update The incoming message from the server (full or delta)
 * @returns The new complete state, cast to T
 */
export function applyStateUpdate<T>(current: T | null, update: unknown): T {
  const msg = update as AnyObject;

  if (msg._full || !current) {
    const { _full: _, _delta: __, ...state } = msg;
    return state as T;
  }

  const { _delta: _, ...delta } = msg;
  return deepMerge(current as unknown as AnyObject, delta) as T;
}

// ── Client-side Interpolation ──

/**
 * Interpolation buffer that smoothly blends between server state updates.
 * Games receive state at ~30fps but render at 60fps. This fills the gaps
 * by lerping numeric values between the previous and current server states.
 *
 * Usage:
 *   const interp = useRef(new StateBuffer<GameState>()).current;
 *
 *   // On server update:
 *   socket.on('game:state', (data) => {
 *     interp.push(applyStateUpdate(interp.latest(), data));
 *   });
 *
 *   // In draw loop:
 *   const state = interp.interpolate();
 */
export class StateBuffer<T> {
  private prev: T | null = null;
  private current: T | null = null;
  private lastUpdateTime = 0;
  private updateInterval = 33; // estimated server send interval (ms)

  /** Push a new server state snapshot. */
  push(state: T): void {
    const now = Date.now();
    if (this.current !== null) {
      const dt = now - this.lastUpdateTime;
      // Smooth the interval estimate
      if (dt > 5 && dt < 200) {
        this.updateInterval = this.updateInterval * 0.7 + dt * 0.3;
      }
    }
    this.prev = this.current;
    this.current = state;
    this.lastUpdateTime = now;
  }

  /** Get the latest raw state (for applyStateUpdate chaining). */
  latest(): T | null {
    return this.current;
  }

  /**
   * Get an interpolated state for smooth rendering.
   * Lerps all numeric fields in the top two levels between prev and current.
   */
  interpolate(): T | null {
    if (!this.current) return null;
    if (!this.prev) return this.current;

    const elapsed = Date.now() - this.lastUpdateTime;
    const t = Math.min(1, elapsed / this.updateInterval);

    return lerpState(this.prev, this.current, t);
  }
}

/** Lerp between two state objects. Only interpolates numbers; copies everything else from `b`. */
function lerpState<T>(a: T, b: T, t: number): T {
  if (a === null || b === null) return b;
  if (typeof a !== 'object' || typeof b !== 'object') return b;
  if (Array.isArray(a) || Array.isArray(b)) return b;

  const result = { ...(b as AnyObject) } as AnyObject;

  for (const key of Object.keys(result)) {
    const av = (a as AnyObject)[key];
    const bv = result[key];

    if (typeof av === 'number' && typeof bv === 'number') {
      // Don't interpolate integers (scores, counts, IDs) — they snap
      // Only lerp values that have fractional parts (positions, velocities)
      if (Number.isInteger(av) && Number.isInteger(bv)) {
        result[key] = bv; // snap
      } else if (Math.abs(bv - av) > 200) {
        result[key] = bv; // snap on large jumps (screen wrapping)
      } else {
        result[key] = av + (bv - av) * t; // lerp
      }
    } else if (
      av && bv &&
      typeof av === 'object' && typeof bv === 'object' &&
      !Array.isArray(av) && !Array.isArray(bv)
    ) {
      result[key] = lerpState(av, bv, t);
    }
    // Non-numeric fields snap to current value (strings, booleans, arrays)
  }

  return result as T;
}
