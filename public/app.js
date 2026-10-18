// Legends 3v3 — app flow: title -> squad -> bracket -> whiteboard -> game -> boxscore -> champion.
import { PLAYERS, SQUADS, OFF_SCHEMES, DEF_SCHEMES, TEMPOS, squadPlayers } from '../src/roster.js';
import { Game, simulateGame, aiSchemeFor } from '../src/sim.js';
import { createWorld, COURT } from './world.js';
import { Playback } from './playback.js';
import { initAudio, resumeAudio, blip } from './audio.js';

const $ = id => document.getElementById(id);
const SCREENS = ['scr-title', 'scr-squad', 'scr-bracket', 'scr-white', 'scr-box', 'scr-champ'];
function show(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  const inGame = id === null;
  $('stage').classList.toggle('hidden', !inGame);
  for (const h of ['scorebug', 'momentum', 'schemes-live', 'gbtns', 'ticker'])
    $(h).classList.toggle('hidden', !inGame);
}
const fmtClock = c => `${Math.floor(c / 60)}:${String(Math.floor(c % 60)).padStart(2, '0')}`;

const T = {
  userSquad: null, round: 'semi', finalOpp: null, champ: null,
  game: null, pb: null, world: null,
  paused: false, inTimeout: false,
  wb: { off: 'iso', def: 'man', tempo: 'half', hot: null },
};

// ---------- world setup (lazy) ----------
function ensureWorld() {
  if (T.world) return;
  T.world = createWorld($('stage'));
  T.pb = new Playback(T.world, { onEvent: onSimEvent });
  requestAnimationFrame(frame);
}
let lastT = 0;
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016); lastT = t;
  if (!T.game || T.paused) return;
  if (T.pb.idle) {
    if (T.game.hasMore()) T.pb.push(T.game.nextPossession());
    else { endGame(); return; }
  }
  T.pb.update(dt, t / 1000);
  T.world.update(dt, t / 1000, T.world.ball.position);
}

function onSimEvent(ev) {
  const g = T.game; if (!g) return;
  $('sb-as').textContent = ev.s[0]; $('sb-bs').textContent = ev.s[1];
  $('sb-clock').textContent = fmtClock(ev.c);
  $('sb-half').textContent = ev.half === 1 ? 'H1' : ev.half === 2 ? 'H2' : 'OT' + (ev.half - 2);
  T.world.setJumbo(T.game.aId, T.game.bId, ev.s[0], ev.s[1], fmtClock(ev.c));
  if (ev.txt) {
    const d = document.createElement('div'); d.className = 'line'; d.innerHTML = `<b>${fmtClock(ev.c)}</b> ${ev.txt}`;
    const tk = $('ticker'); tk.prepend(d);
    while (tk.children.length > 4) tk.lastChild.remove();
  }
  const m = Math.max(-1, Math.min(1, g.momentumVal() / 10));
  const f = $('mo-fill');
  f.style.width = Math.abs(m) * 50 + '%';
  f.classList.toggle('neg', m < 0);
  if (ev.t === 'timeout' && ev.team === T.userSquad) $('to-count').textContent = g.teams[T.userSquad].timeouts;
}

// ---------- screens ----------
$('btn-start').onclick = () => { initAudio(); resumeAudio(); blip(); buildSquadCards(); show('scr-squad'); };

function buildSquadCards() {
  const el = $('squad-cards'); el.innerHTML = '';
  for (const sid of Object.keys(SQUADS)) {
    const sq = SQUADS[sid];
    const c = document.createElement('div'); c.className = 'card';
    c.innerHTML = `<h3 style="color:${sq.colors.sec}">${sq.name}</h3>` +
      squadPlayers(sid).map(p => `<div class="p"><b>#${p.num} ${p.name}</b> — ${p.pos}</div>`).join('');
    c.onclick = () => { blip(); T.userSquad = sid; buildBracket(); show('scr-bracket'); };
    el.appendChild(c);
  }
}

