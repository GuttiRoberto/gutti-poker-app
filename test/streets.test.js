import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHands } from '../src/hands.js';
import { classify } from '../src/classify.js';
import { streetOutcome, computeTurnRiver } from '../src/streets.js';

// mână sintetică pe 4 străzi: acțiunile sunt date direct pe turn/river
const act = (player, type, amount = 0, potBefore = 100) => ({ player, type, amount, potBefore });
const hand = ({ flop = [], turn = [], river = [], board = 5, net = 0, role = 'caller', pos = 'OOP' }) => ({
  heroNetBb: net, flop: ['2c', '7d', 'Ks'], board: ['2c', '7d', 'Ks', '9h', 'Jd'].slice(0, board),
  cls: { sawFlop: true, heroRole: role, position: pos },
  streets: { preflop: [], flop, turn, river },
});

test('streetOutcome', () => {
  const h = hand({ turn: [act('Hero', 'check'), act('V', 'bet', 50), act('Hero', 'fold')] });
  assert.equal(streetOutcome(h, 'turn'), 'fold');
  assert.equal(streetOutcome(hand({ turn: [act('V', 'bet', 50), act('Hero', 'call', 50)] }), 'turn'), 'call');
  assert.equal(streetOutcome(hand({ turn: [act('Hero', 'bet', 50)] }), 'turn'), 'bet/raise');
  assert.equal(streetOutcome(hand({ turn: [act('Hero', 'check'), act('V', 'check')] }), 'turn'), 'check');
  assert.equal(streetOutcome(hand({ turn: [], board: 3 }), 'turn'), null);
  assert.equal(streetOutcome(hand({ turn: [] }), 'turn'), 'fără acțiune');
});

test('după call pe flop și apărare pe mărimi', () => {
  const hs = [
    hand({ flop: [act('V', 'bet', 50), act('Hero', 'call', 50)], turn: [act('V', 'bet', 100, 200), act('Hero', 'fold')], net: -4 }), // sub 100%: 0.5 → 40–70%? 100/200 = 0.5
    hand({ flop: [act('V', 'bet', 50), act('Hero', 'call', 50)], turn: [act('Hero', 'check'), act('V', 'check')], river: [act('V', 'bet', 200, 200), act('Hero', 'call', 200)], net: 3 }),
    hand({ flop: [act('V', 'bet', 50), act('Hero', 'raise', 150)], turn: [act('V', 'bet', 100, 200), act('Hero', 'fold')], net: -2 }), // raise pe flop: nu intră
  ];
  const T = computeTurnRiver(hs);
  const c = T.afterCall.flopToTurn;
  assert.deepEqual([c.called, c.reached], [2, 2]);
  assert.deepEqual(Object.fromEntries(c.outcomes.map((o) => [o.label, o.k])), { fold: 1, call: 0, check: 1, 'bet/raise': 0 });
  assert.equal(T.bySize.turn[1].n, 2); // 100/200 = 50% la ambele fold-uri pe turn (și al treilea, fără raise curat)
  assert.equal(T.bySize.turn[1].fold, 2);
  assert.equal(T.bySize.river[2].call, 1); // 200/200 = 100%
  const sizes = T.bySize.turn.reduce((s, r) => s + r.n, 0);
  assert.equal(sizes, 2);
});

test('bet-uri repetate ca agresor', () => {
  const ag = (o) => hand({ role: 'agresor', pos: 'IP', ...o });
  const hs = [
    ag({ flop: [act('V', 'check'), act('Hero', 'bet', 50)], turn: [act('V', 'check'), act('Hero', 'bet', 100, 200)], river: [act('V', 'check'), act('Hero', 'bet', 200, 400)] }),
    ag({ flop: [act('V', 'check'), act('Hero', 'bet', 50)], turn: [act('V', 'check'), act('Hero', 'check')] }),
    ag({ flop: [act('Hero', 'check'), act('V', 'check')], turn: [act('Hero', 'bet', 50, 100)] }),
  ];
  const B = Object.fromEntries(computeTurnRiver(hs).barrels.map((r) => [r.label, [r.k, r.n]]));
  assert.deepEqual(B['al doilea bet (turn) după c-bet, IP'], [1, 2]);
  assert.deepEqual(B['al treilea bet (river) după două beturi, IP'], [1, 1]);
  assert.deepEqual(B['bet pe turn după flop check-through (delayed c-bet)'], [1, 1]);
});

test('rulează pe fixture real fără erori', () => {
  const p = parseHands(readFileSync(new URL('./fixtures/hands.txt', import.meta.url), 'utf8'));
  for (const h of p.hands) h.cls = classify(h);
  const T = computeTurnRiver(p.hands);
  assert.equal(T.buckets.length, 4);
});
