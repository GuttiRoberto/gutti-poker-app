import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHands } from '../src/hands.js';
import { classify } from '../src/classify.js';
import { handLabel, handCategory, HAND_CATEGORIES } from '../src/handclass.js';
import { computeThreeBet } from '../src/threebet.js';

test('etichete și categorii de mâini', () => {
  const lab = (a, b) => handLabel([a, b]);
  assert.deepEqual([lab('Ah', 'Kd'), lab('Kd', 'Ah'), lab('9s', '9h'), lab('Qh', 'Jh'), lab('5s', 'As'), lab('Td', '9c')], ['AKo', 'AKo', '99', 'QJs', 'A5s', 'T9o']);
  const cat = (l) => HAND_CATEGORIES[handCategory(l)].split(' (')[0];
  assert.deepEqual(['AA', 'QQ', 'AKs', 'AKo'].map(cat), ['premium', 'premium', 'premium', 'premium']);
  assert.deepEqual(['JJ', '88'].map(cat), ['perechi medii', 'perechi medii']);
  assert.deepEqual(['77', '22'].map(cat), ['perechi mici', 'perechi mici']);
  assert.deepEqual(['AQo', 'AJs', 'ATo', 'KQs', 'QJs', 'JTs', 'QTo'].map(cat), Array(7).fill('broadway'));
  assert.deepEqual(['A9s', 'A2s'].map(cat), ['as suited mic', 'as suited mic']);
  assert.deepEqual(['T9s', 'K9s', '76s'].map(cat), ['alte suited', 'alte suited', 'alte suited']);
  assert.deepEqual(['A9o', 'K9o', 'T9o'].map(cat), ['alte offsuit', 'alte offsuit', 'alte offsuit']);
});

// mână sintetică: Hero (poziția pos) deschide / plătește un 3-bet și vede flopul
const hand = ({ cards, net, pos = 'UTG', potType = '3-bet', opened = true, luck = null, pre, role = 'caller', sawFlop = true }) => ({
  heroCards: cards, heroNetBb: net, bb: 2, heroPos: pos, cls: { sawFlop, heroRole: role, potType },
  allin: luck == null ? undefined : { luck: luck * 2, equity: 0.5 },
  streets: { preflop: pre ?? (opened
    ? [{ type: 'raise', player: 'Hero' }, { type: 'raise', player: 'V' }, { type: 'call', player: 'Hero' }]
    : [{ type: 'raise', player: 'V' }, { type: 'call', player: 'Hero' }, { type: 'raise', player: 'W' }, { type: 'call', player: 'Hero' }]) },
});

test('3-bet / 4-bet: grupare pe tip de mână, poziție, noroc și răspuns la 3-bet', () => {
  const hands = [
    hand({ cards: ['Qs', 'Js'], net: -40, luck: 0 }),
    hand({ cards: ['Qh', 'Jd'], net: -30, luck: 0, pos: 'CO' }),
    hand({ cards: ['As', 'Ad'], net: -100, luck: -100, pos: 'BTN' }), // AA pierdut la all-in: ghinion pur
    hand({ cards: ['Kh', 'Kd'], net: 60, luck: 0 }),
    hand({ cards: ['9h', '9d'], net: -20, potType: '4-bet+', opened: false }),
    hand({ cards: ['7h', '2d'], net: -1, role: 'agresor' }), // nu e caller: nu se numără
    hand({ cards: ['Ts', 'Td'], net: 5, potType: 'single-raised' }), // nu e 3-bet
    // preflop terminat: Hero deschide, primește 3-bet și dă fold
    hand({ cards: ['8h', '7h'], net: -2, sawFlop: false, pre: [{ type: 'raise', player: 'Hero' }, { type: 'raise', player: 'V' }, { type: 'fold', player: 'Hero' }] }),
    hand({ cards: ['Ah', 'Qh'], net: -2, sawFlop: false, pos: 'CO', pre: [{ type: 'raise', player: 'Hero' }, { type: 'raise', player: 'V' }, { type: 'raise', player: 'Hero' }] }),
    hand({ cards: ['Jh', 'Jc'], net: 0, sawFlop: false, pre: [{ type: 'raise', player: 'V' }, { type: 'raise', player: 'Hero' }, { type: 'fold', player: 'V' }] }), // Hero nu a deschis
  ];
  const T = computeThreeBet(hands);
  assert.equal(T.callers.n, 5);
  assert.equal(T.callers.net, -40 - 30 - 100 + 60 - 20);
  assert.equal(T.callers.luck, -100);
  assert.equal(T.callers.netNoLuck, T.callers.net + 100);
  assert.deepEqual(T.byCategory.map((r) => [r.label.split(' (')[0], r.n]), [['premium', 2], ['perechi medii', 1], ['broadway', 2]]);
  const premium = T.byCategory.find((r) => r.label.startsWith('premium'));
  assert.deepEqual([premium.n, premium.net, premium.luck, premium.netNoLuck], [2, -40, -100, 60]);
  // Hero a deschis și a plătit 3-bet: QJs UTG, QJo CO, AA BTN, KK UTG
  assert.equal(T.opened.n, 4);
  assert.deepEqual(T.openedByPos.map((r) => [r.pos, r.n]), [['UTG', 2], ['CO', 1], ['BTN', 1]]);
  assert.deepEqual(T.worstTypes, []); // fiecare mână apare o singură dată: sub pragul de 3
  // răspuns la 3-bet după ce Hero a deschis: 6 call-uri (mâinile 1-4, 6, 7), 1 fold, 1 4-bet; mâinile 5 și 10 nu au Hero ca deschizător
  const v = T.vs3bet.total;
  assert.deepEqual([v.n, v.fold.k, v.call.k, v.raise.k], [8, 1, 6, 1]);
  assert.deepEqual(T.vs3bet.byPos.map((r) => [r.pos, r.n]), [['UTG', 5], ['CO', 2], ['BTN', 1]]);
});

test('3-bet: cele mai pierzătoare mâini apar de la 3 apariții', () => {
  const hands = [-30, -50, -20, 40].map((net) => hand({ cards: ['As', 'Js'], net })).concat([hand({ cards: ['Kh', 'Kd'], net: -500 })]);
  const T = computeThreeBet(hands);
  assert.deepEqual(T.worstTypes.map((r) => [r.label, r.n, r.net]), [['AJs', 4, -60]]);
});

test('3-bet: rulează pe mâinile reale din fixture fără erori și cu totaluri consistente', () => {
  const parsed = parseHands(readFileSync(new URL('./fixtures/hands.txt', import.meta.url), 'utf8'));
  for (const h of parsed.hands) h.cls = classify(h);
  const T = computeThreeBet(parsed.hands);
  assert.equal(T.byCategory.reduce((s, r) => s + r.n, 0), T.callers.n);
  assert.ok(T.vs3bet.total.n <= parsed.hands.length);
});
