/**
 * Sprite rendering system for Arcade Battle.
 *
 * Supports player skins via a cascading lookup:
 *   1. "{playerId}.{spriteName}"  — player's custom skin for this sprite
 *   2. "{spriteName}"             — default sprite sheet
 *   3. placeholder               — colored shape fallback
 *
 * Usage in a game component:
 *   import { drawSprite } from '../lib/sprites';
 *   // In draw loop — pass playerId in opts.skin to enable skin lookup:
 *   drawSprite(ctx, 'ball', x, y, w, h, { color: '#fff', skin: playerId });
 *   // Without skin, just does: "ball" sheet → placeholder
 *   drawSprite(ctx, 'paddle', x, y, w, h, { color: '#00ff88' });
 *
 * Loading skins:
 *   // Load a player's custom ball sprite:
 *   loadSpriteSheet('usr_abc123.ball', '/skins/usr_abc123/ball.png', 32, 32);
 *   // Load default ball sprite:
 *   loadSpriteSheet('ball', '/sprites/ball.png', 32, 32);
 */

export type SpriteName =
  | 'player'
  | 'opponent'
  | 'ball'
  | 'bullet'
  | 'platform'
  | 'target'
  | 'invader'
  | 'bandit'
  | 'asteroid'
  | 'bird'
  | 'pipe'
  | 'mallet'
  | 'puck'
  | 'sword'
  | 'cover'
  | 'explosion'
  | 'paddle'
  | 'ship';

export interface SpriteOptions {
  color?: string;
  facing?: -1 | 1;
  frame?: number;
  alpha?: number;
  rotation?: number;
  /** Player/user ID for skin lookup. Enables the cascade: "{skin}.{name}" → "{name}" → placeholder */
  skin?: string;
}

interface SpriteSheet {
  image: HTMLImageElement;
  frameWidth: number;
  frameHeight: number;
  loaded: boolean;
}

const spriteCache = new Map<string, SpriteSheet>();

/**
 * Load a sprite sheet image. Returns a promise that resolves when loaded.
 *
 * For default sprites:  loadSpriteSheet('ball', '/sprites/ball.png', 32, 32)
 * For player skins:     loadSpriteSheet('usr_abc.ball', '/skins/usr_abc/ball.png', 32, 32)
 */
export function loadSpriteSheet(
  key: string,
  src: string,
  frameWidth: number,
  frameHeight: number,
): Promise<SpriteSheet> {
  const existing = spriteCache.get(key);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const sheet: SpriteSheet = { image: img, frameWidth, frameHeight, loaded: true };
      spriteCache.set(key, sheet);
      resolve(sheet);
    };
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Unload a sprite sheet (e.g., when a player leaves and their skins are no longer needed).
 */
export function unloadSpriteSheet(key: string): void {
  spriteCache.delete(key);
}

/**
 * Unload all skins for a specific player.
 */
export function unloadPlayerSkins(playerId: string): void {
  const prefix = `${playerId}.`;
  for (const key of spriteCache.keys()) {
    if (key.startsWith(prefix)) spriteCache.delete(key);
  }
}

/**
 * Get a loaded sprite sheet (or undefined if not loaded yet).
 */
export function getSpriteSheet(key: string): SpriteSheet | undefined {
  return spriteCache.get(key);
}

/**
 * Check if any skin sprites are loaded for a player.
 */
