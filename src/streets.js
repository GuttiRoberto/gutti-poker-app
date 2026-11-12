// Statistici pe turn și river: ce se întâmplă după ce Hero plătește, apărarea după mărimea bet-ului, bet-uri repetate (barrels).
import { prop, heroStreet } from './stats.js';

const TR_BUCKETS = ['sub 40%', '40–70%', '70–100%', 'peste 100%'];
const trBucket = (r) => (r < 0.4 ? 0 : r < 0.7 ? 1 : r <= 1 ? 2 : 3);
const TR_NEED = { turn: 4, river: 5 };

// Rezultatul lui Hero pe o stradă: null dacă strada nu s-a jucat, altfel fold / bet-raise / call / check / fără acțiune.
export function streetOutcome(h, st) {
  if (h.board.length < TR_NEED[st]) return null;
  const mine = h.streets[st].filter((a) => a.player === 'Hero' && a.type !== 'post');
  if (!mine.length) return 'fără acțiune';
  if (mine[mine.length - 1].type === 'fold') return 'fold';
  if (mine.some((a) => a.type === 'bet' || a.type === 'raise')) return 'bet/raise';
  return mine.some((a) => a.type === 'call') ? 'call' : 'check';
}

// Primul bet al străzii, dacă este al unui adversar și Hero a răspuns fără raise între ele.
function facedBet(h, st) {
  const v = heroStreet(h, st);
  if (!v.faced || !v.faced.clean || v.bettor === 'Hero') return null;
  const bet = h.streets[st].find((a) => a.type === 'bet');
  return bet ? { v, ratio: bet.amount / bet.potBefore } : null;
}

export function computeTurnRiver(hands) {
  const flop = hands.filter((h) => h.cls.sawFlop && h.flop.length === 3);
  const sum = (l) => l.reduce((s, h) => s + h.heroNetBb, 0);
  const out = { buckets: TR_BUCKETS, minN: 30 };

  // 1. După ce Hero plătește un bet, ce face pe strada următoare
  const afterCall = (from, to) => {
    const called = flop.filter((h) => { const f = facedBet(h, from); return f && f.v.faced.response === 'call'; });
    const reached = called.filter((h) => !['fără acțiune', null].includes(streetOutcome(h, to)));
    const by = (o) => reached.filter((h) => streetOutcome(h, to) === o);
    return {
      called: called.length, reached: reached.length,
      outcomes: ['fold', 'call', 'check', 'bet/raise'].map((o) => ({ label: o, k: by(o).length, n: reached.length, net: sum(by(o)) })),
      net: sum(reached),
    };
  };
  out.afterCall = { flopToTurn: afterCall('flop', 'turn'), turnToRiver: afterCall('turn', 'river') };

  // 2. Apărarea după mărimea bet-ului adversarului
  out.bySize = {};
  for (const st of ['turn', 'river']) {
    const rows = TR_BUCKETS.map(() => ({ n: 0, fold: 0, call: 0, raise: 0, net: 0 }));
    for (const h of flop) {
      const f = facedBet(h, st);
      if (!f) continue;
      const r = rows[trBucket(f.ratio)], t = f.v.faced.response;
      r.n++; r[t]++; r.net += h.heroNetBb;
    }
    out.bySize[st] = rows.map((r, i) => ({ label: TR_BUCKETS[i], ...r }));
  }

  // 3. Bet-uri repetate ca agresor
  const agg = flop.filter((h) => h.cls.heroRole === 'agresor');
  const view = (h, st) => heroStreet(h, st);
  const rate = (label, opp, did) => ({ label, ...prop(opp.filter(did).length, opp.length) });
  const cbet = agg.filter((h) => view(h, 'flop').bet);
  const delayed = agg.filter((h) => view(h, 'flop').checkedFirst && h.streets.flop.filter((a) => a.type !== 'post').every((a) => a.type === 'check'));
  const turnBet = cbet.filter((h) => view(h, 'turn').open && view(h, 'turn').bet);
  const turnOpen = (l) => l.filter((h) => view(h, 'turn').open);
  const riverOpen = (l) => l.filter((h) => view(h, 'river').open);
  const tb = (h) => !!view(h, 'turn').bet, rb = (h) => !!view(h, 'river').bet;
  out.barrels = [
    rate('al doilea bet (turn) după c-bet, IP', turnOpen(cbet.filter((h) => h.cls.position === 'IP')), tb),
    rate('al doilea bet (turn) după c-bet, OOP', turnOpen(cbet.filter((h) => h.cls.position === 'OOP')), tb),
    rate('bet pe turn după flop check-through (delayed c-bet)', turnOpen(delayed), tb),
    rate('al treilea bet (river) după două beturi, IP', riverOpen(turnBet.filter((h) => h.cls.position === 'IP')), rb),
    rate('al treilea bet (river) după două beturi, OOP', riverOpen(turnBet.filter((h) => h.cls.position === 'OOP')), rb),
    rate('bet pe river după c-bet și check pe turn', riverOpen(cbet.filter((h) => view(h, 'turn').checkedFirst)), rb),
  ];
  return out;
}
