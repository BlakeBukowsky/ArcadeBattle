# Sprite Requirements

**Policy: Player characters and enemies are the priority for sprite art.** Everything else (platforms, projectiles, balls, backgrounds, UI) uses polished procedural rendering via Canvas 2D and may stay that way permanently.

The sprite API (`drawSprite`/`drawSpriteCircle`) is used for all entities — when no sprite sheet is loaded, characters get a humanoid body placeholder (via `drawCharacterBody`/`drawEnemyBody` from `draw-helpers.ts`) and everything else gets enhanced colored shapes with highlights and depth.

Player 1 (local) color: `#00ff88` (green)
Player 2 (opponent) color: `#ff4488` (pink)

Canvas size: **800x500** for all games.

---

## Shared Across Games

| Sprite | Used In | Notes |
|--------|---------|-------|
| Player character (green) | Joust, Volleyball, Rounds, Asteroids, Cave Dive, Balance, Pong | Needs left/right facing in some games |
| Opponent character (pink) | Same as above | Recolored variant |
| Explosion / death | Asteroid Dodge, Asteroids PvP | Shown on player death |

---

## Per-Game Sprites

### Pong
- Paddle (12x80, green/pink), Ball (10x10, white)

### Aim Trainer
- Target (concentric circles, red/white/red, ~50x50), Opponent crosshair

### Joust (4 random layouts)
- Player with lance (24x28 + 10x4 lance), Platform (variable width x 8h)

### Air Hockey
- Mallet (radius 20, green/pink), Puck (radius 12, white), Goal zones, Table surface

### Volleyball
- Player (40x52), Ball (radius 12, yellow), Net (6x140)

### Asteroid Dodge (split-screen)
- Ship (20x20), Asteroid (radius 8-22, gray), Explosion

### Flappy Race (split-screen)
- Bird (radius 12, with eye), Pipe (40w, green with caps)

### Space Invaders (split-screen)
- Player ship (24x16 + cannon), Invader (22x16, 3 color rows), Bullets

### Cowboy Shootout
- Bandit (body + hat in window), Player (peeking from cover), Cover block, Projectiles, Window frames, Building facade

### Arrow Sequence / Rhythm Rush
- Procedural arrow shapes — could be replaced with arrow sprite sheet. 4 colors: up=green, down=blue, left=red, right=yellow

### Typing Race
- No game sprites (text rendering only)

### Memory Arrows
- Same 4 colored arrows as Arrow Sequence/Rhythm

### Tanks (4 random layouts)
- Tank body (20x24, rotated), Barrel, Turret dot, Bullet (radius 5), Wall blocks

### Asteroids PvP
- Ship triangle (radius 12, rotated), Asteroids (3 sizes: large/medium/small), Thrust flame, Bullets

### Space Boss (split-screen)
- Player ship (triangle, 14x18), Boss (80x40 with engine glow), Projectiles (radius 3, pink), Player bullets

### Cave Dive (split-screen)
- Player (12x16), Rock tiles (24x24 with texture), Spike triangles, Exit door, Patrol enemies (10x12 with eyes)

### Racing
- Car (12w x 20h long axis, rotated), Windshield, Drift sparks, Track surface, Checkpoints

### Balance (split-screen, fog of war)
- Player (8x8), Path tiles (16x16), End zone marker

### Quilt (split-screen)
- Puzzle pieces (colored shapes in tray and grid), Grid cells

### Word Guess (split-screen)
- Letter tiles (42x42, Wordle-style green/yellow/gray)

### Rounds (5 random maps)
- Player (16x22 with rotating gun barrel), Bullet (radius 4 with trail), Platforms, Aim line

### Control Panel (split-screen)
- Red button (radius 14), Lever (6x30 shaft + knob), Slider (2-tile-wide track + handle), Knob (radius 12 with position dot), Panel frame

---

## Background Images

Each game can load a background via `loadSpriteSheet('{gameId}.bg', ...)`.

| Game | Fallback Color | Ideal Background |
|------|---------------|-----------------|
| Pong | `#1a1a2e` | Dark arena with neon trim |
| Aim Trainer | `#1a1a2e` | Shooting range |
| Joust | `#1a1a2e` | Volcanic cave |
| Air Hockey | `#1a3a2e` | Air hockey table texture |
| Volleyball | `#1a1a2e` | Beach or gym court |
| Asteroid Dodge | `#0a0a1a` | Starfield |
| Flappy Race | `#0a1628` | Sky with clouds (parallax layers) |
| Space Invaders | `#0a0a1a` | Starfield |
| Cowboy Shootout | `#3a2a1a` | Western saloon facade |
| Arrow Sequence | `#0a0a1a` | Abstract pattern |
| Rhythm Rush | `#0a0a1a` | Concert stage |
| Typing Race | `#0a0a1a` | Office / desk |
| Memory Arrows | `#0a0a1a` | Brain pattern |
| Tanks | `#1a1a1a` | Concrete arena |
| Asteroids PvP | `#050510` | Deep space |
| Space Boss | `#020010` | Nebula |
| Cave Dive | `#0a0808` | Cave rock texture |
| Racing | `#1a3a1a` | Grass field |
| Balance | `#0a0a1a` | Void with faint grid |
| Quilt | `#12100a` | Wooden table |
| Word Guess | `#121213` | Wordle dark theme |
| Rounds | `#12101a` | Arena floor |
| Control Panel | `#1a1a20` | Spaceship interior |

---

## Priority Order for Art

1. **Player characters** — Humanoid player sprites (currently using `drawCharacterBody` placeholder)
2. **Enemies** — Invaders, bandits, bosses (currently using `drawEnemyBody` placeholder)
3. **Player-avatar objects** — Paddles (Pong), mallets (Air Hockey), birds (Flappy), ships (Asteroid Dodge)
4. **Backgrounds** — Optional; procedural backgrounds with starfields, gradients, and atmospheric effects are already in place
5. **Everything else** — Platforms, projectiles, balls, UI are procedural and look good as-is

## Sprite Sheet Format

```typescript
loadSpriteSheet('ball', '/sprites/ball.png', 32, 32);           // default
loadSpriteSheet('usr_abc.ball', '/skins/usr_abc/ball.png', 32, 32); // player skin
drawSprite(ctx, 'ball', x, y, w, h, { skin: playerId });        // cascading lookup
```

Recommended frame sizes: 16x16 (bullets), 32x32 or 48x48 (players/objects), 64x64 (large entities)
