# Sprite Requirements

Every game currently renders with colored rectangles and circles via Canvas 2D. This document lists every visual entity that should eventually be replaced with proper sprites/art. Sprites are loaded via `client/src/lib/sprites.ts` — the system falls back to placeholders automatically when no sprite sheet is loaded.

Player 1 (local) color: `#00ff88` (green)
Player 2 (opponent) color: `#ff4488` (pink)

Canvas size for all games: **800×500** (except Fencing which uses an 800×400 viewport over a 1600×400 arena).

---

## Shared Across Games

| Sprite | Used In | Size | Notes |
|--------|---------|------|-------|
| Player character (green) | Joust, Volleyball, Ball Brawl, Fencing, Asteroid Dodge | Varies per game | Needs left/right facing. Each game may want a distinct character or costume. |
| Opponent character (pink) | Same as above | Same | Recolored or distinct variant |
| Explosion / death effect | Asteroid Dodge, Joust | ~40×40 | Shown when a player dies |

---

## Per-Game Sprites

### Pong
| Sprite | Current | Size | Facing | Animation |
|--------|---------|------|--------|-----------|
| Paddle | Green/pink rect | 12×80 | No | No |
| Ball | White rect | 10×10 | No | No |

### Aim Trainer
| Sprite | Current | Size | Facing | Animation |
|--------|---------|------|--------|-----------|
| Target | Concentric circles (red/white/red) | ~50×50 (radius 25) | No | Could animate a pop-in |
| Crosshair (opponent) | Pink crosshair lines + circle | 20×20 | No | No |

### Joust
| Sprite | Current | Size | Facing | Animation |
|--------|---------|------|--------|-----------|
| Player (mounted bird/knight) | Green rect + white lance | 24×28 body + 10×4 lance | **Left/Right** | Could add flap animation (2-3 frames) |
| Platform | Gray rect with highlight | Variable width × 8h | No | No |

### Air Hockey
| Sprite | Current | Size | Facing | Animation |
|--------|---------|------|--------|-----------|
| Mallet | Colored circle with inner ring | Radius 20 | No | No |
| Puck | White circle | Radius 12 | No | No |
| Goal zone indicator | Translucent red rect | 6×260 | No | Could glow on goal |
| Table surface | Dark teal fill | 800×500 | No | Texture/pattern |

### Volleyball
| Sprite | Current | Size | Facing | Animation |
|--------|---------|------|--------|-----------|
| Player | Colored rect | 30×40 | No | Could add jump/idle frames |
| Ball | Yellow circle with outline | Radius 12 | No | Could add spin |
| Net | Gray rect | 6×140 | No | No |
| Court floor | Teal rect | 800×30 | No | Texture |

