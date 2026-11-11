// Generează spot.json: range-urile vin din modulul de la pasul 1 (rangeString),
// trecute prin parserul de range al wasm-postflop și verificate față de rangeFor.
// Utilizare: node make-spot.mjs <cale către wasm-postflop/pkg>
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadRanges, rangeFor, rangeString } from '../src/preflop.js';

const pkg = resolve(process.argv[2] ?? '../../wasm-postflop/pkg');
loadRanges(JSON.parse(readFileSync(new URL('../data/ranges.json', import.meta.url))));

const bg = await import(pathToFileURL(`${pkg}/range/range_bg.js`));
const { instance } = await WebAssembly.instantiate(readFileSync(`${pkg}/range/range_bg.wasm`), { './range_bg.js': bg });
bg.__wbg_set_wasm(instance.exports);

// Codificarea solverului: carte = rang*4 + culoare (2=0 … A=12; c=0,d=1,h=2,s=3)
const card = (s) => '23456789TJQKA'.indexOf(s[0]) * 4 + 'cdhs'.indexOf(s[1]);
const pairIndex = (a, b) => (a > b ? pairIndex(b, a) : (a * (101 - a)) / 2 + b - 1);

function raw(rangeId) {
  const str = rangeString(rangeId);
  const m = bg.RangeManager.new();
  const err = m.from_string(str);
  if (err) throw new Error(`Range ${rangeId}: ${err}`);
  const data = Array.from(m.raw_data());
  const mine = new Array(1326).fill(0);
  for (const [k, w] of Object.entries(rangeFor(rangeId))) mine[pairIndex(card(k.slice(0, 2)), card(k.slice(2)))] = w;
  const diff = Math.max(...data.map((v, i) => Math.abs(v - mine[i])));
  if (data.length !== 1326 || diff > 1e-4) throw new Error(`Range ${rangeId}: nepotrivire rangeString/rangeFor (${diff})`);
  return { str, data, combos: data.reduce((a, b) => a + b, 0) };
}

const UNIT = 10; // jetoane pe 1bb (solverul lucrează cu întregi)
const oop = raw('9A'), ip = raw('4');
const bet = '33%,75%,a', raise = '3x';
const spot = {
  unit: UNIT,
  oop: { pos: 'BB', range: '9A', str: oop.str, raw: oop.data },
  ip: { pos: 'BTN', range: '4', str: ip.str, raw: ip.data },
  board: ['Ks', '7d', '2c'].map(card),
  startingPot: 5.5 * UNIT,
  effectiveStack: 97.5 * UNIT,
  rakeRate: 0, // configurabil (fracție, ex. 0.05)
  rakeCap: 0, // în jetoane
  bet, raise,
  addAllInThreshold: 1.5, forceAllInThreshold: 0.2, mergingThreshold: 0.1, // valorile implicite ale interfeței
  targetPct: 0.5, // % din pot
  maxIterations: 1000,
};
writeFileSync(new URL('./spot.json', import.meta.url), JSON.stringify(spot));
console.log(`spot.json scris: OOP ${oop.combos.toFixed(1)} combinații, IP ${ip.combos.toFixed(1)} combinații, board ${spot.board}`);
