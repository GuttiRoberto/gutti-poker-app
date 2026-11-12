// Parser pentru hand history GG Poker (cash, Hold'em No Limit). Sumele sunt ținute în cenți (întregi).

const cents = (s) => Math.round(parseFloat(String(s).replace(/,/g, '')) * 100);
const cardList = (s) => (s.match(/[2-9TJQKA][shdc]/g) ?? []);
const STREETS = ['preflop', 'flop', 'turn', 'river'];
const POS_NAMES = { 2: [], 3: [], 4: ['CO'], 5: ['HJ', 'CO'], 6: ['UTG', 'HJ', 'CO'] };

// Forma unei linii necunoscute, fără valorile concrete, pentru numărare.
function lineShape(line, names) {
  let s = line;
  for (const n of names) s = s.split(n).join('P');
  return s.replace(/\$[\d.,]+/g, '$N').replace(/\[[^\]]*\]/g, '[C]').replace(/\d+/g, 'N').slice(0, 80);
}

// Poziții: BTN, SB, BB după buton și blinduri; restul UTG/HJ/CO numărate dinspre buton înapoi.
function assignPositions(players, buttonSeat, sbName, bbName) {
  const n = players.length;
  const seats = [...players].sort((a, b) => a.seat - b.seat);
  let bi = seats.findIndex((p) => p.seat === buttonSeat);
  if (bi < 0) bi = seats.findIndex((p) => p.name === sbName) - 1; // butonul pe un loc gol
  const order = seats.map((_, i) => seats[(((bi + i) % n) + n) % n]); // de la buton, în sensul jocului
  const pos = new Map();
  if (n === 2) {
    for (const p of order) pos.set(p.name, p.name === bbName ? 'BB' : 'BTN');
    return pos;
  }
  const rest = order.filter((p) => p.name !== sbName && p.name !== bbName && p.seat !== buttonSeat);
  const names = POS_NAMES[Math.min(n, 6)] ?? [];
  for (const p of order) {
    if (p.name === sbName) pos.set(p.name, 'SB');
    else if (p.name === bbName) pos.set(p.name, 'BB');
    else if (p.seat === buttonSeat) pos.set(p.name, 'BTN');
  }
  // rest este în ordinea de joc după BB: primul este cel mai devreme
  rest.forEach((p, i) => pos.set(p.name, names[names.length - rest.length + i] ?? `EP${i + 1}`));
  return pos;
}

