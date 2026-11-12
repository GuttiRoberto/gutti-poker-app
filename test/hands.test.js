import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHands } from '../src/hands.js';
import { classify, flopTexture } from '../src/classify.js';
import { computeStats, prop, describeHand } from '../src/stats.js';
import { readZipTexts } from '../src/zip.js';

const text = readFileSync(new URL('./fixtures/hands.txt', import.meta.url), 'utf8');
const parsed = parseHands(text);
const byId = new Map(parsed.hands.map((h) => [h.id, h]));
for (const h of parsed.hands) h.cls = classify(h);
const get = (id) => byId.get(id);

test('parser: cele 20 de mâini reale se citesc fără respingeri și fără linii necunoscute', () => {
  assert.equal(parsed.total, 20);
  assert.equal(parsed.hands.length, 20);
  assert.deepEqual(parsed.rejected, []);
  assert.deepEqual(parsed.unknownLines, {});
  for (const h of parsed.hands) {
    assert.equal(h.players.length, 6, h.id);
    assert.equal(h.heroCards.length, 2, h.id);
    assert.deepEqual(h.players.map((p) => p.pos).sort(), ['BB', 'BTN', 'CO', 'HJ', 'SB', 'UTG'], h.id);
  }
});

test('verificarea potului: bani puși − returnați (+ cash drop) = total pot; încasări + taxe = total pot', () => {
  for (const h of parsed.hands) {
    const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    assert.equal(sum(h.invested) - sum(h.returned) + h.cashDrop, h.pot, h.id);
    assert.equal(sum(h.collected) + sum(h.fees), h.pot, h.id);
    assert.ok(h.checks.potOk && h.checks.payoutOk, h.id);
  }
});

test('parser: câmpuri verificate manual', () => {
  const h = get('RC4782128671'); // Hero HJ deschide 55, BB dă call; check flop, bet turn, bet river, câștigă la showdown
  assert.equal(h.date, '2026-09-05T15:38:53');
  assert.deepEqual([h.sb, h.bb, h.stakes], [1, 2, '0.01/0.02']);
  assert.equal(h.heroPos, 'HJ');
  assert.deepEqual(h.heroCards, ['5s', '5c']);
  assert.deepEqual(h.board, ['7c', 'Ks', '5h', '3h', '6d']);
  assert.deepEqual([h.pot, h.rake], [93, 4]);
  assert.equal(h.heroNetBb, 20);
  assert.ok(h.showdown && h.heroShowdown);
  const turnBet = h.streets.turn.find((a) => a.player === 'Hero');
  assert.deepEqual([turnBet.type, turnBet.amount, turnBet.potBefore], ['bet', 10, 11]); // pot 0.11 înaintea betului
  const riverCall = h.streets.river.find((a) => a.type === 'call');
  assert.deepEqual([riverCall.amount, riverCall.potBefore, riverCall.toCall, riverCall.pos], [31, 62, 31, 'BB']);

  assert.equal(get('RC4782145554').heroNetBb, 0); // fold preflop din CO
  assert.equal(get('RC4782145554').heroPos, 'CO');
  assert.equal(get('RC4782145006').heroNetBb, 0.5); // walk în BB
  assert.equal(get('RC4782145006').showdown, false);
  assert.equal(get('RC4782145619').heroNetBb, -0.5); // SB fold
  assert.equal(get('RC4784189141').heroNetBb, -53.5);
  assert.equal(get('RC4782083000').heroNetBb, 101);

  const raise = get('RC4782081299').streets.flop.find((a) => a.player === 'Hero'); // raise all-in pe flop, restul returnat
  assert.deepEqual([raise.type, raise.to, raise.allin, raise.toCall], ['raise', 284, true, 22]);
  assert.equal(get('RC4782081299').heroNetBb, 19);
});