function buildBracket() {
  const others = Object.keys(SQUADS).filter(s => s !== T.userSquad);
  const ai1 = others[(Math.random() * others.length) | 0];
  const rest = others.filter(s => s !== ai1);
  T.semi2 = [rest[0], rest[1]];
  // sim the AI semifinal instantly
  const g2 = simulateGame(rest[0], rest[1], { seed: (Math.random() * 1e9) | 0, schemeA: aiSchemeFor(rest[0]), schemeB: aiSchemeFor(rest[1]) });
  T.semi2Winner = g2.winner; T.semi2Score = [g2.box().a.score, g2.box().b.score];
  $('bracket-title').textContent = 'SEMIFINAL';
  $('bracket').innerHTML = `
    <div class="bround"><h4>SEMIFINAL 1</h4>
      <div class="match">${SQUADS[T.userSquad].name}<br><span style="color:#9fb3d9">vs</span><br>${SQUADS[ai1].name}</div></div>
    <div class="bround"><h4>SEMIFINAL 2 — FINAL</h4>
      <div class="match">${SQUADS[rest[0]].name} ${T.semi2Score[0]}<br><span style="color:#9fb3d9">vs</span><br>${SQUADS[rest[1]].name} ${T.semi2Score[1]}<br><span class="w">${SQUADS[T.semi2Winner].name} advances</span></div></div>`;
  T.semi1Opp = ai1;
  T.wb.hot = squadPlayers(T.userSquad).sort((a, b) => (b.a.mid + b.a.close + b.a.three) - (a.a.mid + a.a.close + a.a.three))[0].id;
}

$('btn-towhite').onclick = () => { blip(); buildWhiteboard(false); show('scr-white'); };

function buildWhiteboard(isTimeout) {
  const mk = (el, obj, key) => {
    const box = $(el); box.innerHTML = '';
    for (const [k, v] of Object.entries(obj)) {
      const d = document.createElement('div');
      d.className = 'scheme' + (T.wb[key] === k ? ' sel' : '');
      d.innerHTML = `<h4>${v.name}</h4><p>${v.desc}</p>`;
      d.onclick = () => { blip(); T.wb[key] = k; buildWhiteboard(isTimeout); };
      box.appendChild(d);
    }
  };
  mk('w-off', OFF_SCHEMES, 'off'); mk('w-def', DEF_SCHEMES, 'def'); mk('w-tempo', TEMPOS, 'tempo');
  const hb = $('w-hot'); hb.innerHTML = '';
  for (const p of squadPlayers(T.userSquad)) {
    const d = document.createElement('div');
    d.className = 'scheme' + (T.wb.hot === p.id ? ' sel' : '');
    d.innerHTML = `<h4>#${p.num} ${p.name}</h4><p>${p.pos} — ${p.sig}</p>`;
    d.onclick = () => { blip(); T.wb.hot = p.id; buildWhiteboard(isTimeout); };
    hb.appendChild(d);
  }
  $('btn-tipoff').textContent = isTimeout ? 'RESUME GAME »' : (T.round === 'final' ? 'TIP-OFF: FINAL »' : 'TIP-OFF »');
}

$('btn-tipoff').onclick = () => {
  blip();
  if (T.inTimeout) {
    T.game.callTimeout(T.userSquad, { off: T.wb.off, def: T.wb.def, tempo: T.wb.tempo, hot: T.wb.hot });
    $('to-count').textContent = T.game.teams[T.userSquad].timeouts;
    T.inTimeout = false; T.paused = false;
    show(null);
  } else {
    startGame();
  }
};

function startGame() {
  ensureWorld();
  const opp = T.round === 'semi' ? T.semi1Opp : T.finalOpp;
  const aId = T.userSquad, bId = opp;
  const schemeA = { off: T.wb.off, def: T.wb.def, tempo: T.wb.tempo };
  const schemeB = aiSchemeFor(bId);
  T.game = new Game(aId, bId, { seed: (Math.random() * 1e9) | 0, schemeA, schemeB, hotA: T.wb.hot });
  // world players
  T.world.clearPlayers();
  T.teamOfMap = {};
  for (const pid of SQUADS[aId].players) { T.world.addPlayer(pid, SQUADS[aId].colors); T.teamOfMap[pid] = aId; }
  for (const pid of SQUADS[bId].players) { T.world.addPlayer(pid, SQUADS[bId].colors); T.teamOfMap[pid] = bId; }
  T.pb.teamOf = pid => T.teamOfMap[pid];
  T.pb.reset([...SQUADS[aId].players, ...SQUADS[bId].players]);
  // scorebug chrome
  $('sb-a').textContent = aId; $('sb-b').textContent = bId;
  $('sb-a').style.background = SQUADS[aId].colors.pri; $('sb-b').style.background = SQUADS[bId].colors.pri;
  $('to-count').textContent = '2';
  $('ticker').innerHTML = '';
  $('schemes-live').innerHTML = `<b>OFF:</b> ${OFF_SCHEMES[T.wb.off].name} &nbsp;<b>DEF:</b> ${DEF_SCHEMES[T.wb.def].name} &nbsp;<b>HOT:</b> ${PLAYERS[T.wb.hot].name.split(' ').pop()}`;
  T.paused = false;
  show(null);
}

