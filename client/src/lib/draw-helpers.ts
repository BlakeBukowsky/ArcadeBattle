/**
 * Shared procedural drawing helpers for Arcade Battle.
 *
 * These provide polished visuals without sprites. Character helpers
 * (drawCharacterBody, drawEnemyBody) serve as placeholders until
 * sprite art is added. Environment helpers (starfield, platforms,
 * glow circles) are intended to be permanent.
 */

// ── Character Placeholders ──

/**
 * Draw a simple humanoid character placeholder.
 * Head + body with eyes that track facing direction.
 */
export function drawCharacterBody(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  color: string,
  facing: -1 | 1 = 1,
  opts?: { alpha?: number },
): void {
  ctx.save();
  if (opts?.alpha !== undefined) ctx.globalAlpha = opts.alpha;

  const headH = h * 0.32;
  const bodyH = h - headH;
  const headW = w * 0.7;
  const headX = x + (w - headW) / 2;

  // Body
  ctx.fillStyle = color;
  ctx.fillRect(x, y + headH, w, bodyH);

  // Body highlight (left edge lighter)
  ctx.fillStyle = '#ffffff18';
  ctx.fillRect(x, y + headH, 2, bodyH);

  // Body shadow (right edge darker)
  ctx.fillStyle = '#00000022';
  ctx.fillRect(x + w - 2, y + headH, 2, bodyH);

  // Head
  ctx.fillStyle = color;
  ctx.fillRect(headX, y, headW, headH);

  // Head highlight
  ctx.fillStyle = '#ffffff22';
  ctx.fillRect(headX, y, headW, 2);

  // Eyes
  const eyeSize = Math.max(2, Math.floor(w * 0.12));
  const eyeY = y + headH * 0.4;
  const eyeOffset = facing === 1 ? headW * 0.2 : headW * 0.15;
  const eyeSpacing = headW * 0.35;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(headX + eyeOffset, eyeY, eyeSize, eyeSize);
  ctx.fillRect(headX + eyeOffset + eyeSpacing, eyeY, eyeSize, eyeSize);

  // Pupils (shifted in facing direction)
  const pupilShift = facing === 1 ? 1 : -1;
  ctx.fillStyle = '#000000';
  const pupilSize = Math.max(1, eyeSize - 1);
  ctx.fillRect(headX + eyeOffset + (pupilShift > 0 ? eyeSize - pupilSize : 0), eyeY + 1, pupilSize, pupilSize);
  ctx.fillRect(headX + eyeOffset + eyeSpacing + (pupilShift > 0 ? eyeSize - pupilSize : 0), eyeY + 1, pupilSize, pupilSize);

  ctx.restore();
}

/**
 * Draw an enemy character placeholder.
 * Angular/menacing silhouette with glowing red eyes.
 */
export function drawEnemyBody(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  color: string,
  facing: -1 | 1 = 1,
  opts?: { alpha?: number },
): void {
  ctx.save();
  if (opts?.alpha !== undefined) ctx.globalAlpha = opts.alpha;

  const headH = h * 0.3;
  const bodyH = h - headH;

  // Body — slightly wider at bottom for menacing stance
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + 2, y + headH);
  ctx.lineTo(x + w - 2, y + headH);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fill();

  // Head — angular/pointed
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);             // pointed top
  ctx.lineTo(x + w * 0.85, y + headH);  // right
  ctx.lineTo(x + w * 0.15, y + headH);  // left
  ctx.closePath();
  ctx.fill();

  // Glowing eyes
  const eyeY = y + headH * 0.55;
  const eyeSize = Math.max(2, Math.floor(w * 0.14));
  const eyeGap = w * 0.22;

  // Eye glow
  ctx.fillStyle = '#ff000044';
  ctx.fillRect(x + w / 2 - eyeGap - eyeSize, eyeY - 1, eyeSize + 2, eyeSize + 2);
  ctx.fillRect(x + w / 2 + eyeGap - 1, eyeY - 1, eyeSize + 2, eyeSize + 2);

  // Eye core
  ctx.fillStyle = '#ff4444';
  ctx.fillRect(x + w / 2 - eyeGap - eyeSize + 1, eyeY, eyeSize, eyeSize);
  ctx.fillRect(x + w / 2 + eyeGap, eyeY, eyeSize, eyeSize);

  ctx.restore();
}