test('parser: run-it-twice/three, cash drop, cashout, time bank', () => {
  const r3 = get('RC4782146702'); // all-in preflop, rulat de trei ori
  assert.equal(r3.runs, 3);
  assert.deepEqual(r3.flop, ['6c', '7d', '9d']);
  assert.equal(r3.boards.length, 3);
  assert.equal(r3.heroNetBb, -100);
  assert.ok(r3.heroShowdown && r3.heroSawFlop);

  const r2 = get('RC4786750139'); // all-in pe turn, river rulat de două ori, cu cash drop
  assert.equal(r2.runs, 2);
  assert.equal(r2.cashDrop, 20);
  assert.deepEqual(r2.board, ['Ts', '5c', 'Jc', 'Jd', '4s']);
  assert.equal(r2.streets.flop.length, 3);
  assert.equal(r2.heroCollected, 418);
  assert.equal(r2.heroNetBb, 108.5);

  assert.equal(get('RC4784186179').cashDrop, 20);
  assert.equal(get('RC4784186179').streets.flop[0].potBefore, 31); // 0.11 + 0.20 cash drop

  const co = get('RC4796652112'); // alt jucător ia EV cashout; Hero a dat fold preflop
  assert.equal(co.heroNetBb, -2);
  assert.deepEqual(co.cashout, { received: 0, risk: 0, chosen: false });
  const tb = get('RC4796534485'); // alt jucător cumpără „time bank card”; Hero primește 0,01 $ în afara potului
  assert.equal(tb.timeBank, 1);
  assert.equal(tb.heroNetBb, 0); // suma din time bank nu intră în rezultatul mâinii
});

test('clasificare: 14 mâini verificate manual', () => {
  const T = (high, paired, suits, connected) => ({ high, paired, suits, connected });
  const cases = {
    RC4782128671: ['single-raised', 'agresor', 'IP', true, T('K', false, 'rainbow', false)],
    RC4784189141: ['single-raised', 'caller', 'OOP', true, T('9 sau mai jos', false, 'două de o culoare', true)],
    RC4782146702: ['4-bet+', 'caller', 'IP', true, T('9 sau mai jos', false, 'două de o culoare', true)],
    RC4782081299: ['3-bet', 'caller', 'IP', true, T('9 sau mai jos', true, 'două de o culoare', true)],
    RC4782132782: ['single-raised', 'agresor', 'OOP', false, T('A', false, 'monoton', false)],
    RC4784186179: ['single-raised', 'caller', 'IP', true, T('A', false, 'rainbow', true)],
    RC4782145498: ['limpat', 'blind', 'OOP', false, T('A', false, 'două de o culoare', false)],
    RC4782146075: ['3-bet', 'agresor', 'OOP', true, T('K', true, 'rainbow', false)],
    RC4782047740: ['4-bet+', 'agresor', 'IP', true, T('J–T', false, 'două de o culoare', false)],
    RC4782082460: ['single-raised', 'caller', 'IP', true, T('9 sau mai jos', false, 'rainbow', true)],
    RC4782083000: ['3-bet', 'agresor', 'OOP', true, T('9 sau mai jos', false, 'două de o culoare', false)],
    RC4782128225: ['3-bet', 'caller', 'OOP', true, T('9 sau mai jos', true, 'rainbow', true)],
    RC4786697670: ['single-raised', 'caller', 'OOP', true, T('K', false, 'monoton', false)],
    RC4786750139: ['single-raised', 'caller', 'IP', false, T('J–T', false, 'două de o culoare', false)],
  };
  for (const [id, [potType, role, position, headsUp, texture]] of Object.entries(cases)) {
    const c = get(id).cls;
    assert.deepEqual([c.potType, c.heroRole, c.position, c.headsUp, c.texture], [potType, role, position, headsUp, texture], id);
  }
  assert.equal(get('RC4782132782').cls.flopPlayers.length, 4);
  assert.equal(get('RC4782145554').cls.sawFlop, false);
  assert.equal(get('RC4782145554').cls.heroRole, null);
});

test('textura flopului: cazuri-limită', () => {
  assert.equal(flopTexture(['Ah', '2d', '3c']).connected, true); // asul ca și carte mică
  assert.equal(flopTexture(['Ah', 'Kd', 'Tc']).connected, true);
  assert.equal(flopTexture(['Ah', '9d', '4c']).connected, false);
  assert.equal(flopTexture(['Jh', '6d', '2c']).high, 'J–T');
  assert.equal(flopTexture(['9h', '9d', '9c']).paired, true);
});

