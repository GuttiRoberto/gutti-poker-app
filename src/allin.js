// EV all-in: cât ar fi câștigat Hero în medie din fiecare all-in cu cărți vizibile, față de ce a câștigat de fapt.
// Norocul unei mâini = încasat în realitate − încasat așteptat. Nu spune nimic despre calitatea deciziei, doar despre variație.
import { equities, cardId, seedOf } from './equity.js';

const AI_STREETS = ['preflop', 'flop', 'turn', 'river'];
const AI_BOARD = { preflop: 0, flop: 3, turn: 4, river: 5 };

// Întoarce null dacă mâna nu are all-in cu showdown la care participă Hero,
// { skip: motiv } dacă nu se poate calcula sigur, sau { street, equity, players, expected, luck } (în cenți).
export function allinEv(h) {
  if (!h.heroShowdown) return null;
  if (h.cashout.chosen || h.cashout.received || h.cashout.risk) return { skip: 'EV cashout' };
  const foldedNames = new Set(h.folded);
  const live = h.players.map((p) => p.name).filter((n) => !foldedNames.has(n));

  // momentul în care banii sunt băgați: primul sfârșit de stradă cu cel puțin un all-in și cel mult un jucător cu fise rămase
  const allin = new Set();
  let lock = null;
  for (const st of AI_STREETS) {
    for (const a of h.streets[st]) if (a.allin && live.includes(a.player)) allin.add(a.player);
    if (allin.size >= 1 && live.filter((n) => !allin.has(n)).length <= 1) { lock = st; break; }
  }
  if (!lock) return null; // showdown obișnuit, fără all-in
  for (const st of AI_STREETS.slice(AI_STREETS.indexOf(lock) + 1)) {
    if (h.streets[st].some((a) => a.type === 'bet' || a.type === 'call' || a.type === 'raise')) return { skip: 'pariuri după all-in' };
  }
  const put = (n) => (h.invested[n] ?? 0) - (h.returned[n] ?? 0);
  if (live.some((n) => put(n) !== put(live[0]))) return { skip: 'side pot' };
  if (!h.checks.payoutOk) return { skip: 'plată neobișnuită' };

  const cards = live.map((n) => (n === 'Hero' ? h.heroCards : h.shown[n]));
  if (cards.some((c) => !c || c.length !== 2)) return { skip: 'cărți necunoscute' };
  const need = AI_BOARD[lock];
  if (h.board.length < need) return { skip: 'board incomplet' };

  const eq = equities(cards.map((c) => c.map(cardId)), h.board.slice(0, need).map(cardId), seedOf(h.id));
  const share = eq[live.indexOf('Hero')];
  const distributable = Object.values(h.collected).reduce((a, b) => a + b, 0); // după rake
  const expected = share * distributable;
  return { street: lock, equity: share, players: live.length, expected, luck: h.heroCollected - expected };
}

const EQ_BANDS = [
  { label: 'favorit mare (peste 70%)', min: 0.7, max: 1.01 },
  { label: 'favorit (55–70%)', min: 0.55, max: 0.7 },
  { label: 'aproape egal (45–55%)', min: 0.45, max: 0.55 },
  { label: 'outsider (30–45%)', min: 0.3, max: 0.45 },
  { label: 'outsider mare (sub 30%)', min: -1, max: 0.3 },
];

// Sinteza pe un set de mâini (cu câmpul `allin` deja calculat).
export function summarizeAllin(hands) {
  const done = hands.filter((h) => h.allin !== undefined);
  const withAi = done.filter((h) => h.allin && h.allin.equity != null);
  const skipped = {};
  for (const h of done) if (h.allin && h.allin.skip) skipped[h.allin.skip] = (skipped[h.allin.skip] ?? 0) + 1;
  const bbOf = (h) => h.allin.luck / h.bb;
  const luckBb = withAi.reduce((s, h) => s + bbOf(h), 0);
  // abaterea sumei: rădăcina sumei pătratelor, așa cum se compun variațiile independente
  const se = Math.sqrt(withAi.reduce((s, h) => s + bbOf(h) ** 2, 0));
  const net = hands.reduce((s, h) => s + h.heroNetBb, 0);
  const n = hands.length;
  // all-in-urile de pe river nu intră la „cât de favorit ai fost”: rezultatul este deja cunoscut, deci echitatea este 0% sau 100%
  const band = (b) => {
    const l = withAi.filter((h) => h.allin.street !== 'river' && h.allin.equity >= b.min && h.allin.equity < b.max);
    const wins = l.filter((h) => h.heroCollected > 0).length;
    return { label: b.label, n: l.length, expectedWin: l.length ? (100 * l.reduce((s, h) => s + h.allin.equity, 0)) / l.length : null,
      actualWin: l.length ? (100 * wins) / l.length : null, luck: l.reduce((s, h) => s + bbOf(h), 0) };
  };
  const street = (st) => { const l = withAi.filter((h) => h.allin.street === st); return { street: st, n: l.length, luck: l.reduce((s, h) => s + bbOf(h), 0) }; };
  return {
    pending: hands.length - done.length, n: withAi.length, skipped, luckBb, se, net, evNet: net - luckBb,
    bb100: n ? (100 * net) / n : null, evBb100: n ? (100 * (net - luckBb)) / n : null,
    bands: EQ_BANDS.map(band).filter((b) => b.n), streets: ['preflop', 'flop', 'turn', 'river'].map(street).filter((s) => s.n),
  };
}
