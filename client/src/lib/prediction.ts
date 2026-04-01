/**
 * Client-side prediction utilities for reducing perceived input lag.
 *
 * The server is still authoritative — these utilities let the client
 * apply inputs locally for instant feedback, then smoothly correct
 * toward the server's state when it arrives.
 *
 * Usage in a game component:
 *   const predictor = useRef(new PositionPredictor()).current;
 *
 *   // On server state update:
 *   predictor.setServerPosition(serverState.players[myId].x, serverState.players[myId].y);
 *
 *   // On local input:
 *   predictor.applyInput(dx, dy);
 *
 *   // In draw loop (use predicted position for local player):
 *   const { x, y } = predictor.getPosition();
 */

/**
 * Smoothly tracks a position with client-side prediction.
 * Applies local inputs instantly, lerps toward server corrections.
 */
export class PositionPredictor {
  private serverX = 0;
  private serverY = 0;
  private localX = 0;
  private localY = 0;
  private correctionRate: number;

  /**
   * @param correctionRate How fast to snap toward server state (0-1).
   *   0.15 = smooth, 0.3 = responsive, 1 = no prediction (snap to server)
   */
  constructor(correctionRate = 0.2) {
    this.correctionRate = correctionRate;
  }

  /** Called when server state arrives. */
  setServerPosition(x: number, y: number): void {
    this.serverX = x;
    this.serverY = y;
  }

  /** Apply a local input delta instantly. */
  applyInput(dx: number, dy: number): void {
    this.localX += dx;
    this.localY += dy;
  }

  /** Set local position directly (e.g., for mouse-based games). */
  setLocalPosition(x: number, y: number): void {
    this.localX = x;
    this.localY = y;
  }

  /**
   * Get the predicted position. Call each frame.
   * Lerps local position toward server position.
   */
  getPosition(): { x: number; y: number } {
    // Blend toward server state
    this.localX += (this.serverX - this.localX) * this.correctionRate;
    this.localY += (this.serverY - this.localY) * this.correctionRate;
    return { x: this.localX, y: this.localY };
  }

  /** Reset to a specific position (e.g., on respawn). */
  reset(x: number, y: number): void {
    this.serverX = x;
    this.serverY = y;
    this.localX = x;
    this.localY = y;
  }
}

/**
 * Interpolates opponent positions between server updates for smoother visuals.
 * Server sends state at 30-60fps but render runs at 60fps — this fills the gaps.
 */
export class StateInterpolator<T> {
  private prev: T | null = null;
  private current: T | null = null;
  private lastUpdateTime = 0;
  private updateInterval = 1000 / 30; // assumed server tick rate

  /** Call when new server state arrives. */
  pushState(state: T): void {
    const now = Date.now();
    if (this.current) {
      this.updateInterval = Math.max(8, now - this.lastUpdateTime);
    }
    this.prev = this.current;
    this.current = state;
    this.lastUpdateTime = now;
  }

  /**
   * Get interpolated state. Returns the current state with a blend factor
   * that can be used for interpolation in the render loop.
   *
   * @returns { state, blend } where blend is 0-1 progress between prev and current
   */
  getState(): { state: T | null; prev: T | null; blend: number } {
    const elapsed = Date.now() - this.lastUpdateTime;
    const blend = Math.min(1, elapsed / this.updateInterval);
    return { state: this.current, prev: this.prev, blend };
  }
}

/**
 * Linear interpolation helper.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
