import express, { Router } from 'express';
import { verifyToken } from './auth.js';
import { getDb } from './db.js';

const FEEDBACK_SECRET = process.env.FEEDBACK_SECRET || 'dev-feedback-key';

function extractUserId(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const payload = verifyToken(authHeader.slice(7));
    if (payload) return payload.sub;
  }
  const guestId = (req.body as { guestId?: string })?.guestId;
  if (typeof guestId === 'string' && guestId.startsWith('guest_')) return guestId;
  return null;
}

function checkSecret(req: express.Request): boolean {
  const key = (req.query.key as string) || req.headers['x-feedback-key'];
  return key === FEEDBACK_SECRET;
}

export function createFeedbackRouter(): Router {
  const router = Router();

  // ── Submit Rating ──
  router.post('/rating', express.json(), (req, res) => {
    const userId = extractUserId(req);
    if (!userId) { res.status(401).json({ error: 'Auth required' }); return; }

    const { gameId, gameName, roundNumber, rating, lobbyId } = req.body as {
      gameId?: string; gameName?: string; roundNumber?: number; rating?: number; lobbyId?: string;
    };

    if (rating !== 1 && rating !== -1) { res.status(400).json({ error: 'Rating must be 1 or -1' }); return; }

    getDb().prepare(`
      INSERT INTO feedback (type, user_id, game_id, game_name, round_number, rating, lobby_id)
      VALUES ('rating', ?, ?, ?, ?, ?, ?)
    `).run(userId, gameId ?? null, gameName ?? null, roundNumber ?? null, rating, lobbyId ?? null);

    res.json({ ok: true });
  });

  // ── Submit Bug Report ──
  router.post('/bug', express.json(), (req, res) => {
    const userId = extractUserId(req);
    if (!userId) { res.status(401).json({ error: 'Auth required' }); return; }

    const { message, gameId, gameName, lobbyId } = req.body as {
      message?: string; gameId?: string; gameName?: string; lobbyId?: string;
    };

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({ error: 'Message required' }); return;
    }
    if (message.length > 2000) { res.status(400).json({ error: 'Message too long' }); return; }

    getDb().prepare(`
      INSERT INTO feedback (type, user_id, game_id, game_name, message, lobby_id)
      VALUES ('bug_report', ?, ?, ?, ?, ?)
    `).run(userId, gameId ?? null, gameName ?? null, message.trim(), lobbyId ?? null);

    res.json({ ok: true });
  });

  // ── Get Feedback (JSON) ──
  router.get('/', (req, res) => {
    if (!checkSecret(req)) { res.status(403).json({ error: 'Forbidden' }); return; }

    const type = req.query.type as string | undefined;
    const limit = Math.min(500, parseInt(req.query.limit as string) || 100);
    const offset = parseInt(req.query.offset as string) || 0;

    let query = 'SELECT * FROM feedback';
    const params: unknown[] = [];
    if (type) { query += ' WHERE type = ?'; params.push(type); }
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = getDb().prepare(query).all(...params);
    res.json(rows);
  });

  // ── Stats ──
  router.get('/stats', (req, res) => {
    if (!checkSecret(req)) { res.status(403).json({ error: 'Forbidden' }); return; }

    const totalRatings = (getDb().prepare("SELECT COUNT(*) as c FROM feedback WHERE type='rating'").get() as { c: number }).c;
    const thumbsUp = (getDb().prepare("SELECT COUNT(*) as c FROM feedback WHERE type='rating' AND rating=1").get() as { c: number }).c;
    const thumbsDown = (getDb().prepare("SELECT COUNT(*) as c FROM feedback WHERE type='rating' AND rating=-1").get() as { c: number }).c;
    const totalBugs = (getDb().prepare("SELECT COUNT(*) as c FROM feedback WHERE type='bug_report'").get() as { c: number }).c;

    const byGame = getDb().prepare(`
      SELECT game_name,
        SUM(CASE WHEN rating=1 THEN 1 ELSE 0 END) as up,
        SUM(CASE WHEN rating=-1 THEN 1 ELSE 0 END) as down
      FROM feedback WHERE type='rating' AND game_name IS NOT NULL
      GROUP BY game_name ORDER BY (up - down) DESC
    `).all() as { game_name: string; up: number; down: number }[];

    res.json({ totalRatings, thumbsUp, thumbsDown, totalBugs, ratingsByGame: byGame });
  });

  // ── Dashboard View ──
  router.get('/view', (req, res) => {
    if (!checkSecret(req)) { res.status(403).send('Forbidden — add ?key=YOUR_SECRET'); return; }

    const key = req.query.key as string;
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Feedback Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a1a;color:#ccc;font-family:monospace;padding:20px}
h1{color:#00ff88;margin-bottom:16px}
.stats{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap}
.stat{background:#1a1a2e;padding:12px 20px;border-radius:8px;border:1px solid #333}
.stat .val{font-size:24px;font-weight:bold;color:#00ff88}
.stat .label{font-size:11px;color:#888;margin-top:4px}
.filters{margin-bottom:12px;display:flex;gap:8px}
.filters button{padding:4px 12px;background:#1a1a2e;border:1px solid #444;border-radius:4px;color:#ccc;cursor:pointer}
.filters button.active{border-color:#00ff88;color:#00ff88}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;padding:8px;border-bottom:2px solid #333;color:#888}
td{padding:6px 8px;border-bottom:1px solid #222}
.up{color:#00ff88}.down{color:#ff4488}
.bug{color:#ffaa00}
.game-row{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.game-card{background:#1a1a2e;padding:8px 14px;border-radius:6px;border:1px solid #333;font-size:12px}
.game-card .name{font-weight:bold;color:#fff}
</style></head><body>
<h1>Arcade Battle — Feedback Dashboard</h1>
<div class="stats" id="stats"></div>
<h2 style="margin:16px 0 8px;color:#888">Per-Game Ratings</h2>
<div class="game-row" id="games"></div>
<h2 style="margin:16px 0 8px;color:#888">All Feedback</h2>
<div class="filters" id="filters"></div>
<table><thead><tr><th>Type</th><th>User</th><th>Game</th><th>Rnd</th><th>Rating</th><th>Message</th><th>Date</th></tr></thead><tbody id="tbody"></tbody></table>
<script>
const key='${key}';
async function load(filter){
  const url='/api/feedback'+(filter?'?type='+filter+'&key='+key:'?key='+key)+'&limit=500';
  const data=await(await fetch(url)).json();
  const tb=document.getElementById('tbody');
  tb.innerHTML=data.map(r=>'<tr><td>'+(r.type==='rating'?'⭐':'🐛')+'</td><td>'+r.user_id.slice(0,10)+'</td><td>'+(r.game_name||'-')+'</td><td>'+(r.round_number??'-')+'</td><td class="'+(r.rating===1?'up':r.rating===-1?'down':'')+'">'+({1:'👍','-1':'👎'}[r.rating]||'-')+'</td><td>'+(r.message||'-')+'</td><td>'+r.created_at+'</td></tr>').join('');
}
async function loadStats(){
  const s=await(await fetch('/api/feedback/stats?key='+key)).json();
  document.getElementById('stats').innerHTML=
    '<div class="stat"><div class="val">'+s.totalRatings+'</div><div class="label">Total Ratings</div></div>'+
    '<div class="stat"><div class="val up">'+s.thumbsUp+'</div><div class="label">Thumbs Up</div></div>'+
    '<div class="stat"><div class="val down">'+s.thumbsDown+'</div><div class="label">Thumbs Down</div></div>'+
    '<div class="stat"><div class="val bug">'+s.totalBugs+'</div><div class="label">Bug Reports</div></div>';
  document.getElementById('games').innerHTML=s.ratingsByGame.map(g=>
    '<div class="game-card"><span class="name">'+g.game_name+'</span> <span class="up">👍'+g.up+'</span> <span class="down">👎'+g.down+'</span></div>'
  ).join('');
}
document.getElementById('filters').innerHTML=['all','rating','bug_report'].map(f=>
  '<button onclick="load(\\''+( f==='all'?'':f)+'\\');this.parentNode.querySelectorAll(\\'button\\').forEach(b=>b.classList.remove(\\'active\\'));this.classList.add(\\'active\\')" class="'+(f==='all'?'active':'')+'">'+{all:'All',rating:'Ratings',bug_report:'Bugs'}[f]+'</button>'
).join('');
loadStats();load('');
</script></body></html>`);
  });

  return router;
}
