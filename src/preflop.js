// Strategie preflop: ponderile din ranges.json sunt ABSOLUTE (0–100), nu condiționate.
const RANKS = 'AKQJT98765432';
const SUITS = 'shdc';
const TOL = 0.02; // depășire maximă a reach-ului considerată rotunjire
const EPS = 1e-9;
const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

let data = null;
let byId = null;

// "5h6h" / "KdAh" -> { key: "6h5h", cls: "65s" } (cartea mai mare prima; la perechi, ordinea s,h,d,c)
function parseCombo(combo) {
  const m = /^([AKQJT2-9])([shdc])([AKQJT2-9])([shdc])$/i.exec(String(combo).trim());
  if (!m) throw new Error(`Combinație invalidă: ${combo}`);
  let a = { r: m[1].toUpperCase(), s: m[2].toLowerCase() };
  let b = { r: m[3].toUpperCase(), s: m[4].toLowerCase() };
  if (a.r === b.r && a.s === b.s) throw new Error(`Combinație invalidă: ${combo}`);
  const ia = RANKS.indexOf(a.r), ib = RANKS.indexOf(b.r);
  if (ia > ib || (ia === ib && SUITS.indexOf(a.s) > SUITS.indexOf(b.s))) [a, b] = [b, a];
  const cls = a.r === b.r ? a.r + b.r : a.r + b.r + (a.s === b.s ? 's' : 'o');
  return { key: a.r + a.s + b.r + b.s, cls };
}

// Toate cele 1326 de combinații, în ordine canonică.
const ALL = [];
for (let i = 0; i < 52; i++)
  for (let j = i + 1; j < 52; j++)
    ALL.push(parseCombo(RANKS[i >> 2] + SUITS[i & 3] + RANKS[j >> 2] + SUITS[j & 3]));

function need() {
  if (!data) throw new Error('Apelează loadRanges(json) mai întâi.');
}

function getRange(rangeId) {
  need();
  const r = data.ranges[rangeId];
  if (!r) throw new Error(`Range necunoscut: ${rangeId}`);
  return r;
}

// Ponderea 0–100 a unei combinații; `combos` (dacă există) are prioritate față de `classes`.
function weight(range, c) {
  const w = range._combos?.[c.key] ?? range.classes?.[c.cls] ?? 0;
  return w;
}

export function loadRanges(json) {
  const d = typeof json === 'string' ? JSON.parse(json) : json;
  if (!Array.isArray(d?.scenarios) || !d?.ranges) throw new Error('ranges.json invalid');
  for (const r of Object.values(d.ranges)) {
    if (r.combos && !r._combos) {
      const norm = {};
      for (const [k, v] of Object.entries(r.combos)) norm[parseCombo(k).key] = v;
      Object.defineProperty(r, '_combos', { value: norm, enumerable: false });
    }
  }
  data = d;
  byId = new Map(d.scenarios.map((s) => [s.id, s]));
}

export function scenarios() {
  need();
  return data.scenarios.map((s) => ({ ...s, actions: s.actions.map((a) => ({ ...a })) }));
}

export function strategy(scenarioId, combo) {
  need();
  const s = byId.get(Number(scenarioId));
  if (!s) throw new Error(`Scenariu necunoscut: ${scenarioId}`);
  if (s.status === 'blocked') return { blocked: true, reason: s.reason };
  const c = parseCombo(combo);
  const reach = s.parent == null ? 100 : weight(getRange(s.parent), c);
  if (!(reach > 0)) return null;
  const ws = s.actions.map((a) => weight(getRange(a.range), c));
  const sum = ws.reduce((x, y) => x + y, 0);
  if (sum > reach + TOL + EPS)
    throw new Error(`Scenariul ${s.id}, ${c.key}: suma ponderilor ${sum} depășește reach ${reach}`);
  const k = sum > reach ? reach / sum : 1; // rotunjire: taie la reach
  const actions = {};
  let used = 0;
  s.actions.forEach((a, i) => {
    const f = r2((100 * ws[i] * k) / reach);
    actions[a.key] = r2((actions[a.key] ?? 0) + f);
    used += f;
  });
  actions.fold = Math.max(0, r2(100 - used));
  return { reach: r2(reach), actions };
}

// Ponderi 0–1 pentru toate cele 1326 de combinații (intrarea solverului postflop).
export function rangeFor(rangeId) {
  const r = getRange(rangeId);
  const out = {};
  for (const c of ALL) out[c.key] = weight(r, c) / 100;
  return out;
}

const fmt = (name, w) => (w >= 100 ? name : `${name}:${+(w / 100).toFixed(6)}`);

// Text de forma "AA,AKs:0.5,..." (ponderi 0–1). Clasele cu ponderi diferite pe combinații se scriu combinație cu combinație.
export function rangeString(rangeId) {
  const r = getRange(rangeId);
  const groups = new Map();
  for (const c of ALL) {
    if (!groups.has(c.cls)) groups.set(c.cls, []);
    groups.get(c.cls).push([c.key, weight(r, c)]);
  }
  const parts = [];
  for (const [cls, list] of groups) {
    if (list.every(([, w]) => w === list[0][1])) {
      if (list[0][1] > 0) parts.push(fmt(cls, list[0][1]));
    } else {
      for (const [key, w] of list) if (w > 0) parts.push(fmt(key, w));
    }
  }
  return parts.join(',');
}

export const ALL_COMBOS = ALL.map((c) => c.key);