// ── Environment Helpers (permanent procedural) ──

/**
 * Draw a deterministic starfield. Uses seed for stable star positions.
 * Call once per frame after drawBackground().
 */
export function drawStarfield(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  opts?: { density?: number; seed?: number; brightness?: number },
): void {
  const density = opts?.density ?? 80;
  const seed = opts?.seed ?? 12345;
  const brightness = opts?.brightness ?? 1;

  // Simple seeded pseudo-random
  let s = seed;
  function rand() {
    s = (s * 16807 + 0) % 2147483647;
    return (s & 0x7fffffff) / 2147483647;
  }

  ctx.save();
  for (let i = 0; i < density; i++) {
    const sx = rand() * w;
    const sy = rand() * h;
    const size = rand() * 1.5 + 0.5;
    const alpha = (rand() * 0.5 + 0.2) * brightness;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.fillRect(sx, sy, size, size);
  }
  ctx.restore();
}

/**
 * Draw a platform/wall block with top-edge highlight and subtle block pattern.
 */
export function drawPlatformBlock(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  color: string,
): void {
  ctx.save();

  // Main body
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);

  // Top edge highlight
  ctx.fillStyle = '#ffffff20';
  ctx.fillRect(x, y, w, Math.min(2, h));

  // Bottom edge shadow
  ctx.fillStyle = '#00000020';
  ctx.fillRect(x, y + h - 1, w, 1);

  // Subtle block lines (vertical every ~20px for wide platforms)
  if (w > 24 && h >= 6) {
    ctx.fillStyle = '#00000010';
    for (let bx = x + 20; bx < x + w; bx += 20) {
      ctx.fillRect(bx, y + 2, 1, h - 3);
    }
  }

  ctx.restore();
}

/**
 * Draw a circle with radial glow effect. Good for projectiles, explosions, targets.
 */
export function drawGlowCircle(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  color: string,
  opts?: { glowSize?: number; alpha?: number },
): void {
  ctx.save();
  if (opts?.alpha !== undefined) ctx.globalAlpha = opts.alpha;

  const glowR = r * (opts?.glowSize ?? 2);

  // Outer glow
  const grad = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, glowR);
  grad.addColorStop(0, color + '66');
  grad.addColorStop(0.5, color + '22');
  grad.addColorStop(1, color + '00');
  ctx.fillStyle = grad;
  ctx.fillRect(cx - glowR, cy - glowR, glowR * 2, glowR * 2);

  // Core circle
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Inner highlight
  ctx.beginPath();
  ctx.arc(cx - r * 0.2, cy - r * 0.2, r * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff33';
  ctx.fill();

  ctx.restore();
}

/**
 * Draw a shiny ball/sphere with highlight. Good for balls, pucks.
 */
export function drawShinySphere(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  color: string,
): void {
  ctx.save();

  // Main circle
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Highlight
  ctx.beginPath();
  ctx.arc(cx - r * 0.25, cy - r * 0.25, r * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff44';
  ctx.fill();

  ctx.restore();
}

/**
 * Draw a gradient sky. Useful for outdoor/sky-themed games.
 * topColor at y=0, bottomColor at y=h.
 */
export function drawSkyGradient(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  topColor: string,
  bottomColor: string,
): void {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, topColor);
  grad.addColorStop(1, bottomColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Draw a subtle vignette (darker edges) over the canvas.
 */
export function drawVignette(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  strength?: number,
): void {
  const s = strength ?? 0.3;
  const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgba(0,0,0,${s})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}
