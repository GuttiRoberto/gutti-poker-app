import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeries, sampleIndexes, niceTicks, chartSvg } from '../src/graph.js';

const hand = (date, netBb, luckBb = null, bb = 2) => ({ date, bb, heroNetBb: netBb, heroNet: netBb * bb, allin: luckBb == null ? undefined : { luck: luckBb * bb, equity: 0.5 } });

test('serie: sume cumulate în ordine cronologică, EV = real − noroc cumulat', () => {
  const hands = [hand('2026-09-02T10:00:00', -100, -100), hand('2026-09-01T10:00:00', 10), hand('2026-09-03T10:00:00', 50, 20)]; // date amestecate
  const S = buildSeries(hands, 'bb');
  assert.equal(S.n, 3);
  assert.deepEqual(Array.from(S.real), [0, 10, -90, -40]);
  // noroc: 0, apoi −100, apoi +20 => EV = real − noroc cumulat
  assert.deepEqual(Array.from(S.ev), [0, 10, 10, -40 - (-80)]);
  const usd = buildSeries(hands, 'usd'); // sume în $ (bb = 2 cenți)
  assert.ok(Math.abs(usd.real[3] - (-40 * 2) / 100) < 1e-12);
  assert.ok(Math.abs(usd.ev[3] - (S.ev[3] * 2) / 100) < 1e-12);
  // mâini fără all-in calculat: linia EV merge împreună cu cea reală
  const plain = buildSeries([hand('2026-09-01T10:00:00', 5), hand('2026-09-01T10:01:00', -3)], 'bb');
  assert.deepEqual(Array.from(plain.ev), Array.from(plain.real));
});

test('eșantionare și gradații', () => {
  assert.deepEqual(sampleIndexes(3), [0, 1, 2, 3]);
  const idx = sampleIndexes(50000, 1200);
  assert.ok(idx.length <= 1200 && idx[0] === 0 && idx.at(-1) === 50000);
  assert.ok(idx.every((v, i) => i === 0 || v > idx[i - 1]));
  const t = niceTicks(-3.8, 6.2, 5);
  assert.ok(t[0] <= -3.8 && t.at(-1) >= 6.2);
  assert.ok(t.some((v) => v === 0));
  assert.deepEqual(niceTicks(0, 100, 5), [0, 20, 40, 60, 80, 100]);
  assert.ok(niceTicks(0, 0).length >= 2); // interval gol: tot se desenează
});

test('desen: două linii, indicator și etichete', () => {
  const S = buildSeries([hand('2026-09-01T10:00:00', 10, 4), hand('2026-09-01T10:01:00', -20, -5)], 'bb');
  const svg = chartSvg(S, 'bb');
  assert.match(svg, /<svg id="evChart"/);
  assert.equal((svg.match(/class="l-real"/g) ?? []).length, 1);
  assert.equal((svg.match(/class="l-ev"/g) ?? []).length, 1);
  assert.match(svg, /id="evCursor"/);
  assert.match(chartSvg(buildSeries([hand('2026-09-01T10:00:00', 1)], 'usd'), 'usd'), /\$/);
  assert.doesNotThrow(() => chartSvg(buildSeries([], 'bb'), 'bb')); // fără mâini
});
