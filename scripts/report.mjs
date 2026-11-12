// Rezumat în terminal pentru arhive .zip, fișiere .txt sau directoare.
// Utilizare: node scripts/report.mjs <cale> [<cale> ...]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseHands } from '../src/hands.js';
import { classify } from '../src/classify.js';
import { computeStats } from '../src/stats.js';
import { readZipTexts } from '../src/zip.js';

const texts = [];
async function add(p) {
  if (statSync(p).isDirectory()) { for (const f of readdirSync(p)) await add(join(p, f)); return; }
  if (/\.zip$/i.test(p)) { const b = readFileSync(p); texts.push(...(await readZipTexts(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)))); }
  else if (/\.txt$/i.test(p)) texts.push({ name: p, text: readFileSync(p, 'utf8') });
}
for (const p of process.argv.slice(2)) await add(p);

const seen = new Set(), hands = [], rejected = [], unknown = {};
let duplicates = 0, total = 0;
for (const t of texts) {
  const r = parseHands(t.text, seen);
  hands.push(...r.hands); rejected.push(...r.rejected); duplicates += r.duplicates; total += r.total;
  for (const [k, v] of Object.entries(r.unknownLines)) unknown[k] = (unknown[k] ?? 0) + v;
}
for (const h of hands) h.cls = classify(h);
const s = computeStats(hands);
const f = (p) => (p.n ? `${p.p.toFixed(1)}% (${p.k}/${p.n}, IC 95% ${p.lo.toFixed(0)}–${p.hi.toFixed(0)}%)${p.few ? ' — prea puține mâini' : ''}` : 'fără cazuri');
console.log(`Fișiere: ${texts.length} · mâini în fișiere: ${total} · citite: ${hands.length} · respinse: ${rejected.length} · dubluri: ${duplicates}`);
for (const r of rejected) console.log(`  respinsă ${r.id}: ${r.reason}`);
console.log(`Linii necunoscute: ${Object.values(unknown).reduce((a, b) => a + b, 0)}`, Object.keys(unknown).length ? unknown : '');
console.log(`Rezultat net: ${s.summary.all.net.toFixed(1)} bb (${s.summary.all.bb100?.toFixed(1)} bb/100) · preflop ${s.summary.preflopOnly.net.toFixed(1)} bb · cu flop ${s.summary.flop.net.toFixed(1)} bb (${s.summary.flop.n} mâini)`);
console.log(`C-bet flop heads-up: ${f(s.aggressor.cbet[1])}`);
console.log(`Fold contra c-bet: ${f(s.defender.vsCbet.fold)}`);
console.log(`Ajunge la showdown: ${f(s.showdown.wtsd)} · câștigă la showdown: ${f(s.showdown.wsd)}`);
console.log(`Call-uri pe river câștigate: ${f(s.riverCalls.won)} · echitate necesară ${s.riverCalls.need?.toFixed(1)}% · rezultat ${s.riverCalls.callNet.toFixed(1)} bb`);