function parseOne(text) {
  const lines = text.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l !== '');
  if (/^Poker Hand #\S+?: Tournament #/.test(lines[0])) return { tournament: true, id: (/#(\S+?):/.exec(lines[0]) ?? [])[1] ?? '?' }; // turneele nu fac parte din analiza de cash
  // antet tolerant: după blinduri pot urma alte detalii în paranteză (ante, straddle), iar semnul $ poate lipsi
  const head = /^Poker Hand #(\S+?): (.+?) \(\$?([\d.,]+)\/\$?([\d.,]+)[^)]*\)[^0-9]*(\d{4})[/-](\d\d)[/-](\d\d)[ T](\d\d:\d\d:\d\d)/.exec(lines[0]);
  if (!head) return { error: 'antet necunoscut', id: (/#(\S+?):/.exec(lines[0]) ?? [])[1] ?? '?', sample: lines[0].slice(0, 160) };
  const h = {
    id: head[1], game: head[2], sb: cents(head[3]), bb: cents(head[4]),
    stakes: `${head[3]}/${head[4]}`, date: `${head[5]}-${head[6]}-${head[7]}T${head[8]}`,
    table: null, maxSeats: null, buttonSeat: null, players: [], heroPos: null, heroCards: [],
    flop: [], board: [], boards: [], runs: 1,
    streets: { preflop: [], flop: [], turn: [], river: [] },
    pot: null, rake: 0, fees: {}, cashDrop: 0,
    invested: {}, returned: {}, collected: {}, shown: {},
    cashout: { received: 0, risk: 0, chosen: false }, timeBank: 0,
    unknown: [], checks: {},
  };
  if (h.game !== "Hold'em No Limit") return { error: `joc nesuportat: ${h.game}`, id: h.id };

  const byName = new Map();
  const names = [];
  let state = 'head', street = 'preflop';
  let pot = 0, sbName = null, bbName = null;
  let commit = {}, current = 0;
  const folded = new Set();
  const add = (o, k, v) => (o[k] = (o[k] ?? 0) + v);
  const playerOf = (line) => {
    for (const n of names) if (line.startsWith(n) && (line[n.length] === ':' || line[n.length] === ' ')) return n;
    return null;
  };
  const put = (name, amount) => { add(h.invested, name, amount); add(commit, name, amount); pot += amount; };

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    let m;
    if (line.startsWith('*** ')) {
      if (line === '*** HOLE CARDS ***') { state = 'play'; continue; }
      if (line === '*** SUMMARY ***') { state = 'summary'; continue; }
      if (/^\*\*\* (FIRST |SECOND |THIRD )?SHOWDOWN \*\*\*$/.test(line)) { state = 'showdown'; continue; }
      if ((m = /^\*\*\* (FIRST |SECOND |THIRD )?(FLOP|TURN|RIVER) \*\*\* (.*)$/.exec(line))) {
        const run = (m[1] ?? '').trim(), st = m[2].toLowerCase(), cards = cardList(m[3]);
        if (run === '' || run === 'FIRST') {
          if (st === 'flop') h.flop = cards.slice(0, 3);
          h.board = cards;
          if (state === 'play' && STREETS.indexOf(st) > STREETS.indexOf(street)) { street = st; commit = {}; current = 0; }
        }
        continue;
      }
      h.unknown.push(line); continue;
    }
    if (state === 'head') {
      if ((m = /^Table '([^']*)' (\S+) Seat #(\d+) is the button/.exec(line))) { h.table = m[1]; h.maxSeats = m[2]; h.buttonSeat = +m[3]; continue; }
      if ((m = /^Seat (\d+): (.+) \(\$([\d.,]+) in chips\)/.exec(line))) {
        const p = { seat: +m[1], name: m[2], stack: cents(m[3]), pos: null };
        h.players.push(p); byName.set(p.name, p); names.push(p.name);
        names.sort((a, b) => b.length - a.length);
        continue;
      }
      if ((m = /^Cash Drop to Pot : total \$([\d.,]+)/.exec(line))) { h.cashDrop += cents(m[1]); pot += cents(m[1]); continue; }
    }
    if (state === 'summary') {
      if ((m = /^Total pot \$([\d.,]+)(.*)$/.exec(line))) {
        h.pot = cents(m[1]);
        for (const f of m[2].matchAll(/\| ([A-Za-z ]+?) \$([\d.,]+)/g)) h.fees[f[1]] = cents(f[2]);
        h.rake = h.fees.Rake ?? 0;
        continue;
      }
      if ((m = /^(FIRST |SECOND |THIRD )?Board \[(.*)\]/.exec(line))) {
        const cards = cardList(m[2]);
        h.boards.push(cards);
        if (!m[1] || m[1] === 'FIRST ') h.board = cards;
        continue;
      }
      if ((m = /^Hand was run (\w+) times/.exec(line))) { h.runs = { two: 2, three: 3, four: 4 }[m[1]] ?? 2; continue; }
      if ((m = /^Seat (\d+): (.+)$/.exec(line))) {
        const name = playerOf(m[2]);
        if (!name) { h.unknown.push(line); continue; }
        if (name === 'Hero') {
          const b = /bought time bank card \(\$([\d.,]+)\)/.exec(line), r = /received \(\$([\d.,]+)\) from time bank card/.exec(line);
          if (b) h.timeBank -= cents(b[1]);
          if (r) h.timeBank += cents(r[1]);
        }
        continue;
      }
      h.unknown.push(line); continue;
    }
    // state: head (blinduri), play, showdown
    if ((m = /^Dealt to (.+?)(?: \[(.*)\])?$/.exec(line)) && state === 'play') {
      if (m[1] === 'Hero' && m[2]) h.heroCards = cardList(m[2]);
      continue;
    }
    if ((m = /^Uncalled bet \(\$([\d.,]+)\) returned to (.+)$/.exec(line))) {
      const v = cents(m[1]); add(h.returned, m[2], v); pot -= v; continue;
    }
    const name = playerOf(line);
    if (name && line[name.length] === ' ' && (m = /^ collected \$([\d.,]+) from pot/.exec(line.slice(name.length)))) {
      add(h.collected, name, cents(m[1])); continue;
    }
    if (name && line[name.length] === ':') {
      const rest = line.slice(name.length + 2);
      const allin = / and is all-in$/.test(rest);
      const base = { street, player: name, potBefore: pot, toCall: Math.max(0, current - (commit[name] ?? 0)), allin };
      if ((m = /^straddle \$([\d.,]+)/.exec(rest))) { // straddle: ca blind postat, mărește suma de egalat
        const v = cents(m[1]);
        put(name, v); current = Math.max(current, commit[name]);
        h.streets.preflop.push({ ...base, type: 'post', what: 'straddle', amount: v, to: commit[name] });
        continue;
      }
      if ((m = /^posts (small blind|big blind|.+?) \$([\d.,]+)/.exec(rest))) {
        const v = cents(m[2]);
        if (m[1] === 'small blind') sbName = name; else if (m[1] === 'big blind') bbName = name;
        put(name, v);
        if (m[1] === 'small blind' || m[1] === 'big blind' || /straddle/.test(m[1])) current = Math.max(current, commit[name]);
        else commit[name] -= v; // ante sau blind mort: nu contează la suma de egalat
        h.streets.preflop.push({ ...base, type: 'post', what: m[1], amount: v, to: commit[name] });
        continue;
      }
      if (rest === 'folds') { folded.add(name); h.streets[street].push({ ...base, type: 'fold', amount: 0 }); continue; }
      if (rest === 'checks') { h.streets[street].push({ ...base, type: 'check', amount: 0 }); continue; }
      if ((m = /^calls \$([\d.,]+)/.exec(rest))) { const v = cents(m[1]); put(name, v); h.streets[street].push({ ...base, type: 'call', amount: v, to: commit[name] }); continue; }
      if ((m = /^bets \$([\d.,]+)/.exec(rest))) { const v = cents(m[1]); put(name, v); current = commit[name]; h.streets[street].push({ ...base, type: 'bet', amount: v, to: commit[name] }); continue; }
      if ((m = /^raises \$([\d.,]+) to \$([\d.,]+)/.exec(rest))) {
        const to = cents(m[2]), v = to - (commit[name] ?? 0);
        put(name, v); current = to;
        h.streets[street].push({ ...base, type: 'raise', amount: v, to });
        continue;
      }
      if ((m = /^shows \[(.*?)\]/.exec(rest))) { h.shown[name] = cardList(m[1]); continue; }
      if (rest === 'Chooses to EV Cashout') { if (name === 'Hero') h.cashout.chosen = true; continue; }
      if ((m = /^Receives Cashout \(\$([\d.,]+)\)/.exec(rest))) { if (name === 'Hero') h.cashout.received += cents(m[1]); continue; }
      if ((m = /^Pays Cashout Risk \(\$([\d.,]+)\)/.exec(rest))) { if (name === 'Hero') h.cashout.risk += cents(m[1]); continue; }
    }
    h.unknown.push(line);
  }

  if (!byName.has('Hero')) return { error: 'Hero lipsește', id: h.id };
  if (h.pot == null) return { error: 'lipsește linia Total pot', id: h.id };
  const pos = assignPositions(h.players, h.buttonSeat, sbName, bbName);
  for (const p of h.players) p.pos = pos.get(p.name) ?? null;
  h.heroPos = pos.get('Hero') ?? null;
  for (const st of STREETS) for (const a of h.streets[st]) a.pos = pos.get(a.player);

  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const inPot = sum(h.invested) - sum(h.returned) + h.cashDrop;
  h.checks.potOk = inPot === h.pot;
  h.checks.potDiff = inPot - h.pot;
  h.checks.payoutOk = sum(h.collected) + sum(h.fees) === h.pot;

  h.folded = [...folded];
  const live = h.players.filter((p) => !folded.has(p.name));
  h.showdown = live.length >= 2;
  h.heroFolded = folded.has('Hero');
  h.heroShowdown = h.showdown && !h.heroFolded;
  h.heroSawFlop = h.flop.length === 3 && !h.streets.preflop.some((a) => a.player === 'Hero' && a.type === 'fold');
  h.heroCollected = h.collected.Hero ?? 0;
  h.heroNet = h.heroCollected + h.cashout.received - h.cashout.risk - (h.invested.Hero ?? 0) + (h.returned.Hero ?? 0);
  h.heroNetBb = h.heroNet / h.bb;
  return { hand: h, shapes: h.unknown.map((l) => lineShape(l, names)) };
}

// Întoarce mâinile valide, cele respinse (cu motiv), dublurile eliminate și liniile necunoscute numărate pe formă.
export function parseHands(text, seen = new Set()) {
  const out = { hands: [], rejected: [], duplicates: 0, unknownLines: {}, total: 0, tournaments: 0 };
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const parts = clean.split(/\n(?=Poker Hand #)/);
  for (const part of parts) {
    if (!part.trim()) continue;
    if (!part.startsWith('Poker Hand #')) {
      if (part.trim()) out.rejected.push({ id: '?', reason: 'text în afara unei mâini', sample: part.trim().slice(0, 60) });
      continue;
    }
    out.total++;
    let r;
    try { r = parseOne(part); } catch (e) { r = { error: `eroare de citire: ${e.message}`, id: (/#(\S+?):/.exec(part) ?? [])[1] ?? '?' }; }
    if (r.tournament) { out.tournaments++; continue; }
    if (r.error) { out.rejected.push({ id: r.id, reason: r.error, ...(r.sample ? { sample: r.sample } : {}) }); continue; }
    if (seen.has(r.hand.id)) { out.duplicates++; continue; }
    seen.add(r.hand.id);
    for (const s of r.shapes) out.unknownLines[s] = (out.unknownLines[s] ?? 0) + 1;
    if (!r.hand.checks.potOk) { out.rejected.push({ id: r.hand.id, reason: `potul nu se verifică (diferență ${(r.hand.checks.potDiff / 100).toFixed(2)}$)` }); continue; }
    out.hands.push(r.hand);
  }
  return out;
}

export const HAND_STREETS = STREETS;