// Mâini sintetice: arhiva reală are doar mese pline, deci mesele incomplete se verifică pe text construit.
const synthetic = (seats, button, sb, bb, extra = '') => `Poker Hand #SYN${seats.length}${button}: Hold'em No Limit ($0.01/$0.02) - 2026/01/01 10:00:00
Table 'Test' 6-max Seat #${button} is the button
${seats.map((s) => `Seat ${s}: ${s === seats[0] ? 'Hero' : 'p' + s} ($2 in chips)`).join('\n')}
${sb}: posts small blind $0.01
${bb}: posts big blind $0.02
*** HOLE CARDS ***
Dealt to Hero [Ah Kh]
${extra}${seats.map((s) => (s === seats[0] ? 'Hero' : 'p' + s)).filter((n) => n !== bb).map((n) => `${n}: folds`).join('\n')}
Uncalled bet ($0.01) returned to ${bb}
*** SHOWDOWN ***
${bb} collected $0.02 from pot
*** SUMMARY ***
Total pot $0.02 | Rake $0 | Jackpot $0 | Bingo $0 | Fortune $0 | Tax $0
`;

test('poziții la mese incomplete (mâini sintetice)', () => {
  const pos = (txt) => Object.fromEntries(parseHands(txt).hands[0].players.map((p) => [p.name, p.pos]));
  assert.deepEqual(pos(synthetic([1, 2, 4, 5, 6], 6, 'Hero', 'p2')), { Hero: 'SB', p2: 'BB', p4: 'HJ', p5: 'CO', p6: 'BTN' });
  assert.deepEqual(pos(synthetic([2, 3, 5, 6], 3, 'p5', 'p6')), { Hero: 'CO', p3: 'BTN', p5: 'SB', p6: 'BB' });
  assert.deepEqual(pos(synthetic([1, 3, 4], 4, 'Hero', 'p3')), { Hero: 'SB', p3: 'BB', p4: 'BTN' });
  assert.deepEqual(pos(synthetic([2, 5], 2, 'Hero', 'p5')), { Hero: 'BTN', p5: 'BB' }); // heads-up: butonul pune blindul mic
});

test('dubluri, linii necunoscute și mâini respinse', () => {
  const one = text.split(/\n(?=Poker Hand #)/)[0];
  const twice = parseHands(one + '\n\n' + one);
  assert.deepEqual([twice.hands.length, twice.duplicates], [1, 1]);

  const odd = parseHands(one.replace('*** SHOWDOWN ***', 'Hero: does something new $0.05\n*** SHOWDOWN ***'));
  assert.equal(odd.hands.length, 1);
  assert.deepEqual(Object.values(odd.unknownLines), [1]);

  const broken = parseHands(one.replace(/Total pot \$[\d.]+/, 'Total pot $9.99'));
  assert.equal(broken.hands.length, 0);
  assert.match(broken.rejected[0].reason, /potul nu se verifică/);

  assert.match(parseHands(one.replace("Hold'em No Limit", 'Omaha Pot Limit')).rejected[0].reason, /joc nesuportat/);
});

test('statistici: interval Wilson și calcule pe fixture', () => {
  const p = prop(50, 100);
  assert.ok(Math.abs(p.lo - 40.38) < 0.01 && Math.abs(p.hi - 59.62) < 0.01 && !p.few);
  assert.ok(prop(5, 10).few);
  assert.equal(prop(0, 0).p, null);

  const s = computeStats(parsed.hands);
  assert.equal(s.summary.all.n, 20);
  const net = parsed.hands.reduce((a, h) => a + h.heroNetBb, 0);
  assert.ok(Math.abs(s.summary.all.net - net) < 1e-9);
  assert.ok(Math.abs(s.summary.preflopOnly.net + s.summary.flop.net - net) < 1e-9);
  assert.ok(Math.abs(s.money.reduce((a, r) => a + r.net, 0) - s.summary.flop.net) < 1e-9);
  // Hero agresor cu ocazie de c-bet: 671 (check), 146075 (check), 047740 (bet), 083000 (check); în 132782 BB pariază primul
  assert.deepEqual([s.aggressor.cbet[0].k, s.aggressor.cbet[0].n], [1, 4]);
  // contra c-bet: 189141 call, 081299 raise, 186179 call, 082460 fold, 697670 raise
  assert.deepEqual([s.defender.vsCbet.n, s.defender.vsCbet.fold.k, s.defender.vsCbet.call.k, s.defender.vsCbet.raise.k], [5, 1, 2, 2]);
  assert.deepEqual([s.defender.donk.k, s.defender.checkRaise.k], [1, 1]); // 925510802 donk; 697670 check-raise
  // call-uri pe river: 189141 (pierdut), 083000 (câștigat), 697670 (pierdut)
  assert.deepEqual([s.riverCalls.won.k, s.riverCalls.won.n], [1, 3]);
  // beturi pe river: 671 plătit și câștigat, 128225 fold
  assert.deepEqual([s.riverBets.n, s.riverBets.won.k, s.riverBets.fold.k], [2, 1, 1]);
  assert.equal(s.worst[0].id, 'RC4782146702');
  assert.equal(describeHand(s.worst[0])[0].street, 'preflop');
});

test('zip: arhivă „stored” construită în test', async () => {
  const enc = new TextEncoder(), name = enc.encode('a/b.txt'), data = enc.encode('Poker Hand #X');
  const local = new Uint8Array(30 + name.length + data.length), lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, name.length, true);
  local.set(name, 30); local.set(data, 30 + name.length);
  const cd = new Uint8Array(46 + name.length), cv = new DataView(cd.buffer);
  cv.setUint32(0, 0x02014b50, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true); cv.setUint32(42, 0, true);
  cd.set(name, 46);
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, 1, true); ev.setUint16(10, 1, true); ev.setUint32(12, cd.length, true); ev.setUint32(16, local.length, true);
  const zip = new Uint8Array([...local, ...cd, ...end]);
  assert.deepEqual(await readZipTexts(zip.buffer), [{ name: 'a/b.txt', text: 'Poker Hand #X' }]);
});

