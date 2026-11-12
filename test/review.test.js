import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHands } from '../src/hands.js';
import { classify } from '../src/classify.js';
import { compactRanges, chartDecision } from '../src/chart3bet.js';
import { classifyResponse, computeReview } from '../src/review.js';

const raw = JSON.parse(readFileSync(new URL('../data/ranges.json', import.meta.url), 'utf8'));
const golden = JSON.parse(readFileSync(new URL('../data/golden_cases.json', import.meta.url), 'utf8'));
const data = compactRanges(raw);
const labelOf = (combo) => {
  const [a, b] = [combo.slice(0, 2), combo.slice(2)], R = '23456789TJQKA';
  let [r1, r2] = [R.indexOf(a[0]), R.indexOf(b[0])];
  if (r2 > r1) [r1, r2] = [r2, r1];
  return r1 === r2 ? R[r1] + R[r2] : R[r1] + R[r2] + (a[1] === b[1] ? 's' : 'o');
};

test('grafic: datele compacte și cazurile de aur din Range.pdf pentru „deschis și primit 3-bet”', () => {
  assert.deepEqual(Object.keys(data.rfi), ['UTG', 'HJ', 'CO', 'BTN', 'SB']);
  assert.equal(Object.keys(data.vs3).length, 15);
  let checked = 0;
  for (const g of golden) {
    const m = /^(\w+) vs (\w+) 3Bet$/.exec(g.title);
    if (!m) continue;
    const d = chartDecision(data, m[1], m[2], labelOf(g.combo));
    assert.ok(Math.abs(d.reach - g.expected.reach) < 0.05, `${g.combo} reach`);
    assert.ok(Math.abs(d.call - g.expected.call) < 0.05, `${g.combo} call ${d.call}`);
    assert.ok(Math.abs(d.raise - g.expected.raise) < 0.05, `${g.combo} raise`);
    assert.ok(Math.abs(d.fold - g.expected.fold) < 0.05, `${g.combo} fold`);
    checked++;
  }
  assert.ok(checked >= 3);
  assert.equal(chartDecision(data, 'UTG', 'BB', '72o').reach, 0); // 72o nu se deschide din UTG
  assert.equal(chartDecision(data, 'BB', 'UTG', 'AKo'), null); // BB nu deschide: fără grafic
  assert.equal(chartDecision(data, 'BTN', 'UTG', 'AKo'), null); // UTG nu poate da 3-bet peste BTN
});

test('clasificare: prag 20% / 5%', () => {
  const c = { fold: 80, call: 15, raise: 5 };
  assert.deepEqual(['fold', 'call', 'raise'].map((r) => classifyResponse(c, r)), ['în grafic', 'rar în grafic', 'rar în grafic']);
  assert.equal(classifyResponse({ fold: 98, call: 2, raise: 0 }, 'call'), 'în afara graficului');
});

const parse = (text) => { const p = parseHands(text); for (const h of p.hands) h.cls = classify(h); return p.hands; };

test('3-bet all-in: call-ul se compară cu call + 4-bet', () => {
  const c = { fold: 0, call: 0, raise: 100 };
  assert.equal(classifyResponse(c, 'call'), 'în afara graficului');
  assert.equal(classifyResponse(c, 'call', true), 'în grafic');
  assert.equal(classifyResponse(c, 'fold', true), 'în afara graficului');
  const base = parse(readFileSync(new URL('./fixtures/threebet-hand.txt', import.meta.url), 'utf8'))[0];
  const h = structuredClone(base); h.heroCards = ['Kh', 'Kd']; h.heroPos = 'UTG';
  const pre = h.streets.preflop; const i = pre.findIndex((a) => a.player === 'Hero' && a.type === 'raise');
  pre.splice(i + 1, pre.length, { player: 'sbplayer', pos: 'CO', type: 'raise', amount: 10000, allin: true }, { player: 'Hero', type: 'call', amount: 9000, allin: true });
  const it = computeReview([h], data).items[0];
  assert.equal(it.allin, true);
  assert.equal(it.cls, 'în grafic');
});

test('stack efectiv în afara 70–150 bb: necomparabil', () => {
  const base = parse(readFileSync(new URL('./fixtures/threebet-hand.txt', import.meta.url), 'utf8'))[0];
  const stack = (n) => { const h = structuredClone(base); h.players.find((p) => p.name === 'sbplayer').stack = n; return computeReview([h], data).items[0]; };
  assert.notEqual(stack(200).cls, 'necomparabil'); // 100 bb
  const short = stack(80); // 40 bb
  assert.equal(short.cls, 'necomparabil');
  assert.match(short.why, /stack efectiv 40 bb/);
  assert.equal(stack(400).cls === 'necomparabil', false); // Hero rămâne la 100 bb, deci stackul efectiv este tot 100 bb
});

test('mână reală construită: BTN deschide AJo, SB dă 3-bet, Hero dă fold', () => {
  const hands = parse(readFileSync(new URL('./fixtures/threebet-hand.txt', import.meta.url), 'utf8'));
  assert.equal(hands.length, 1);
  const R = computeReview(hands, data);
  assert.equal(R.items.length, 1);
  const x = R.items[0];
  assert.deepEqual([x.label, x.heroPos, x.villainPos, x.response], ['AJo', 'BTN', 'SB', 'fold']);
  assert.ok(x.chart && x.chart.reach > 0);
  assert.equal(x.cls, classifyResponse(x.chart, 'fold'));
  assert.ok(Math.abs(x.net - -2.5) < 1e-9); // 5 cenți la big blind de 2 cenți
  assert.equal(R.total.n, 1);
});

test('necomparabil: limp înainte sau call între deschidere și 3-bet', () => {
  const base = parse(readFileSync(new URL('./fixtures/threebet-hand.txt', import.meta.url), 'utf8'))[0];
  const withFlat = structuredClone(base);
  const i = withFlat.streets.preflop.findIndex((a) => a.player === 'Hero' && a.type === 'raise');
  withFlat.streets.preflop.splice(i + 1, 0, { street: 'preflop', player: 'bbplayer', pos: 'BB', type: 'call', amount: 3 }); // squeeze
  assert.equal(computeReview([withFlat], data).items[0].cls, 'necomparabil');
  const noChart = structuredClone(base); noChart.heroPos = 'BB'; // BB nu deschide
  assert.equal(computeReview([noChart], data).items[0].cls, 'necomparabil');
  const off = structuredClone(base); off.heroCards = ['7h', '2d'];
  assert.equal(computeReview([off], data).items[0].cls, 'deschis în afara graficului');
});

test('revizuire: rulează pe fixture fără erori, totaluri consistente', () => {
  const hands = parse(readFileSync(new URL('./fixtures/hands.txt', import.meta.url), 'utf8'));
  const R = computeReview(hands, data);
  assert.equal(R.byClass.reduce((s, r) => s + r.n, 0), R.items.length);
});
