import express, { Router } from 'express';
import { verifyToken } from './auth.js';
import { getDb, getMatchesForUser } from './db.js';

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
    getDb().prepare(`INSERT INTO feedback (type, user_id, game_id, game_name, round_number, rating, lobby_id) VALUES ('rating', ?, ?, ?, ?, ?, ?)`)
      .run(userId, gameId ?? null, gameName ?? null, roundNumber ?? null, rating, lobbyId ?? null);
    res.json({ ok: true });
  });

  // ── Submit Bug Report ──
  router.post('/bug', express.json(), (req, res) => {
    const userId = extractUserId(req);
    if (!userId) { res.status(401).json({ error: 'Auth required' }); return; }
    const { message, gameId, gameName, lobbyId } = req.body as { message?: string; gameId?: string; gameName?: string; lobbyId?: string; };
    if (!message || typeof message !== 'string' || message.trim().length === 0) { res.status(400).json({ error: 'Message required' }); return; }
    if (message.length > 2000) { res.status(400).json({ error: 'Message too long' }); return; }
    getDb().prepare(`INSERT INTO feedback (type, user_id, game_id, game_name, message, lobby_id) VALUES ('bug_report', ?, ?, ?, ?, ?)`)
      .run(userId, gameId ?? null, gameName ?? null, message.trim(), lobbyId ?? null);
    res.json({ ok: true });
  });

  // ── Get Feedback (JSON) ──
  router.get('/list', (req, res) => {
    if (!checkSecret(req)) { res.status(403).json({ error: 'Forbidden' }); return; }
    const type = req.query.type as string | undefined;
    const limit = Math.min(500, parseInt(req.query.limit as string) || 100);
    let query = 'SELECT * FROM feedback';
    const params: unknown[] = [];
    if (type) { query += ' WHERE type = ?'; params.push(type); }
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);
    res.json(getDb().prepare(query).all(...params));
  });

  // ── Ratings Stats ──
  router.get('/ratings', (req, res) => {
    if (!checkSecret(req)) { res.status(403).json({ error: 'Forbidden' }); return; }
    const mode = req.query.mode as string; // 'raw' or 'per-user'

    if (mode === 'per-user') {
      // Per-user average: each user's average rating per game, then average those
      const rows = getDb().prepare(`
        SELECT game_name,
          ROUND(AVG(user_avg), 2) as avg_score,
          COUNT(DISTINCT user_id) as unique_users
        FROM (
          SELECT game_name, user_id, AVG(rating) as user_avg
          FROM feedback WHERE type='rating' AND game_name IS NOT NULL
          GROUP BY game_name, user_id
        ) GROUP BY game_name ORDER BY avg_score DESC
      `).all();
      res.json(rows);
    } else {
      // Raw: total up/down per game
      const rows = getDb().prepare(`
        SELECT game_name,
          SUM(CASE WHEN rating=1 THEN 1 ELSE 0 END) as thumbs_up,
          SUM(CASE WHEN rating=-1 THEN 1 ELSE 0 END) as thumbs_down,
          COUNT(*) as total,
          ROUND(100.0 * SUM(CASE WHEN rating=1 THEN 1 ELSE 0 END) / COUNT(*), 1) as pct_positive
        FROM feedback WHERE type='rating' AND game_name IS NOT NULL
        GROUP BY game_name ORDER BY pct_positive DESC
      `).all();
      res.json(rows);
    }
  });

  // ── Match History (admin) ──
  router.get('/matches', (req, res) => {
    if (!checkSecret(req)) { res.status(403).json({ error: 'Forbidden' }); return; }
    const limit = Math.min(500, parseInt(req.query.limit as string) || 50);
    const rows = getDb().prepare('SELECT * FROM match_history ORDER BY played_at DESC LIMIT ?').all(limit);
    res.json(rows);
  });

  // ── Activity Stats ──
  router.get('/activity', (req, res) => {
    if (!checkSecret(req)) { res.status(403).json({ error: 'Forbidden' }); return; }

    const matchesHour = (getDb().prepare("SELECT COUNT(*) as c FROM match_history WHERE played_at > datetime('now', '-1 hour')").get() as { c: number }).c;
    const matchesDay = (getDb().prepare("SELECT COUNT(*) as c FROM match_history WHERE played_at > datetime('now', '-1 day')").get() as { c: number }).c;
    const matchesWeek = (getDb().prepare("SELECT COUNT(*) as c FROM match_history WHERE played_at > datetime('now', '-7 days')").get() as { c: number }).c;

    const playersHour = (getDb().prepare(`
      SELECT COUNT(DISTINCT pid) as c FROM (
        SELECT player1_id as pid FROM match_history WHERE played_at > datetime('now', '-1 hour')
        UNION ALL SELECT player2_id FROM match_history WHERE played_at > datetime('now', '-1 hour')
      )
    `).get() as { c: number }).c;

    const playersDay = (getDb().prepare(`
      SELECT COUNT(DISTINCT pid) as c FROM (
        SELECT player1_id as pid FROM match_history WHERE played_at > datetime('now', '-1 day')
        UNION ALL SELECT player2_id FROM match_history WHERE played_at > datetime('now', '-1 day')
      )
    `).get() as { c: number }).c;

    const playersWeek = (getDb().prepare(`
      SELECT COUNT(DISTINCT pid) as c FROM (
        SELECT player1_id as pid FROM match_history WHERE played_at > datetime('now', '-7 days')
        UNION ALL SELECT player2_id FROM match_history WHERE played_at > datetime('now', '-7 days')
      )
    `).get() as { c: number }).c;

    res.json({ matchesHour, matchesDay, matchesWeek, playersHour, playersDay, playersWeek });
  });

  // ── Match History (per user — public, auth required) ──
  router.get('/user-matches', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) { res.status(401).json({ error: 'Auth required' }); return; }
    const payload = verifyToken(authHeader.slice(7));
    if (!payload) { res.status(401).json({ error: 'Invalid token' }); return; }
    const matches = getMatchesForUser(payload.sub, 30);
    res.json(matches);
  });

  // ── Dashboard ──
  router.get('/view', (req, res) => {
    if (!checkSecret(req)) { res.status(403).send('Forbidden — add ?key=YOUR_SECRET'); return; }
    const key = req.query.key as string;
    res.send(dashboardHtml(key));
  });

  return router;
}

