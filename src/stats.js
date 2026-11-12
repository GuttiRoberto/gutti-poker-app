// Statistici postflop pentru Hero. Intrare: mâini parsate, fiecare cu câmpul `cls` (din classify).

const Z = 1.96;
const MIN_N = 30;

// Proporție cu interval de încredere Wilson de 95% (în procente).
export function prop(k, n) {
  if (!n) return { k, n, p: null, lo: null, hi: null, few: true };
  const p = k / n, d = 1 + (Z * Z) / n;
  const mid = (p + (Z * Z) / (2 * n)) / d, half = (Z * Math.sqrt((p * (1 - p)) / n + (Z * Z) / (4 * n * n))) / d;
  return { k, n, p: 100 * p, lo: 100 * Math.max(0, mid - half), hi: 100 * Math.min(1, mid + half), few: n < MIN_N };
}

// Ce a făcut Hero pe o stradă, raportat la primul bet al străzii.
export function heroStreet(h, st) {
  const acts = h.streets[st].filter((a) => a.type !== 'post');
  const firstBet = acts.findIndex((a) => a.type === 'bet');
  const heroIdx = acts.findIndex((a) => a.player === 'Hero');
  const v = { acted: heroIdx >= 0, open: false, bet: null, bettor: firstBet >= 0 ? acts[firstBet].player : null, faced: null, checkedFirst: false, acts: acts.filter((a) => a.player === 'Hero') };
  if (heroIdx < 0) return v;
  // „open” = Hero vorbește fără niciun bet înaintea lui (poate da check sau bet)
  v.open = firstBet < 0 || heroIdx <= firstBet;
  if (v.open && acts[heroIdx].type === 'bet') v.bet = acts[heroIdx];
  v.checkedFirst = v.open && acts[heroIdx].type === 'check';
  if (firstBet >= 0 && acts[firstBet].player !== 'Hero') {
    const j = acts.findIndex((a, i) => i > firstBet && a.player === 'Hero');
    if (j >= 0) {
      const raisedBefore = acts.slice(firstBet + 1, j).some((a) => a.type === 'raise');
      v.faced = { action: acts[j], response: acts[j].type, clean: !raisedBefore, bettor: acts[firstBet].player };
    }
  }
  return v;
}

const SIZE_BUCKETS = ['sub 40%', '40–70%', '70–100%', 'peste 100%'];
const sizeBucket = (a) => { const r = a.amount / a.potBefore; return r < 0.4 ? 0 : r < 0.7 ? 1 : r <= 1 ? 2 : 3; };

function heroLine(h) {
  const parts = [];
  for (const st of ['flop', 'turn', 'river']) {
    const a = h.streets[st].filter((x) => x.player === 'Hero').map((x) => x.type);
    if (a.length) parts.push(`${st} ${a.join('-')}`);
  }
  return parts.join(' · ') || 'fără acțiune postflop (all-in înainte de flop)';
}

