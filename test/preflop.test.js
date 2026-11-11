import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadRanges, scenarios, strategy, rangeFor, rangeString, ALL_COMBOS } from '../src/preflop.js';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url)));
const json = read('ranges.json');
const golden = read('golden_cases.json');
loadRanges(json);
const close = (a, b, tol = 0.01) => Math.abs(a - b) <= tol + 1e-9;

test('1. cazurile golden (toleranță 0,01)', () => {
  for (const g of golden) {
    const s = strategy(g.scenario, g.combo);
    const tag = `#${g.scenario} ${g.combo}`;
    assert.ok(s && !s.blocked, tag);
    for (const [k, v] of Object.entries(g.expected)) {
      const got = k === 'reach' ? s.reach : s.actions[k];
      assert.ok(close(got, v), `${tag} ${k}: așteptat ${v}, obținut ${got}`);
    }
  }
});

test('2. scenarii ok: suma = 100, nimic negativ', () => {
  let n = 0;
  for (const sc of scenarios().filter((s) => s.status === 'ok')) {
    for (const combo of ALL_COMBOS) {
      const s = strategy(sc.id, combo);
      if (s === null) continue;
      n++;
      const vals = Object.values(s.actions);
      const tag = `#${sc.id} ${combo} ${JSON.stringify(s)}`;
      assert.ok(s.reach > 0, tag);
      assert.ok(vals.every((v) => v >= 0), tag);
      assert.ok(close(vals.reduce((a, b) => a + b, 0), 100), tag);
    }
  }
  assert.ok(n > 0);
});

test('3. cele 11 scenarii blocate întorc blocked', () => {
  const ids = [15, 45, 67, 69, 71, 72, 89, 92, 130, 131, 138];
  assert.deepEqual(scenarios().filter((s) => s.status === 'blocked').map((s) => s.id), ids);
  for (const id of ids) {
    const s = strategy(id, 'AhKd');
    assert.equal(s.blocked, true);
    assert.ok(s.reason);
  }
});

test('4. rangeFor: exact 1326 de chei, ponderi 0–1, pentru orice range', () => {
  for (const id of Object.keys(json.ranges)) {
    const r = rangeFor(id);
    const vals = Object.values(r);
    assert.equal(vals.length, 1326, id);
    assert.ok(vals.every((v) => v >= 0 && v <= 1), id);
  }
});

test('5. ordinea cărților, rangeString și combos', () => {
  assert.deepEqual(strategy(21, '6h5h'), strategy(21, '5h6h'));
  assert.equal(rangeFor('1')['6h5h'], 0.364);
  const str = rangeString('1');
  assert.ok(str.split(',').includes('65s:0.364') && str.split(',').includes('AA'));
  assert.throws(() => strategy(1, 'AhAh'));
  // `combos` are prioritate față de `classes`
  const copy = structuredClone(json);
  copy.ranges['1'].combos = { '5h6h': 50 };
  loadRanges(copy);
  assert.equal(strategy(1, '6h5h').actions.raise, 50);
  assert.equal(strategy(1, '6s5s').actions.raise, 36.4);
  const parts = rangeString('1').split(',');
  assert.ok(parts.includes('6h5h:0.5') && parts.includes('6s5s:0.364') && !parts.includes('65s:0.364'));
  loadRanges(json);
});
