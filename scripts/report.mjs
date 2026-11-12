// Rezumat în terminal pentru arhive .zip, fișiere .txt sau directoare.
// Utilizare: node scripts/report.mjs <cale> [<cale> ...]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseHands } from '../src/hands.js';
import { classify } from '../src/classify.js';
import { computeStats } from '../src/stats.js';
import { readZipTexts } from '../src/zip.js';
import { computeBreakdowns } from '../src/breakdowns.js';

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

// Defalcări (pasul 4)
const B = computeBreakdowns(hands);
const n1 = (x, d = 1) => (x == null ? '–' : (x > 0 ? '+' : '') + x.toFixed(d));
const sm = (r) => (r.small ? ' [eșantion mic]' : '');
const line = (cells) => console.log('  ' + cells.join(' | '));
console.log(`\nPe miză (bb calculat pe mână, cu big blind-ul acelei mâini)`);
for (const r of [...B.byStake, { stakes: 'total', ...B.total }]) line([r.stakes.padEnd(9), `${r.n} mâini${sm(r)}`, `${n1(r.net)} bb`, `${n1(r.usd, 2)} $`, `${n1(r.bb100)} bb/100`, `IC 95% ${n1(r.ci.lo)} … ${n1(r.ci.hi)}`]);
console.log(`  deviație standard: ${B.total.ci.sd100?.toFixed(1)} bb la 100 de mâini`);
console.log(`\nMâini terminate preflop`);
const pre = (label, r) => line([label.padEnd(17), `${r.n} mâini${sm(r)}`, `${n1(r.net)} bb`, `${n1(r.bb100)} bb/100`, `blinduri −${r.blinds.toFixed(1)}`, `fără blinduri ${n1(r.netNoBlinds)}`]);
for (const r of B.preflop.byPos) pre(r.pos, r);
pre('SB + BB', B.preflop.blinds); pre('celelalte poziții', B.preflop.others); pre('total', B.preflop.total);
console.log(`  blinduri postate în toate mâinile: ${B.preflop.blindsAllHands.toFixed(1)} bb`);
console.log(`\nSingle-raised, caller, OOP, heads-up (față de „fold la tot”)`);
const rr = (label, r) => line([label.padEnd(14), `${r.n} mâini${sm(r)}`, `${n1(r.net)} bb`, r.ref == null ? 'fără reper' : `fold la tot ${n1(r.ref)}`, r.diff == null ? '' : `diferență ${n1(r.diff)} bb (${n1(r.diffPerHand, 2)}/mână)`]);
for (const g of B.srpCallerOop.byHero) { rr(`Hero ${g.heroPos}`, g); for (const o of g.byOpener) rr(`  contra ${o.opener}`, o); }
rr('total', { ...B.srpCallerOop.total, ref: null, diff: null });
const L = B.lostShowdown;
console.log(`\nMâini pierdute la showdown: ${L.n}${sm(L)}, ${n1(L.net)} bb`);
for (const [st, x] of [...Object.entries(L.streets), ['total', L.totals]]) line([st.padEnd(8), `investit ${x.total.toFixed(1)} bb`, `call ${x.call.toFixed(1)}`, `bet/raise ${x.raise.toFixed(1)}`, `blinduri ${x.blind.toFixed(1)}`]);
for (const g of L.byLast) line([g.label, `${g.n} mâini${sm(g)}`, `${n1(g.net)} bb`]);