export function computeStats(hands) {
  const sumBb = (list) => list.reduce((s, h) => s + h.heroNetBb, 0);
  const row = (list) => ({ n: list.length, net: sumBb(list), bb100: list.length ? (100 * sumBb(list)) / list.length : null });
  const flopHands = hands.filter((h) => h.cls.sawFlop);
  const out = { minN: MIN_N, sizeBuckets: SIZE_BUCKETS };

  out.summary = {
    all: row(hands), preflopOnly: row(hands.filter((h) => !h.cls.sawFlop)), flop: row(flopHands),
    stakes: [...new Set(hands.map((h) => h.stakes))].sort(),
    from: hands.reduce((m, h) => (!m || h.date < m ? h.date : m), null), to: hands.reduce((m, h) => (!m || h.date > m ? h.date : m), null),
  };

  // 1. Unde se duc banii
  const groups = new Map();
  for (const h of flopHands) {
    const c = h.cls, key = [c.potType, c.heroRole, c.position, c.headsUp ? 'heads-up' : 'multiway'].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(h);
  }
  out.money = [...groups].map(([key, list]) => { const [potType, role, position, players] = key.split('|'); return { potType, role, position, players, ...row(list) }; })
    .sort((a, b) => a.net - b.net);

  // 2. Ca agresor
  const agg = flopHands.filter((h) => h.cls.heroRole === 'agresor');
  const views = new Map(flopHands.map((h) => [h, { flop: heroStreet(h, 'flop'), turn: heroStreet(h, 'turn'), river: heroStreet(h, 'river') }]));
  const cbetOpp = agg.filter((h) => views.get(h).flop.open);
  const didCbet = (h) => !!views.get(h).flop.bet;
  const cb = (label, f) => { const l = cbetOpp.filter(f); return { label, ...prop(l.filter(didCbet).length, l.length) }; };
  const turnOpp = cbetOpp.filter((h) => didCbet(h) && views.get(h).turn.open);
  const turnBet = turnOpp.filter((h) => views.get(h).turn.bet);
  const riverOpp = turnBet.filter((h) => views.get(h).river.open);
  const sizes = { flop: [0, 0, 0, 0], turn: [0, 0, 0, 0], river: [0, 0, 0, 0] };
  for (const h of agg) for (const st of ['flop', 'turn', 'river']) { const b = views.get(h)[st].bet; if (b) sizes[st][sizeBucket(b)]++; }
  out.aggressor = {
    cbet: [
      cb('total', () => true),
      { ...cb('heads-up', (h) => h.cls.headsUp), ref: 'cbetFlopHU' }, cb('multiway', (h) => !h.cls.headsUp),
      cb('IP', (h) => h.cls.position === 'IP'), cb('OOP', (h) => h.cls.position === 'OOP'),
    ],
    texture: [
      ...['A', 'K', 'Q', 'J–T', '9 sau mai jos'].map((t) => cb(`carte mare ${t}`, (h) => h.cls.texture.high === t)),
      cb('board împerecheat', (h) => h.cls.texture.paired), cb('board neîmperecheat', (h) => !h.cls.texture.paired),
      ...['rainbow', 'două de o culoare', 'monoton'].map((t) => cb(t, (h) => h.cls.texture.suits === t)),
      cb('conectat', (h) => h.cls.texture.connected), cb('neconectat', (h) => !h.cls.texture.connected),
    ],
    turn: prop(turnBet.length, turnOpp.length),
    river: prop(riverOpp.filter((h) => views.get(h).river.bet).length, riverOpp.length),
    sizes,
  };

  // 3. Ca apărător
  const def = flopHands.filter((h) => h.cls.heroRole !== 'agresor');
  const frc = (list, get) => {
    const f = list.map(get), n = f.length, c = (t) => f.filter((x) => x.response === t).length;
    return { n, fold: prop(c('fold'), n), call: prop(c('call'), n), raise: prop(c('raise'), n) };
  };
  const facing = (st, extra = () => true) => def.filter((h) => { const f = views.get(h)[st].faced; return f && f.clean && extra(h, f); });
  const vsCbetHands = facing('flop', (h, f) => f.bettor === h.cls.aggressor);
  const xrOpp = def.filter((h) => { const v = views.get(h).flop; return v.checkedFirst && v.faced; });
  const aggIn = (h) => h.cls.aggressor && h.cls.flopPlayers.includes(h.cls.aggressor);
  const before = (h) => h.cls.flopPlayers.indexOf('Hero') < h.cls.flopPlayers.indexOf(h.cls.aggressor);
  const donkOpp = def.filter((h) => aggIn(h) && before(h) && views.get(h).flop.open);
  const stabOpp = def.filter((h) => aggIn(h) && !before(h) && views.get(h).flop.open &&
    h.streets.flop.some((a) => a.player === h.cls.aggressor && a.type === 'check'));
  const probeOpp = def.filter((h) => aggIn(h) && !h.streets.flop.some((a) => a.type === 'bet') && views.get(h).turn.open);
  out.defender = {
    vsCbet: { ...frc(vsCbetHands, (h) => views.get(h).flop.faced), ref: { fold: 'foldVsCbetFlop' } },
    vsTurn: frc(facing('turn'), (h) => views.get(h).turn.faced),
    vsRiver: frc(facing('river'), (h) => views.get(h).river.faced),
    checkRaise: prop(xrOpp.filter((h) => views.get(h).flop.faced.response === 'raise').length, xrOpp.length),
    donk: prop(donkOpp.filter((h) => views.get(h).flop.bet).length, donkOpp.length),
    stab: prop(stabOpp.filter((h) => views.get(h).flop.bet).length, stabOpp.length),
    probe: prop(probeOpp.filter((h) => views.get(h).turn.bet).length, probeOpp.length),
  };

  // 4. Showdown
  const sd = flopHands.filter((h) => h.heroShowdown), noSd = flopHands.filter((h) => !h.heroShowdown);
  out.showdown = {
    wtsd: { ...prop(sd.length, flopHands.length), ref: 'wtsd' },
    wsd: { ...prop(sd.filter((h) => h.heroCollected > 0).length, sd.length), ref: 'wsd' },
    wonNoSd: prop(noSd.filter((h) => h.heroCollected > 0).length, flopHands.length),
    netSd: row(sd), netNoSd: row(noSd),
  };

  // 5. Call-uri pe river
  const calls = [];
  for (const h of flopHands) {
    const a = h.streets.river.filter((x) => x.player === 'Hero' && x.type === 'call').pop();
    // rezultatul call-ului în sine: ce a încasat Hero minus suma plătită la call
    if (a) calls.push({ h, need: a.amount / (a.potBefore + a.amount), won: h.heroCollected > 0, ev: (h.heroCollected - a.amount) / h.bb });
  }
  out.riverCalls = {
    won: prop(calls.filter((c) => c.won).length, calls.length),
    need: calls.length ? (100 * calls.reduce((s, c) => s + c.need, 0)) / calls.length : null,
    callNet: calls.reduce((s, c) => s + c.ev, 0),
  };

  // 6. Beturi pe river
  const rb = { fold: 0, won: 0, lost: 0, raised: 0 }, rbHands = [];
  for (const h of flopHands) {
    const acts = h.streets.river, i = acts.findIndex((a) => a.player === 'Hero' && a.type === 'bet');
    if (i < 0) continue;
    rbHands.push(h);
    const after = acts.slice(i + 1).filter((a) => a.player !== 'Hero');
    if (after.some((a) => a.type === 'raise')) rb.raised++;
    else if (after.some((a) => a.type === 'call')) h.heroCollected > 0 ? rb.won++ : rb.lost++;
    else rb.fold++;
  }
  const nb = rbHands.length;
  out.riverBets = { n: nb, fold: prop(rb.fold, nb), won: prop(rb.won, nb), lost: prop(rb.lost, nb), raised: prop(rb.raised, nb), net: row(rbHands) };

  // 7. Linii care pierd
  const lines = new Map();
  for (const h of flopHands) { const k = heroLine(h); if (!lines.has(k)) lines.set(k, []); lines.get(k).push(h); }
  out.lines = [...lines].map(([line, list]) => ({ line, ...row(list) })).filter((l) => l.n >= 10 && l.net < 0).sort((a, b) => a.net - b.net).slice(0, 10);

  // 8. Cele mai mari mâini pierdute
  out.worst = [...hands].filter((h) => h.heroNet < 0).sort((a, b) => a.heroNetBb - b.heroNetBb).slice(0, 30);
  return out;
}

