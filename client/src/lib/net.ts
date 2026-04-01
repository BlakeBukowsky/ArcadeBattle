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
    // Full state — strip markers and use as-is
    const { _full: _, _delta: __, ...state } = msg;
    return state as T;
  }

  // Delta — merge into current
  const { _delta: _, ...delta } = msg;
  return deepMerge(current as unknown as AnyObject, delta) as T;
}
