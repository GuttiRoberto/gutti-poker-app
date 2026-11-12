import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHands } from '../src/hands.js';
import { splitRawHands, memoryBackend, createHandStore, openBrowserStore } from '../src/store.js';

const text = readFileSync(new URL('./fixtures/hands.txt', import.meta.url), 'utf8');

test('încărcare: textul se împarte în mâini brute cu ID, la fel ca în parser', () => {
  const { records, stray } = splitRawHands(text);
  assert.equal(records.length, 20);
  assert.deepEqual(stray, []);
  assert.deepEqual(records.map((r) => r.id), parseHands(text).hands.map((h) => h.id));
  assert.ok(records.every((r) => r.text.startsWith(`Poker Hand #${r.id}:`)));
  // terminații Windows, BOM și text străin
  const messy = splitRawHands('﻿ceva străin\r\n\r\n' + text.replace(/\n/g, '\r\n'));
  assert.equal(messy.records.length, 20);
  assert.equal(messy.stray.length, 1);
  assert.deepEqual(splitRawHands('').records, []);
});

test('duplicate: aceeași mână nu se adaugă a doua oară (după ID)', async () => {
  const store = await createHandStore(memoryBackend());
  const { records } = splitRawHands(text);
  const first = await store.add(records);
  assert.deepEqual([first.added.length, first.duplicates, store.count()], [20, 0, 20]);
  const again = await store.add(records);
  assert.deepEqual([again.added.length, again.duplicates, store.count()], [0, 20, 20]);
  // fișier nou care se suprapune parțial: intră doar mâinile noi
  const fresh = { id: 'RC_NOU', text: records[0].text.replace(records[0].id, 'RC_NOU') };
  const mixed = await store.add([records[3], fresh, records[7], fresh]);
  assert.deepEqual([mixed.added.map((r) => r.id), mixed.duplicates, store.count()], [['RC_NOU'], 3, 21]);
});

test('persistență: o vizită nouă găsește mâinile păstrate și ignoră ce există deja', async () => {
  const backend = memoryBackend(); // ține locul bazei IndexedDB între două „vizite”
  const { records } = splitRawHands(text);
  const visit1 = await createHandStore(backend);
  await visit1.add(records.slice(0, 12));

  const visit2 = await createHandStore(backend);
  assert.equal(visit2.count(), 12);
  const res = await visit2.add(records); // toată arhiva din nou: doar cele 8 noi intră
  assert.deepEqual([res.added.length, res.duplicates, visit2.count()], [8, 12, 20]);

  // textul păstrat, trecut din nou prin parser, dă exact aceleași mâini și același rezultat
  const saved = await (await createHandStore(backend)).all();
  const a = parseHands(saved.map((r) => r.text).join('\n\n')), b = parseHands(text);
  assert.deepEqual(a.rejected, []);
  assert.deepEqual(a.hands.map((h) => h.id).sort(), b.hands.map((h) => h.id).sort());
  const net = (p) => p.hands.reduce((s, h) => s + h.heroNet, 0);
  assert.equal(net(a), net(b));
});

test('„șterge tot” golește depozitul, iar mâinile pot fi încărcate din nou', async () => {
  const backend = memoryBackend();
  const store = await createHandStore(backend);
  const { records } = splitRawHands(text);
  await store.add(records);
  await store.clear();
  assert.equal(store.count(), 0);
  assert.equal((await createHandStore(backend)).count(), 0);
  assert.equal((await store.add(records)).added.length, 20);
});

test('fără IndexedDB pagina lucrează în memorie; o scriere eșuată nu marchează mâinile ca păstrate', async () => {
  const store = await openBrowserStore(null);
  assert.equal(store.persistent, false);
  assert.equal((await store.add(splitRawHands(text).records)).added.length, 20);

  const broken = { persistent: true, all: async () => [], putMany: async () => { throw new Error('disc plin'); }, clear: async () => {} };
  const s2 = await createHandStore(broken);
  await assert.rejects(() => s2.add([{ id: 'X', text: 'x' }]), /disc plin/);
  assert.equal(s2.count(), 0);
});