// Acțiunea completă a unei mâini, ca text lizibil (sume în bb).
export function describeHand(h) {
  const bb = (c) => `${+(c / h.bb).toFixed(1)}bb`;
  const who = (a) => (a.player === 'Hero' ? 'Hero' : a.pos ?? a.player);
  const verb = { fold: 'fold', check: 'check', call: 'call', bet: 'bet', raise: 'raise la' };
  const out = [];
  let shownCards = 0;
  for (const st of ['preflop', 'flop', 'turn', 'river']) {
    const acts = h.streets[st].filter((a) => a.type !== 'post');
    const n = { preflop: 0, flop: 3, turn: 4, river: 5 }[st];
    if (st !== 'preflop' && h.board.length < n) break;
    if (!acts.length && st !== 'preflop' && !h.showdown) break;
    const cards = st === 'preflop' ? '' : h.board.slice(shownCards, n).join(' ');
    shownCards = n;
    const potBefore = acts.length ? acts[0].potBefore : null;
    const text = acts.map((a) => `${who(a)} ${verb[a.type]}${a.type === 'fold' || a.type === 'check' ? '' : ' ' + bb(a.type === 'raise' ? a.to : a.amount)}${a.allin ? ' (all-in)' : ''}`).join(', ');
    out.push({ street: st, cards, pot: potBefore != null && st !== 'preflop' ? bb(potBefore) : null, text: text || 'fără acțiune (all-in)' });
  }
  return out;
}
