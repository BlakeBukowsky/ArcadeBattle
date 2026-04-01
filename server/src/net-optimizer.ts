/**
 * Network optimization layer for game state emission.
 *
 * Sits between game logic and Socket.IO to reduce bandwidth:
 * 1. Send rate throttling — games run physics at 60fps but network sends at 20-30fps
 * 2. Delta compression — only send fields that changed since last send
 *
 * Games don't need to change — the optimizer wraps ctx.emit transparently.
 */

const DEFAULT_SEND_RATE = 1000 / 30; // 30 sends per second (33ms interval)

/**
 * Deep comparison that returns only the changed fields.
 * Handles nested objects, arrays, and primitives.
 * Returns null if nothing changed.
 */
function computeDelta(prev: Record<string, unknown>, next: Record<string, unknown>): Record<string, unknown> | null {
  const delta: Record<string, unknown> = {};
  let hasChanges = false;

  for (const key of Object.keys(next)) {
    const prevVal = prev[key];
    const nextVal = next[key];

    if (prevVal === nextVal) continue;

    if (
      prevVal !== null && nextVal !== null &&
      typeof prevVal === 'object' && typeof nextVal === 'object' &&
      !Array.isArray(prevVal) && !Array.isArray(nextVal)
    ) {
      // Recurse into nested objects
      const nested = computeDelta(
        prevVal as Record<string, unknown>,
        nextVal as Record<string, unknown>,
      );
      if (nested) {
        delta[key] = nested;
        hasChanges = true;
      }
    } else if (Array.isArray(prevVal) && Array.isArray(nextVal)) {
      // For arrays, always send the full array if anything changed
      // (array diffing is expensive and error-prone for game state)
      if (JSON.stringify(prevVal) !== JSON.stringify(nextVal)) {
        delta[key] = nextVal;
        hasChanges = true;
      }
    } else {
      delta[key] = nextVal;
      hasChanges = true;
    }
  }

  return hasChanges ? delta : null;
}

/**
 * Deep clone a plain object (game state is always serializable).
 */
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Creates a network-optimized emit function that wraps the raw Socket.IO emit.
 *
 * @param rawEmit The original emit function (io.to(room).emit)
 * @param sendRate Minimum ms between sends (default: 50ms = 20fps)
 */
export function createOptimizedEmitter(
  rawEmit: (event: string, data: unknown) => void,
  sendRate: number = DEFAULT_SEND_RATE,
): {
  emit: (event: string, data: unknown) => void;
  cleanup: () => void;
} {
  let lastSendTime = 0;
  let lastSentState: Record<string, unknown> | null = null;
  let pendingState: unknown = null;
  let pendingEvent: string | null = null;
  let sendTimer: ReturnType<typeof setTimeout> | null = null;
  let fullSendCounter = 0;
  const FULL_SEND_INTERVAL = 10; // send full state every N sends for reliability

  function doSend(): void {
    if (!pendingEvent || pendingState === null) return;

    const state = pendingState as Record<string, unknown>;
    fullSendCounter++;

    // Every Nth send, or if no previous state, send full state
    const sendFull = !lastSentState || fullSendCounter >= FULL_SEND_INTERVAL;

    if (sendFull) {
      rawEmit(pendingEvent, { _full: true, ...state });
      lastSentState = deepClone(state);
      fullSendCounter = 0;
    } else {
      // Compute delta
      const delta = computeDelta(lastSentState!, state);
      if (delta) {
        rawEmit(pendingEvent, { _delta: true, ...delta });
        lastSentState = deepClone(state);
      }
      // If no delta, skip the send entirely (nothing changed)
    }

    lastSendTime = Date.now();
    pendingState = null;
    pendingEvent = null;
  }

  function emit(event: string, data: unknown): void {
    // Non-game-state events pass through immediately
    if (event !== 'game:state') {
      rawEmit(event, data);
      return;
    }

    // Buffer the latest state
    pendingEvent = event;
    pendingState = data;

    const now = Date.now();
    const timeSinceLastSend = now - lastSendTime;

    if (timeSinceLastSend >= sendRate) {
      // Enough time has passed — send immediately
      doSend();
    } else if (!sendTimer) {
      // Schedule a send for when the interval elapses
      sendTimer = setTimeout(() => {
        sendTimer = null;
        doSend();
      }, sendRate - timeSinceLastSend);
    }
    // Otherwise, a timer is already pending — the latest state will be sent when it fires
  }

  function cleanup(): void {
    if (sendTimer) {
      clearTimeout(sendTimer);
      sendTimer = null;
    }
    // Flush any pending state
    if (pendingState) doSend();
    lastSentState = null;
  }

  return { emit, cleanup };
}
