// Echitate (probabilitatea de a câștiga potul) pentru mâini cunoscute, prin evaluator de 7 cărți.
// Dacă sunt puține board-uri posibile (flop, turn, river) se numără toate; preflop se folosește un eșantion mare, cu generator fix,
// deci același rezultat la fiecare rulare. Cărțile sunt întregi: rang * 4 + culoare (rang 0 = 2 ... 12 = A).

const EQ_RANKS = '23456789TJQKA', EQ_SUITS = 'shdc';
export const cardId = (c) => EQ_RANKS.indexOf(c[0]) * 4 + EQ_SUITS.indexOf(c[1]);

// Pentru o mască de ranguri (13 biți): cartea cea mare a celei mai bune chinte (roata A-2-3-4-5 are 3), sau -1.
const STRAIGHT_HIGH = new Int8Array(8192).fill(-1);
for (let m = 0; m < 8192; m++) {
  for (let hi = 12; hi >= 3; hi--) {
    let ok = true;
    for (let k = 0; k < 5; k++) { const r = hi - k < 0 ? 12 : hi - k; if (!((m >> r) & 1)) { ok = false; break; } }
    if (ok) { STRAIGHT_HIGH[m] = hi; break; }
  }
}

const EQ_CNT = new Int8Array(13), EQ_SC = new Int8Array(4), EQ_SM = new Int32Array(4);
const CAT = 371293; // 13^5

// Cele mai mari k ranguri prezente, fără cele excluse, ca număr în baza 13.
function kick(k, e1, e2) {
  let v = 0;
  for (let r = 12; r >= 0 && k > 0; r--) if (EQ_CNT[r] && r !== e1 && r !== e2) { v = v * 13 + r; k--; }
  return v;
}

// Valoarea celei mai bune mâini de 5 cărți din cele n date (mai mare = mai bună).
export function evalCards(cs, n) {
  EQ_CNT.fill(0); EQ_SC.fill(0); EQ_SM.fill(0);
  let mask = 0;
  for (let i = 0; i < n; i++) { const c = cs[i], r = c >> 2, s = c & 3; EQ_CNT[r]++; EQ_SC[s]++; EQ_SM[s] |= 1 << r; mask |= 1 << r; }
  for (let s = 0; s < 4; s++) {
    if (EQ_SC[s] < 5) continue;
    const m = EQ_SM[s], sf = STRAIGHT_HIGH[m];
    if (sf >= 0) return 8 * CAT + sf * 28561;
    let v = 0, got = 0;
    for (let r = 12; r >= 0; r--) if ((m >> r) & 1) { v = v * 13 + r; if (++got === 5) break; }
    return 5 * CAT + v;
  }
  let q = -1, t1 = -1, t2 = -1, p1 = -1, p2 = -1;
  for (let r = 12; r >= 0; r--) {
    const c = EQ_CNT[r];
    if (c === 4) q = r;
    else if (c === 3) { if (t1 < 0) t1 = r; else if (t2 < 0) t2 = r; }
    else if (c === 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; }
  }
  if (q >= 0) return 7 * CAT + (q * 13 + kick(1, q)) * 2197;
  if (t1 >= 0 && (t2 >= 0 || p1 >= 0)) return 6 * CAT + (t1 * 13 + Math.max(t2, p1)) * 2197;
  const sh = STRAIGHT_HIGH[mask];
  if (sh >= 0) return 4 * CAT + sh * 28561;
  if (t1 >= 0) return 3 * CAT + (t1 * 169 + kick(2, t1)) * 169;
  if (p1 >= 0 && p2 >= 0) return 2 * CAT + ((p1 * 13 + p2) * 13 + kick(1, p1, p2)) * 169;
  if (p1 >= 0) return 1 * CAT + (p1 * 2197 + kick(3, p1)) * 13;
  return kick(5);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function seedOf(text) { let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return h >>> 0; }

export const EQ_SAMPLES = 30000; // board-uri trase la întâmplare când sunt prea multe de numărat (preflop)
const EQ_ENUM_LIMIT = 3000;
const EQ_CACHE = new Map();

// hands: [[carte, carte], ...] pentru fiecare jucător rămas în pot; board: 0, 3, 4 sau 5 cărți.
// Întoarce partea de pot așteptată a fiecărui jucător (egalitatea împarte), suma este 1.
export function equities(hands, board, seed = 1) {
  // aceeași situație cu culori redenumite are aceeași echitate: cheie canonică pentru memorie
  const rename = new Map(), key = [];
  for (const c of [...hands.flat(), ...board]) { const s = c & 3; if (!rename.has(s)) rename.set(s, rename.size); key.push((c >> 2) * 4 + rename.get(s)); }
  const k = `${hands.length}|${board.length}|${key.join(',')}`;
  if (EQ_CACHE.has(k)) return EQ_CACHE.get(k);

  const used = new Set([...hands.flat(), ...board]);
  const deck = [];
  for (let c = 0; c < 52; c++) if (!used.has(c)) deck.push(c);
  const need = 5 - board.length, np = hands.length;
  const buf = new Int32Array(7), share = new Float64Array(np), sc = new Float64Array(np);
  let boards = 0;
  const score = () => {
    let best = -1, nb = 0;
    for (let p = 0; p < np; p++) {
      buf[0] = hands[p][0]; buf[1] = hands[p][1];
      const v = evalCards(buf, 7); sc[p] = v;
      if (v > best) { best = v; nb = 1; } else if (v === best) nb++;
    }
    for (let p = 0; p < np; p++) if (sc[p] === best) share[p] += 1 / nb;
    boards++;
  };
  for (let i = 0; i < board.length; i++) buf[2 + i] = board[i];
  const first = 2 + board.length;
  const combos = need === 0 ? 1 : need === 1 ? deck.length : need === 2 ? (deck.length * (deck.length - 1)) / 2 : Infinity;
  if (combos <= EQ_ENUM_LIMIT) {
    if (need === 0) score();
    else if (need === 1) for (const a of deck) { buf[first] = a; score(); }
    else for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) { buf[first] = deck[i]; buf[first + 1] = deck[j]; score(); }
  } else {
    const rng = mulberry32(seed), d = deck.slice();
    for (let n = 0; n < EQ_SAMPLES; n++) {
      for (let i = 0; i < need; i++) { const j = i + Math.floor(rng() * (d.length - i)); const t = d[i]; d[i] = d[j]; d[j] = t; buf[first + i] = d[i]; }
      score();
    }
  }
  const out = Array.from(share, (x) => x / boards);
  if (EQ_CACHE.size > 20000) EQ_CACHE.clear();
  EQ_CACHE.set(k, out);
  return out;
}