function dashboardHtml(key: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Arcade Battle Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a1a;color:#ccc;font-family:monospace;padding:20px}
h1{color:#00ff88;margin-bottom:16px}
.tabs{display:flex;gap:4px;margin-bottom:16px;border-bottom:2px solid #222;padding-bottom:4px}
.tab{padding:8px 16px;background:#1a1a2e;border:1px solid #333;border-bottom:none;border-radius:6px 6px 0 0;cursor:pointer;color:#888}
.tab.active{color:#00ff88;border-color:#00ff88;background:#00ff8815}
.panel{display:none}.panel.active{display:block}
.stats{display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap}
.stat{background:#1a1a2e;padding:12px 20px;border-radius:8px;border:1px solid #333}
.stat .val{font-size:22px;font-weight:bold;color:#00ff88}
.stat .label{font-size:11px;color:#888;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}
th{text-align:left;padding:8px;border-bottom:2px solid #333;color:#888}
td{padding:6px 8px;border-bottom:1px solid #222}
.up{color:#00ff88}.down{color:#ff4488}.bug{color:#ffaa00}
.mode-toggle{margin:8px 0;display:flex;gap:8px}
.mode-btn{padding:4px 12px;background:#1a1a2e;border:1px solid #444;border-radius:4px;color:#ccc;cursor:pointer;font-size:11px}
.mode-btn.active{border-color:#00ff88;color:#00ff88}
.pct{font-weight:bold}
.win{color:#00ff88}.loss{color:#ff4488}
h2{color:#888;margin:12px 0 8px;font-size:14px}
</style></head><body>
<h1>Arcade Battle Dashboard</h1>
<div class="tabs">
  <div class="tab active" onclick="showTab('activity')">Activity</div>
  <div class="tab" onclick="showTab('feedback')">Feedback</div>
  <div class="tab" onclick="showTab('ratings')">Ratings</div>
  <div class="tab" onclick="showTab('matches')">Match History</div>
</div>

<div id="activity" class="panel active">
  <h2>Matches</h2>
  <div class="stats" id="act-matches"></div>
  <h2>Unique Players</h2>
  <div class="stats" id="act-players"></div>
</div>

<div id="feedback" class="panel">
  <div class="stats" id="fb-stats"></div>
  <h2>All Feedback</h2>
  <div style="margin-bottom:8px"><button class="mode-btn active" onclick="loadFb('')">All</button><button class="mode-btn" onclick="loadFb('rating')">Ratings</button><button class="mode-btn" onclick="loadFb('bug_report')">Bugs</button></div>
  <table><thead><tr><th>Type</th><th>User</th><th>Game</th><th>Rnd</th><th>Rating</th><th>Message</th><th>Date</th></tr></thead><tbody id="fb-body"></tbody></table>
</div>

<div id="ratings" class="panel">
  <div class="mode-toggle"><button class="mode-btn active" onclick="loadRatings('raw')">Raw Totals</button><button class="mode-btn" onclick="loadRatings('per-user')">Per-User Average</button></div>
  <table id="ratings-table"><thead><tr id="ratings-head"></tr></thead><tbody id="ratings-body"></tbody></table>
</div>

<div id="matches" class="panel">
  <table><thead><tr><th>Player 1</th><th>Score</th><th>Player 2</th><th>Winner</th><th>Set</th><th>Games Played</th><th>Date</th></tr></thead><tbody id="match-body"></tbody></table>
</div>

<script>
const K='${key}',B='/api/feedback';
function showTab(id){document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));document.getElementById(id).classList.add('active');event.target.classList.add('active');if(id==='activity')loadActivity();if(id==='feedback'){loadFbStats();loadFb('');}if(id==='ratings')loadRatings('raw');if(id==='matches')loadMatches();}

async function loadActivity(){
  const d=await(await fetch(B+'/activity?key='+K)).json();
  document.getElementById('act-matches').innerHTML=
    '<div class="stat"><div class="val">'+d.matchesHour+'</div><div class="label">Last Hour</div></div>'+
    '<div class="stat"><div class="val">'+d.matchesDay+'</div><div class="label">Last 24h</div></div>'+
    '<div class="stat"><div class="val">'+d.matchesWeek+'</div><div class="label">Last 7 Days</div></div>';
  document.getElementById('act-players').innerHTML=
    '<div class="stat"><div class="val">'+d.playersHour+'</div><div class="label">Last Hour</div></div>'+
    '<div class="stat"><div class="val">'+d.playersDay+'</div><div class="label">Last 24h</div></div>'+
    '<div class="stat"><div class="val">'+d.playersWeek+'</div><div class="label">Last 7 Days</div></div>';
}

async function loadFbStats(){
  const [ratings,bugs]=[
    (await(await fetch(B+'/list?type=rating&key='+K+'&limit=500')).json()),
    (await(await fetch(B+'/list?type=bug_report&key='+K+'&limit=500')).json())
  ];
  const up=ratings.filter(r=>r.rating===1).length,dn=ratings.filter(r=>r.rating===-1).length;
  document.getElementById('fb-stats').innerHTML=
    '<div class="stat"><div class="val">'+ratings.length+'</div><div class="label">Ratings</div></div>'+
    '<div class="stat"><div class="val up">'+up+'</div><div class="label">Thumbs Up</div></div>'+
    '<div class="stat"><div class="val down">'+dn+'</div><div class="label">Thumbs Down</div></div>'+
    '<div class="stat"><div class="val bug">'+bugs.length+'</div><div class="label">Bug Reports</div></div>';
}

async function loadFb(type){
  const url=B+'/list?key='+K+'&limit=200'+(type?'&type='+type:'');
  const data=await(await fetch(url)).json();
  document.getElementById('fb-body').innerHTML=data.map(r=>
    '<tr><td>'+(r.type==='rating'?'\\u2b50':'\\ud83d\\udc1b')+'</td><td>'+r.user_id.slice(0,10)+'</td><td>'+(r.game_name||'-')+'</td><td>'+(r.round_number??'-')+'</td><td class="'+(r.rating===1?'up':r.rating===-1?'down':'')+'">'+({1:'\\ud83d\\udc4d','-1':'\\ud83d\\udc4e'}[r.rating]||'-')+'</td><td>'+(r.message||'-')+'</td><td>'+r.created_at+'</td></tr>'
  ).join('');
  document.querySelectorAll('#feedback .mode-btn').forEach(b=>b.classList.remove('active'));event.target.classList.add('active');
}

async function loadRatings(mode){
  const data=await(await fetch(B+'/ratings?key='+K+'&mode='+mode)).json();
  document.querySelectorAll('#ratings .mode-btn').forEach(b=>b.classList.remove('active'));event.target.classList.add('active');
  if(mode==='per-user'){
    document.getElementById('ratings-head').innerHTML='<th>Game</th><th>Avg Score (-1 to 1)</th><th>Unique Users</th>';
    document.getElementById('ratings-body').innerHTML=data.map(r=>
      '<tr><td>'+r.game_name+'</td><td class="'+(r.avg_score>0?'up':'down')+'">'+r.avg_score+'</td><td>'+r.unique_users+'</td></tr>'
    ).join('');
  } else {
    document.getElementById('ratings-head').innerHTML='<th>Game</th><th class="up">\\ud83d\\udc4d</th><th class="down">\\ud83d\\udc4e</th><th>Total</th><th>% Positive</th>';
    document.getElementById('ratings-body').innerHTML=data.map(r=>
      '<tr><td>'+r.game_name+'</td><td class="up">'+r.thumbs_up+'</td><td class="down">'+r.thumbs_down+'</td><td>'+r.total+'</td><td class="pct '+(r.pct_positive>=50?'up':'down')+'">'+r.pct_positive+'%</td></tr>'
    ).join('');
  }
}

async function loadMatches(){
  const data=await(await fetch(B+'/matches?key='+K+'&limit=100')).json();
  document.getElementById('match-body').innerHTML=data.map(m=>{
    let rounds=[];try{rounds=JSON.parse(m.rounds)}catch{}
    const games=[...new Set(rounds.map(r=>r.gameName))].join(', ');
    const isP1Win=m.winner_id===m.player1_id;
    return '<tr><td>'+m.player1_name+'</td><td>'+m.player1_score+' - '+m.player2_score+'</td><td>'+m.player2_name+'</td><td class="'+(isP1Win?'win':'loss')+'">'+(isP1Win?m.player1_name:m.player2_name)+'</td><td>'+(m.game_set||'-')+'</td><td>'+games+'</td><td>'+m.played_at+'</td></tr>';
  }).join('');
}

loadActivity();
</script></body></html>`;
}
