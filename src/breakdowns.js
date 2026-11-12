// Defalcări suplimentare (pasul 4). Intrare: mâini parsate, fiecare cu câmpul `cls`.

const POSITIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
export const SMALL_SAMPLE = 200;

const bdRow = (list) => {
  const net = list.reduce((s, h) => s + h.heroNetBb, 0);
  return { n: list.length, net, bb100: list.length ? (100 * net) / list.length : null, small: list.length < SMALL_SAMPLE };
};
const heroBlindBb = (h) => h.streets.preflop.filter((a) => a.player === 'Hero' && a.type === 'post').reduce((s, a) => s + a.amount, 0) / h.bb;
const groupBy = (list, key) => { const m = new Map(); for (const x of list) { const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };

// bb/100 cu interval de încredere de 95% din deviația standard reală a rezultatelor pe mână.
export function winrateCi(hands) {
  const n = hands.length;
  if (n < 2) return { n, bb100: null, sd: null, lo: null, hi: null };
  const mean = hands.reduce((s, h) => s + h.heroNetBb, 0) / n;
  const sd = Math.sqrt(hands.reduce((s, h) => s + (h.heroNetBb - mean) ** 2, 0) / (n - 1));
  const half = (1.96 * sd) / Math.sqrt(n);
  return { n, bb100: 100 * mean, sd, sd100: sd * 10, lo: 100 * (mean - half), hi: 100 * (mean + half), small: n < SMALL_SAMPLE };
}

export function computeBreakdowns(hands) {
  const out = { smallSample: SMALL_SAMPLE };
  out.total = { ...bdRow(hands), usd: hands.reduce((s, h) => s + h.heroNet, 0) / 100, ci: winrateCi(hands) };

  // 1. Pe miză: bb se calculează pe fiecare mână, cu big blind-ul acelei mâini
  out.byStake = [...groupBy(hands, (h) => h.stakes)].sort((a, b) => a[1][0].bb - b[1][0].bb)
    .map(([stakes, list]) => ({ stakes, bb: list[0].bb / 100, ...bdRow(list), usd: list.reduce((s, h) => s + h.heroNet, 0) / 100, ci: winrateCi(list) }));

  // 2. Mâini terminate preflop, pe poziție, cu blindurile postate
  const pre = hands.filter((h) => !h.cls.sawFlop);
  const withBlinds = (list) => { const r = bdRow(list), blinds = list.reduce((s, h) => s + heroBlindBb(h), 0); return { ...r, blinds, netNoBlinds: r.net + blinds }; };
  const posOf = (h) => (POSITIONS.includes(h.heroPos) ? h.heroPos : 'altă poziție');
  out.preflop = {
    total: withBlinds(pre),
    byPos: [...POSITIONS, 'altă poziție'].map((pos) => ({ pos, ...withBlinds(pre.filter((h) => posOf(h) === pos)) })).filter((r) => r.n),
    blinds: withBlinds(pre.filter((h) => h.heroPos === 'SB' || h.heroPos === 'BB')),
    others: withBlinds(pre.filter((h) => h.heroPos !== 'SB' && h.heroPos !== 'BB')),
    blindsAllHands: hands.reduce((s, h) => s + heroBlindBb(h), 0),
  };

  // 3. Single-raised, caller, OOP, heads-up: pe poziția lui Hero și a celui care a deschis
  const srp = hands.filter((h) => h.cls.sawFlop && h.cls.potType === 'single-raised' && h.cls.heroRole === 'caller' && h.cls.position === 'OOP' && h.cls.headsUp);
  const vsRef = (list, heroPos) => {
    // reperul „fold la tot”: Hero pierde doar blindul postat (1 bb din BB; 0,5 bb din SB la NL2, 0,4 bb la NL5)
    const r = bdRow(list);
    if (heroPos !== 'BB' && heroPos !== 'SB') return { ...r, ref: null, diff: null, diffPerHand: null };
    const ref = -list.reduce((s, h) => s + heroBlindBb(h), 0);
    return { ...r, ref, diff: r.net - ref, diffPerHand: r.n ? (r.net - ref) / r.n : null };
  };
  const openerPos = (h) => h.players.find((p) => p.name === h.cls.aggressor)?.pos ?? '?';
  const order = (p) => (POSITIONS.indexOf(p) + 1 || 99);
  out.srpCallerOop = {
    total: bdRow(srp),
    byHero: [...groupBy(srp, (h) => h.heroPos)].sort((a, b) => order(b[0]) - order(a[0])).map(([heroPos, list]) => ({
      heroPos, ...vsRef(list, heroPos),
      byOpener: [...groupBy(list, openerPos)].sort((a, b) => order(a[0]) - order(b[0])).map(([opener, l]) => ({ opener, ...vsRef(l, heroPos) })),
    })),
  };

  // 4. Mâini pierdute la showdown (Hero ajunge la showdown și nu încasează nimic)
  const lost = hands.filter((h) => h.heroShowdown && h.heroCollected === 0);
  const streets = {}, kinds = ['blind', 'call', 'raise'];
  for (const st of ['preflop', 'flop', 'turn', 'river']) streets[st] = { blind: 0, call: 0, raise: 0, total: 0 };
  const lastGroups = { call: [], raise: [], check: [], other: [] };
  for (const h of lost) {
    const mine = [];
    for (const st of ['preflop', 'flop', 'turn', 'river']) for (const a of h.streets[st]) if (a.player === 'Hero') mine.push({ ...a, st });
    // suma returnată („uncalled bet”) se scade din ultimul bet/raise al lui Hero
    let back = h.returned.Hero ?? 0;
    for (let i = mine.length - 1; i >= 0 && back > 0; i--) if (mine[i].type === 'bet' || mine[i].type === 'raise') { const d = Math.min(back, mine[i].amount); mine[i].amount -= d; back -= d; }
    for (const a of mine) {
      const kind = a.type === 'post' ? 'blind' : a.type === 'call' ? 'call' : a.type === 'bet' || a.type === 'raise' ? 'raise' : null;
      if (kind) { streets[a.st][kind] += a.amount / h.bb; streets[a.st].total += a.amount / h.bb; }
    }
    const last = mine.filter((a) => a.type !== 'post' && a.type !== 'fold').pop();
    lastGroups[!last ? 'other' : last.type === 'call' ? 'call' : last.type === 'check' ? 'check' : 'raise'].push(h);
  }
  const sumKind = (k) => Object.values(streets).reduce((s, x) => s + x[k], 0);
  out.lostShowdown = {
    ...bdRow(lost), streets,
    totals: { blind: sumKind('blind'), call: sumKind('call'), raise: sumKind('raise'), total: sumKind('total') },
    byLast: [
      { key: 'call', label: 'am plătit (ultima acțiune: call)', ...bdRow(lastGroups.call) },
      { key: 'raise', label: 'am pariat sau am ridicat și am fost plătit', ...bdRow(lastGroups.raise) },
      { key: 'check', label: 'ultima acțiune: check', ...bdRow(lastGroups.check) },
      { key: 'other', label: 'fără acțiune (all-in din blind)', ...bdRow(lastGroups.other) },
    ].filter((g) => g.n || g.key === 'call' || g.key === 'raise'),
    kinds,
  };
  return out;
}
