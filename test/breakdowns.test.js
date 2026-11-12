import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHands } from '../src/hands.js';
import { classify } from '../src/classify.js';
import { computeStats } from '../src/stats.js';
import { computeBreakdowns, winrateCi } from '../src/breakdowns.js';

const parsed = parseHands(readFileSync(new URL('./fixtures/hands.txt', import.meta.url), 'utf8'));
for (const h of parsed.hands) h.cls = classify(h);
const H = parsed.hands;
const B = computeBreakdowns(H);
const total = H.reduce((s, h) => s + h.heroNetBb, 0);
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} vs ${b}`);
const sum = (list, f) => list.reduce((s, x) => s + f(x), 0);

test('1. pe miză: bb se calculează cu big blind-ul fiecărei mâini', () => {
  for (const h of H) near(h.heroNetBb, h.heroNet / h.bb, h.id);
  assert.deepEqual(B.byStake.map((r) => [r.stakes, r.bb, r.n]), [['0.01/0.02', 0.02, 18], ['0.02/0.05', 0.05, 2]]);
  near(B.byStake[1].net, -2); // RC4796652112: call 0,10 $ la NL5 apoi fold = −2 bb
  near(B.byStake[1].usd, -0.1);
  near(B.byStake[0].usd, B.byStake[0].net * 0.02); // la o singură miză, $ = bb × big blind
  near(sum(B.byStake, (r) => r.net), total);
  near(sum(B.byStake, (r) => r.usd), B.total.usd);
  assert.equal(sum(B.byStake, (r) => r.n), 20);
  assert.notEqual(Math.round(B.total.usd * 100), Math.round(B.total.net * 2)); // totalul în $ nu este bb × 0,02 când mizele sunt amestecate
});

test('2. mâini terminate preflop: pe poziție și fără blinduri', () => {
  const pos = Object.fromEntries(B.preflop.byPos.map((r) => [r.pos, r]));
  assert.deepEqual(Object.keys(pos), ['UTG', 'CO', 'SB', 'BB']);
  assert.deepEqual([pos.UTG.n, pos.CO.n, pos.SB.n, pos.BB.n], [1, 2, 1, 1]);
  near(pos.UTG.net, 0); near(pos.CO.net, -2); near(pos.SB.net, -0.5); near(pos.BB.net, 0.5);
  near(pos.SB.blinds, 0.5); near(pos.SB.netNoBlinds, 0);
  near(pos.BB.blinds, 1); near(pos.BB.netNoBlinds, 1.5); // walk: câștigă 0,5 bb peste blindul propriu
  near(pos.CO.bb100, -100);
  assert.deepEqual([B.preflop.blinds.n, B.preflop.others.n, B.preflop.total.n], [2, 3, 5]);
  near(B.preflop.blinds.net, 0); near(B.preflop.blinds.blinds, 1.5); near(B.preflop.others.net, -2);
  near(sum(B.preflop.byPos, (r) => r.net), B.preflop.total.net);
  near(B.preflop.blinds.net + B.preflop.others.net, B.preflop.total.net);
  assert.equal(sum(B.preflop.byPos, (r) => r.n), B.preflop.total.n);
  near(B.preflop.total.netNoBlinds, B.preflop.total.net + B.preflop.total.blinds);
  // blinduri în toate mâinile: Hero SB în 3 mâini (0,5 bb) și BB în 6 (1 bb)
  near(B.preflop.blindsAllHands, 3 * 0.5 + 6 * 1);
});

test('3. single-raised, caller, OOP, heads-up: pe poziție și față de „fold la tot”', () => {
  const R = B.srpCallerOop;
  assert.equal(R.total.n, 3);
  near(R.total.net, -102.5);
  assert.deepEqual(R.byHero.map((g) => g.heroPos), ['BB']);
  const bb = R.byHero[0];
  near(bb.ref, -3); near(bb.diff, -99.5); near(bb.diffPerHand, -99.5 / 3);
  assert.deepEqual(bb.byOpener.map((o) => [o.opener, o.n]), [['UTG', 1], ['HJ', 2]]);
  near(bb.byOpener[0].net, -53.5); near(bb.byOpener[0].ref, -1); near(bb.byOpener[0].diff, -52.5);
  near(bb.byOpener[1].net, -49); near(bb.byOpener[1].ref, -2); near(bb.byOpener[1].diff, -47); near(bb.byOpener[1].diffPerHand, -23.5);
  near(sum(bb.byOpener, (o) => o.net), bb.net);
  near(sum(R.byHero, (g) => g.net), R.total.net);
  // același grup ca rândul din tabelul „Unde se duc banii”
  const row = computeStats(H).money.find((r) => r.potType === 'single-raised' && r.role === 'caller' && r.position === 'OOP' && r.players === 'heads-up');
  assert.equal(row.n, R.total.n); near(row.net, R.total.net);
});

test('4. mâini pierdute la showdown: investiție pe stradă și ultima acțiune', () => {
  const L = B.lostShowdown;
  assert.equal(L.n, 3); // RC4784189141, RC4782146702, RC4786697670
  near(L.net, -195.5);
  const s = L.streets;
  assert.deepEqual([s.preflop.blind, s.preflop.call, s.preflop.raise], [2, 82, 21]);
  assert.deepEqual([s.flop.call, s.flop.raise], [3.5, 6]);
  assert.deepEqual([s.turn.call, s.turn.raise], [8.5, 21]);
  assert.deepEqual([s.river.call, s.river.raise], [51.5, 0]);
  near(L.totals.total, -L.net); // tot ce s-a investit s-a pierdut
  near(L.totals.blind + L.totals.call + L.totals.raise, L.totals.total);
  for (const st of Object.values(s)) near(st.blind + st.call + st.raise, st.total);
  const last = Object.fromEntries(L.byLast.map((g) => [g.key, g]));
  assert.deepEqual([last.call.n, last.raise.n], [3, 0]);
  near(last.call.net, -195.5);
  assert.equal(sum(L.byLast, (g) => g.n), L.n);
  near(sum(L.byLast, (g) => g.net), L.net);
});

test('5. eșantion mic și intervalul de încredere al bb/100', () => {
  assert.equal(B.smallSample, 200);
  assert.ok(B.total.small && B.byStake.every((r) => r.small) && B.lostShowdown.small);
  const many = Array.from({ length: 200 }, (_, i) => ({ heroNetBb: i % 2 ? 1 : -1 }));
  assert.equal(winrateCi(many).small, false);
  assert.equal(winrateCi(many.slice(1)).small, true);
  // formula, verificată independent: medie ± 1,96 × sd / √n, cu sd de eșantion (n − 1)
  const c = winrateCi(many);
  const sd = Math.sqrt(200 / 199);
  near(c.bb100, 0); near(c.sd, sd); near(c.sd100, sd * 10); near(c.hi, (100 * 1.96 * sd) / Math.sqrt(200)); near(c.lo, -c.hi);
  const ci = B.total.ci, x = H.map((h) => h.heroNetBb), m = total / 20;
  const sd2 = Math.sqrt(x.reduce((a, v) => a + (v - m) ** 2, 0) / 19);
  near(ci.bb100, 100 * m); near(ci.sd, sd2); near(ci.hi - ci.lo, (2 * 100 * 1.96 * sd2) / Math.sqrt(20));
  assert.equal(winrateCi([]).bb100, null);
});

test('6. sumele defalcărilor dau totalul general', () => {
  const S = computeStats(H);
  near(B.total.net, total);
  near(B.preflop.total.net + S.summary.flop.net, total); // preflop + cu flop
  near(B.preflop.total.net + sum(S.money, (r) => r.net), total); // preflop + tabelul „Unde se duc banii”
  near(sum(B.byStake, (r) => r.net), total);
  near(S.showdown.netSd.net + S.showdown.netNoSd.net, S.summary.flop.net);
  assert.equal(B.preflop.total.n + S.summary.flop.n, H.length);
  // verificarea potului rămâne valabilă pe toate mâinile
  assert.ok(H.every((h) => h.checks.potOk && h.checks.payoutOk));
});