// mână construită de test: nouă blinduri + straddle de la UTG, toți dau fold la straddle
const STRADDLE_HAND = `Poker Hand #RCTEST1: Hold'em No Limit ($0.01/$0.02) - 2026/09/05 15:49:48
Table 'RushAndCash1' 6-max Seat #1 is the button
Seat 1: 554a4f14 ($2.11 in chips)
Seat 2: 3f02542d ($5.71 in chips)
Seat 3: bcdbc542 ($2.07 in chips)
Seat 4: 9cca95e1 ($2 in chips)
Seat 5: 3d44ea74 ($2.15 in chips)
Seat 6: Hero ($11.15 in chips)
3f02542d: posts small blind $0.01
bcdbc542: posts big blind $0.02
9cca95e1: straddle $0.04
*** HOLE CARDS ***
Dealt to 554a4f14 
Dealt to 3f02542d 
Dealt to bcdbc542 
Dealt to 9cca95e1 
Dealt to 3d44ea74 
Dealt to Hero [9s Qh]
3d44ea74: folds
Hero: folds
554a4f14: folds
3f02542d: folds
bcdbc542: folds
Uncalled bet ($0.02) returned to 9cca95e1
*** SHOWDOWN ***
9cca95e1 collected $0.05 from pot
*** SUMMARY ***
Total pot $0.05 | Rake $0 | Jackpot $0 | Bingo $0 | Fortune $0 | Tax $0
Seat 1: 554a4f14 (button) folded before Flop (didn't bet)
Seat 6: Hero folded before Flop (didn't bet)
`;

test('straddle: linia „straddle $N” se citește, potul se verifică, nu mai rămân linii necunoscute', () => {
  const r = parseHands(STRADDLE_HAND);
  assert.deepEqual(r.rejected, []);
  assert.deepEqual(r.unknownLines, {});
  assert.equal(r.hands.length, 1);
  assert.equal(r.hands[0].heroNet, 0);
  // straddle și all-in
  const allin = STRADDLE_HAND.replace('9cca95e1: straddle $0.04', '9cca95e1: straddle $0.04 and is all-in');
  assert.equal(parseHands(allin).hands.length, 1);
});

test('antet: detaliile suplimentare din paranteză sunt acceptate, iar un antet necunoscut este raportat cu eșantion', () => {
  const ante = STRADDLE_HAND.replace('($0.01/$0.02)', '($0.01/$0.02 ante $0.00)');
  assert.equal(parseHands(ante).hands.length, 1);
  const weird = STRADDLE_HAND.replace("Hold'em No Limit ($0.01/$0.02) - 2026/09/05 15:49:48", 'ceva complet diferit');
  const r = parseHands(weird);
  assert.equal(r.hands.length, 0);
  assert.equal(r.rejected[0].reason, 'antet necunoscut');
  assert.match(r.rejected[0].sample, /^Poker Hand #RCTEST1: ceva complet diferit/);
});