export function hasPlayerSkins(playerId: string): boolean {
  const prefix = `${playerId}.`;
  for (const key of spriteCache.keys()) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Resolve the sprite sheet key using the skin cascade:
 *   1. "{skin}.{name}" — player's custom skin
 *   2. "{name}"        — default sprite
 *   3. null            — no sprite found, use placeholder
 */
function resolveSheetKey(name: string, skin?: string): string | null {
  if (skin) {
    const skinKey = `${skin}.${name}`;
    const skinSheet = spriteCache.get(skinKey);
    if (skinSheet?.loaded) return skinKey;
  }

  const defaultSheet = spriteCache.get(name);
  if (defaultSheet?.loaded) return name;

  return null;
}

/**
 * Draw a sprite frame from a loaded sheet.
 */
export function drawSpriteFrame(
  ctx: CanvasRenderingContext2D,
  sheetKey: string,
  frameIndex: number,
  x: number,
  y: number,
  w: number,
  h: number,
  opts?: SpriteOptions,
): boolean {
  const sheet = spriteCache.get(sheetKey);
  if (!sheet?.loaded) return false;

  const cols = Math.floor(sheet.image.width / sheet.frameWidth);
  const sx = (frameIndex % cols) * sheet.frameWidth;
  const sy = Math.floor(frameIndex / cols) * sheet.frameHeight;

  ctx.save();
  if (opts?.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  if (opts?.facing === -1) {
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
    ctx.drawImage(sheet.image, sx, sy, sheet.frameWidth, sheet.frameHeight, 0, 0, w, h);
  } else {
    ctx.drawImage(sheet.image, sx, sy, sheet.frameWidth, sheet.frameHeight, x, y, w, h);
  }
  ctx.restore();
  return true;
}

// ── Placeholder Renderers ──

export function drawPlaceholderRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  opts?: SpriteOptions,
): void {
  ctx.save();
  if (opts?.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  ctx.fillStyle = opts?.color ?? '#888';
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

export function drawPlaceholderCircle(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  opts?: SpriteOptions,
): void {
  ctx.save();
  if (opts?.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = opts?.color ?? '#888';
  ctx.fill();
  ctx.restore();
}

export function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number, y: number,
  opts?: { color?: string; font?: string; align?: CanvasTextAlign },
): void {
  ctx.fillStyle = opts?.color ?? '#ffffff88';
  ctx.font = opts?.font ?? '10px monospace';
  ctx.textAlign = opts?.align ?? 'center';
  ctx.fillText(text, x, y);
}

/**
 * High-level sprite draw function with skin cascade.
 *
 * Lookup order:
 *   1. "{opts.skin}.{name}" — player's custom skin for this sprite
 *   2. "{name}"             — default sprite sheet
 *   3. placeholder rect     — colored rectangle fallback
 *
 * Examples:
 *   drawSprite(ctx, 'ball', x, y, 20, 20, { skin: 'usr_abc' })
 *     → tries "usr_abc.ball" sheet, then "ball" sheet, then white rect
 *
 *   drawSprite(ctx, 'paddle', x, y, 12, 80, { color: '#00ff88' })
 *     → tries "paddle" sheet, then green rect
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number, y: number, w: number, h: number,
  opts?: SpriteOptions,
): void {
  const frame = opts?.frame ?? 0;
  const key = resolveSheetKey(name, opts?.skin);

  if (key) {
    if (drawSpriteFrame(ctx, key, frame, x, y, w, h, opts)) return;
  }

  drawPlaceholderRect(ctx, x, y, w, h, opts);
}

/**
 * Same as drawSprite but for circular entities.
 * Falls back to a filled circle instead of a rectangle.
 */
export function drawSpriteCircle(
  ctx: CanvasRenderingContext2D,
  name: string,
  cx: number, cy: number, r: number,
  opts?: SpriteOptions,
): void {
  const frame = opts?.frame ?? 0;
  const key = resolveSheetKey(name, opts?.skin);

  if (key) {
    if (drawSpriteFrame(ctx, key, frame, cx - r, cy - r, r * 2, r * 2, opts)) return;
  }

  drawPlaceholderCircle(ctx, cx, cy, r, opts);
}

// ── Background Rendering ──

export interface BackgroundOptions {
  color?: string;        // fallback fill color
  scrollX?: number;      // horizontal scroll offset
  scrollY?: number;      // vertical scroll offset
  parallax?: number;     // depth multiplier (0 = fixed, 1 = full scroll, 0.5 = half speed)
  mode?: 'fill' | 'tile'; // fill = stretch to fit, tile = repeat pattern
  alpha?: number;
}

/**
 * Draw a game background.
 *
 * Lookup order:
 *   1. "{gameId}.bg" sprite sheet — game-specific background image
 *   2. "bg" sprite sheet          — global default background
 *   3. solid color fill           — opts.color fallback
 *
 * Usage:
 *   drawBackground(ctx, 'pong', 800, 500, { color: '#1a1a2e' });
 *   drawBackground(ctx, 'fencing', 800, 400, { color: '#1a1a2e', scrollX: cameraX });
 *
 * Loading:
 *   loadSpriteSheet('pong.bg', '/backgrounds/pong.png', 800, 500);
 */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  gameId: string,
  w: number, h: number,
  opts?: BackgroundOptions,
): void {
  const key = resolveSheetKey(`${gameId}.bg`) ?? resolveSheetKey('bg');

  if (key) {
    drawBgImage(ctx, key, w, h, opts);
    return;
  }

  // Fallback: solid color fill
  ctx.save();
  if (opts?.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  ctx.fillStyle = opts?.color ?? '#0a0a1a';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/**
 * Draw an additional parallax layer on top of the background.
 *
 * Lookup order:
 *   1. "{gameId}.bg-{layer}" — game-specific layer
 *   2. "bg-{layer}"          — global default layer
 *   3. no-op                 — layers are optional, no fallback
 *
 * Usage:
 *   drawBackgroundLayer(ctx, 'flappy-race', 'clouds', 800, 500, { scrollX: offset, parallax: 0.3 });
 */
export function drawBackgroundLayer(
  ctx: CanvasRenderingContext2D,
  gameId: string,
  layer: string,
  w: number, h: number,
  opts?: BackgroundOptions,
): void {
  const key = resolveSheetKey(`${gameId}.bg-${layer}`) ?? resolveSheetKey(`bg-${layer}`);
  if (!key) return; // layers are optional — no fallback

  drawBgImage(ctx, key, w, h, opts);
}

/** Internal: draw a background image with scroll/parallax/tile support. */
function drawBgImage(
  ctx: CanvasRenderingContext2D,
  sheetKey: string,
  w: number, h: number,
  opts?: BackgroundOptions,
): void {
  const sheet = spriteCache.get(sheetKey);
  if (!sheet?.loaded) return;

  const parallax = opts?.parallax ?? 1;
  const sx = (opts?.scrollX ?? 0) * parallax;
  const sy = (opts?.scrollY ?? 0) * parallax;
  const mode = opts?.mode ?? 'fill';

  ctx.save();
  if (opts?.alpha !== undefined) ctx.globalAlpha = opts.alpha;

  if (mode === 'tile') {
    // Tile the image across the viewport
    const imgW = sheet.image.width;
    const imgH = sheet.image.height;
    const offsetX = ((sx % imgW) + imgW) % imgW;
    const offsetY = ((sy % imgH) + imgH) % imgH;

    for (let x = -offsetX; x < w; x += imgW) {
      for (let y = -offsetY; y < h; y += imgH) {
        ctx.drawImage(sheet.image, x, y);
      }
    }
  } else {
    // Fill: stretch the image to cover the viewport, offset by scroll
    ctx.drawImage(sheet.image, -sx, -sy, Math.max(w, sheet.image.width), Math.max(h, sheet.image.height));
  }

  ctx.restore();
}