$('btn-timeout').onclick = () => {
  if (!T.game || T.paused) return;
  if (T.game.teams[T.userSquad].timeouts <= 0) return;
  blip();
  T.paused = true; T.inTimeout = true;
  buildWhiteboard(true); show('scr-white');
};

$('btn-simend').onclick = () => {
  if (!T.game || T.paused) return;
  blip();
  T.pb.queue.length = 0; T.pb.cur = null;
  let guard = 0;
  while (T.game.hasMore() && guard++ < 600) T.game.nextPossession();
  endGame();
};

function endGame() {
  const g = T.game; if (!g) return;
  T.lastWinner = g.winner;
  // dev invariant: possessed ball must track the hand (see playback.js stats)
  if (T.pb) console.log(`[l3v3] ball-possession invariant: maxGap=${T.pb.stats.maxGap.toFixed(3)}m violations=${T.pb.stats.gapViolations}`);
  T.game = null; T.paused = true;
  const b = g.box();
  $('box-title').textContent = `FINAL — ${SQUADS[b.winner].name} WINS ${Math.max(b.a.score, b.b.score)}–${Math.min(b.a.score, b.b.score)}`;
  const tbl = t => `<h3 style="margin:8px;color:${SQUADS[t.sid].colors.sec}">${t.name} — ${t.score}</h3>
    <table class="box"><tr><th>PLAYER</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>FG</th><th>3PT</th><th>FT</th><th>TOV</th></tr>` +
    t.players.map(p => `<tr><td class="l">#${p.num} ${p.name}</td><td>${p.pts}</td><td>${p.reb}</td><td>${p.ast}</td><td>${p.stl}</td><td>${p.blk}</td><td>${p.fgm}/${p.fga}</td><td>${p.tpm}/${p.tpa}</td><td>${p.ftm}/${p.fta}</td><td>${p.tov}</td></tr>`).join('') + `</table>`;
  $('box-tables').innerHTML = tbl(b.a) + tbl(b.b);
  $('btn-next').textContent = 'CONTINUE »';
  show('scr-box');
}

$('btn-next').onclick = () => {
  blip();
  const lastWinner = T.lastWinner;
  if (T.round === 'semi') {
    if (lastWinner === T.userSquad) {
      T.round = 'final'; T.finalOpp = T.semi2Winner;
      $('bracket-title').textContent = 'THE FINAL';
      $('bracket').innerHTML = `<div class="bround"><h4>CHAMPIONSHIP</h4>
        <div class="match">${SQUADS[T.userSquad].name}<br><span style="color:#9fb3d9">vs</span><br>${SQUADS[T.finalOpp].name}</div></div>`;
      T.wb = { off: 'iso', def: 'man', tempo: 'half', hot: T.wb.hot };
      show('scr-bracket');
    } else {
      // user eliminated: sim the final between the two AI winners
      const g = simulateGame(T.semi1Opp, T.semi2Winner, { seed: (Math.random() * 1e9) | 0, schemeA: aiSchemeFor(T.semi1Opp), schemeB: aiSchemeFor(T.semi2Winner) });
      T.champ = g.winner;
      showChamp(`${SQUADS[T.champ].name} (your squad was eliminated in the semifinal)`);
    }
  } else {
    T.champ = lastWinner;
    showChamp(lastWinner === T.userSquad ? SQUADS[T.champ].name : `${SQUADS[T.champ].name} (better luck next tournament)`);
  }
};

function showChamp(txt) {
  $('champ-name').textContent = txt;
  show('scr-champ');
}
$('btn-again').onclick = () => { blip(); T.round = 'semi'; T.userSquad = null; buildSquadCards(); show('scr-squad'); };

$('loading').classList.add('hidden');
window.__l3v3 = T;