### Ball Brawl
| Sprite | Current | Size | Facing | Animation |
|--------|---------|------|--------|-----------|
| Player (batter) | Colored rect | 40×50 | No | Swing animation (2-3 frames) would be great |
| Ball | Colored circle (owner's color or gray) | Radius 12 | No | Glow ring at high speed |
| Swing range indicator | Dashed/solid circle | Radius 65 | No | Procedural, not a sprite |

### Fencing
| Sprite | Current | Size | Facing | Animation |
|--------|---------|------|--------|-----------|
| Player (swordsman) | Colored rect | 20×44 | **Left/Right** | Attack lunge (2 frames) |
| Sword | White/gray rect | 35×3 (extends to 45 on attack) | **Left/Right** | Extends on attack |
| Guard label (HIGH/MID/LOW) | Text above player | — | No | No |
| End zone markers | Translucent colored rects | 20×60 | No | No |

### Asteroid Dodge
| Sprite | Current | Size | Facing | Animation |
|--------|---------|------|--------|-----------|
| Player (ship) | Colored rect | 20×20 | No | No |
| Asteroid | Gray circle with outline | Radius 8–22 | No | Could rotate (2-4 frames) |
| Explosion (on death) | Translucent red circle | Radius 20 | No | Burst animation (3-4 frames) |

### Flappy Race
| Sprite | Current | Size | Facing | Animation |
|--------|---------|------|--------|-----------|
| Bird | Colored circle with white eye | Radius 12 | No | Flap animation (2-3 frames) would help a lot |
| Pipe | Green rect with lighter cap | 40w × variable h, cap 46×8 | No | No |

### Space Invaders
| Sprite | Current | Size | Facing | Animation |
|--------|---------|------|--------|-----------|
| Player ship | Colored rect with cannon | 24×16 body + 4×6 cannon | No | No |
| Invader (row 0) | Red rect with eye cutouts | 22×16 | No | Classic 2-frame wiggle |
| Invader (row 1) | Orange rect with eye cutouts | 22×16 | No | Same |
| Invader (row 2+) | Green rect with eye cutouts | 22×16 | No | Same |
| Player bullet | White rect | 3×10 | No | No |
| Invader bullet | Red rect | 3×10 | No | No |

### Cowboy Shootout
| Sprite | Current | Size | Facing | Animation |
|--------|---------|------|--------|-----------|
| Bandit (idle) | Tan rect with brown hat | 30×37 body + 38×10 hat | No | No |
| Bandit (winding up) | Red rect, red border on window | Same | No | Could flash or draw weapon |
| Player (peeking) | Colored rect with gray gun | 20×50 body + 15×4 gun | No | Peek-out animation (2 frames) |
| Cover block | Brown rect with lighter top edge | 50×55 | No | No |
| Projectile (player) | Yellow circle + trail | Radius 3 | No | No |
| Projectile (bandit) | Orange circle + trail | Radius 3 | No | No |
| Window frame | Dark rect | 58×63 | No | No |
| Building facade | Brown fill | 800×500 | No | Texture with bricks/detail |

### Arrow Sequence
| Sprite | Current | Size | Facing | Animation |
|--------|---------|------|--------|-----------|
| Arrow shapes | Procedural polygon (→↓↑←) | 36×36 | Rotated per direction | No — color-coded (green=done, white=current, gray=pending) |
| Sequence backgrounds | Translucent rect per arrow slot | 36×36 | No | No |

*Note: This game uses procedural arrow drawing, not sprites. Could be replaced with arrow sprite sheets for a polished look.*

### Rhythm Rush
| Sprite | Current | Size | Facing | Animation |
|--------|---------|------|--------|-----------|
| Arrow (falling) | Procedural polygon (←↓↑→) | 36×36 | Rotated per direction | Color changes by proximity (white→yellow→green) |
| Hit zone arrow (ghost) | Same shape, translucent | 36×36 | Per lane | No |
| Lane dividers | Thin lines | 1px wide | No | No |

*Note: Same as Arrow Sequence — procedural arrows that could be replaced with sprite sheets.*

---

## Background Images

Each game can have a background image loaded via `loadSpriteSheet('{gameId}.bg', ...)`. Current games use solid color fills as placeholders. Parallax layers are supported via `drawBackgroundLayer()`.

| Game | Fallback Color | Ideal Background |
|------|---------------|-----------------|
| Pong | `#1a1a2e` | Dark arena with neon trim |
| Aim Trainer | `#1a1a2e` | Shooting range / target gallery |
| Joust | `#1a1a2e` | Volcanic cave with lava below |
| Air Hockey | `#1a3a2e` | Air hockey table texture |
| Volleyball | `#1a1a2e` | Beach or gym court |
| Ball Brawl | `#1a1a2e` | Street / alley arena |
| Fencing | `#1a1a2e` | Castle hallway (scrolls with camera) |
| Asteroid Dodge | `#0a0a1a` | Starfield |
| Flappy Race | `#0a1628` | Sky with clouds (parallax layers) |
| Space Invaders | `#0a0a1a` | Starfield |
| Cowboy Shootout | `#3a2a1a` | Western saloon facade |
| Arrow Sequence | `#0a0a1a` | Abstract pattern |
| Rhythm Rush | `#0a0a1a` | Concert stage / neon dance floor |

---

## Priority Order for Art

1. **Characters** — Player and opponent sprites for each game (biggest visual impact)
2. **Unique game objects** — Birds, invaders, bandits, asteroids (give each game identity)
3. **Projectiles & balls** — Small but polished
4. **Backgrounds & surfaces** — Table textures, building facades, sky gradients
5. **UI elements** — Targets, crosshairs, indicators

## Sprite Sheet Format

The sprite system (`client/src/lib/sprites.ts`) expects:
- PNG sprite sheets
- Fixed frame size per sheet (e.g., 32×32, 48×48)
- Frames laid out left-to-right, top-to-bottom
- Load with `loadSpriteSheet(key, '/sprites/filename.png', frameW, frameH)`
- Draw with `drawSprite(ctx, key, x, y, w, h, { frame, facing, alpha })`

Recommended frame sizes:
- Small entities (bullets, puck): 16×16
- Medium entities (players, invaders, birds): 32×32 or 48×48
- Large entities (bandits in windows, cover blocks): 64×64
