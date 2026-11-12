import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHands } from '../src/hands.js';
import { classify } from '../src/classify.js';
import { evalCards, equities, cardId } from '../src/equity.js';
import { allinEv, summarizeAllin } from '../src/allin.js';

const C = (s) => s.split(' ').map(cardId);
const ev = (s) => evalCards(C(s), 7);
const pct = (x) => 100 * x;

test('evaluator: ordinea categoriilor și roata A-2-3-4-5', () => {
  const order = [
    ev('As Ks Qs Js Ts 2d 3c'), // chintă royală
    ev('9h 9d 9c 9s Ad 2d 3c'), // careu
    ev('Ah Ad Ac Kd Kc 2d 3c'), // full
    ev('2s 5s 9s Js Ks 2d 3c'), // culoare
    ev('Ts 9d 8c 7h 6s 2d 2c'), // chintă
    ev('7h 7d 7c Kd Qc 2d 3c'), // set
    ev('Ah Ad Kc Kd Qc 2d 3c'), // două perechi
    ev('Ah Ad Kc Qd Jc 2d 3c'), // pereche
    ev('Ah Kd Qc Jd 9c 2d 3c'), // carte mare
  ];
  for (let i = 1; i < order.length; i++) assert.ok(order[i - 1] > order[i], `categoria ${i - 1} bate categoria ${i}`);
  assert.ok(ev('Ah 2d 3c 4s 5h 9d Kc') < ev('2h 3d 4c 5s 6h 9d Kc')); // roata pierde în fața chintei până la 6
  assert.ok(ev('Ah Kd Qc Jd 9c 2d 3c') > ev('Kh Qd Jc Td 8c 2d 3c')); // kicker
  assert.equal(ev('Ah Ad Kc Kd Qc 2d 3c'), ev('Ah Ad Kc Kd Qs 2s 3h')); // aceeași mână, alte culori
  assert.equal(ev('Ah Ad Kc Kd Qc 2d 3c'), ev('Ah Ad Kc Kd Qc Qd 3c')); // a treia pereche contează doar ca kicker
});

test('echitate: valori cunoscute, egalitate și mai mulți jucători', () => {
  const e = (hands, board = []) => equities(hands.map(C), board.map(cardId));
  const approx = (x, want, tol) => assert.ok(Math.abs(pct(x) - want) < tol, `${pct(x).toFixed(2)} nu e aproape de ${want}`);
  // valorile de referință sunt numărate exact (toate cele 1.712.304 de board-uri); preflop pagina folosește o simulare cu eroare de ~0,3%
  approx(e(['Ah Ad', '7s 7c'])[0], 79.8, 1.0);
  approx(e(['Ah Ad', '7h 7d'])[0], 81.1, 1.0); // culorile contează: 77 în aceleași culori cu AA
  approx(e(['Ah Kh', 'Qs Qd'])[0], 46.2, 1.0);
  approx(e(['7h 2d', 'As Ac'])[0], 12.6, 1.0);
  approx(e(['Ah Kd', '2s 2c'])[0], 47.0, 1.0);
  const three = e(['Ah Ad', 'Kh Kd', 'Qh Qd']);
  assert.ok(Math.abs(three.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  // turn cu draw la culoare nuts și două over-cards contra QQ: se numără exact cele 44 de cărți de river
  const turn = e(['Ah Kh', 'Qs Qd'], ['2h', '9h', 'Jc', '3s']);
  assert.ok(Math.abs(turn[0] + turn[1] - 1) < 1e-9);
  approx(turn[0], 34.1, 0.05);
  assert.equal(e(['Ah Kh', 'Qs Qd'], ['2h', '9h', 'Jc', '3s', '5d'])[0], 0);
  // aceeași mână împărțită: egalitate pe board
  assert.deepEqual(e(['Ah Kd', 'As Kc'], ['2h', '2d', '7c', '9s', 'Tc']), [0.5, 0.5]);
  // aceleași cărți, culori redenumite: același rezultat (și din memorie)
  assert.deepEqual(e(['Ah Ad', '7s 7c']), e(['As Ac', '7h 7d']));
});

const text = readFileSync(new URL('./fixtures/hands.txt', import.meta.url), 'utf8');
const parsed = parseHands(text);
for (const h of parsed.hands) h.cls = classify(h);
const byId = Object.fromEntries(parsed.hands.map((h) => [h.id, h]));

test('all-in: QQ contra KK preflop, call pe turn, river', () => {
  const qq = allinEv(byId.RC4782146702);
  assert.equal(qq.street, 'preflop');
  assert.ok(qq.equity > 0.15 && qq.equity < 0.19, `QQ vs KK: ${qq.equity}`);
  const collected = Object.values(byId.RC4782146702.collected).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(qq.expected - qq.equity * collected) < 1e-6);
  assert.ok(Math.abs(qq.luck - (byId.RC4782146702.heroCollected - qq.expected)) < 1e-6);
  assert.ok(qq.luck < 0); // Hero nu a încasat nimic deși avea ~17% din pot în medie

  const turn = allinEv(byId.RC4786750139);
  assert.equal(turn.street, 'turn');
  assert.ok(turn.equity > 0.8 && turn.equity < 0.9);
  const river = allinEv(byId.RC4782083000);
  assert.equal(river.street, 'river');
  assert.equal(river.equity, 1);
  assert.equal(river.luck, 0); // la all-in pe river nu mai există noroc
});

test('all-in: mâinile fără all-in cu showdown nu se numără', () => {
  const withAi = parsed.hands.filter((h) => allinEv(h));
  assert.deepEqual(withAi.map((h) => h.id).sort(), ['RC4782083000', 'RC4782146702', 'RC4786750139']);
  assert.equal(allinEv(parsed.hands.find((h) => !h.heroShowdown)), null);
});

test('all-in: cashout, side pot și cărți necunoscute sunt sărite, nu calculate greșit', () => {
  const base = byId.RC4782146702;
  assert.equal(allinEv({ ...base, cashout: { received: 5, risk: 0, chosen: true } }).skip, 'EV cashout');
  assert.equal(allinEv({ ...base, shown: {}, heroCards: base.heroCards }).skip, 'cărți necunoscute');
  assert.equal(allinEv({ ...base, invested: { ...base.invested, Hero: base.invested.Hero + 100 } }).skip, 'side pot');
  assert.equal(allinEv({ ...base, checks: { ...base.checks, payoutOk: false } }).skip, 'plată neobișnuită');
});

test('sinteză: noroc, marjă și grupare după echitate', () => {
  for (const h of parsed.hands) h.allin = allinEv(h);
  const s = summarizeAllin(parsed.hands);
  assert.equal(s.n, 3);
  assert.equal(s.pending, 0);
  const luck = parsed.hands.filter((h) => h.allin?.equity != null).reduce((a, h) => a + h.allin.luck / h.bb, 0);
  assert.ok(Math.abs(s.luckBb - luck) < 1e-9);
  assert.ok(Math.abs(s.evNet - (s.net - s.luckBb)) < 1e-9);
  assert.ok(s.se > 0);
  assert.equal(s.bands.reduce((a, b) => a + b.n, 0), 2); // all-in-ul de pe river nu intră în grupe
  // mâini fără câmpul calculat sunt „în așteptare”
  assert.equal(summarizeAllin(parsed.hands.map((h) => ({ ...h, allin: undefined }))).pending, 20);
});
