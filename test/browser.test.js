// Test al paginii reale în Chromium: încărcare (buton, drag & drop, zip), duplicate, nicio păstrare între vizite, buton PDF.
// Rulează doar dacă Playwright este instalat; altfel este sărit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

let chromium = null;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { /* fără Playwright */ }

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = readFileSync(new URL('./fixtures/hands.txt', import.meta.url));
const hands = fixture.toString().split(/\n(?=Poker Hand #)/);
const txt = (name, parts) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(parts.join('\n')) });

// arhivă zip „stored” cu un singur fișier
function zipOf(name, data) {
  const n = Buffer.from(name), local = Buffer.alloc(30 + n.length), cd = Buffer.alloc(46 + n.length), end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26); n.copy(local, 30);
  cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(n.length, 28); n.copy(cd, 46);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(local.length + data.length, 16);
  return Buffer.concat([local, data, cd, end]);
}

test('pagina: încărcare, duplicate, fără păstrare între vizite', { skip: chromium ? false : 'Playwright nu este instalat' }, async () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root });
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext()).newPage();
    const errors = [], requests = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => requests.push(r.url()));
    const url = `file://${root}dist/analizor.html`;
    const open = async () => { await page.goto(url); await page.waitForSelector('body[data-ready="1"]'); };
    const kpi = async (id) => (await page.innerText(`#${id}`)).trim();
    const loaded = async (n) => page.waitForFunction((x) => document.getElementById('kHands')?.textContent.trim() === String(x), n);

    await open();
    assert.equal(await page.isVisible('#report'), false); // nimic păstrat la prima vizită

    // 1. buton: două fișiere .txt deodată (8 + 5 mâini); raportul apare singur
    await page.setInputFiles('#file', [txt('a.txt', hands.slice(0, 8)), txt('b.txt', hands.slice(8, 13))]);
    await loaded(13);
    assert.deepEqual([await kpi('kNew'), await kpi('kDup')], ['13', '0']);
    assert.ok((await page.locator('#sections section').count()) >= 10);
    assert.match(await page.innerText('#sections'), /Unde se duc banii[\s\S]*Mâini terminate preflop|Mâini terminate preflop[\s\S]*Unde se duc banii/);

    // 2. drag & drop: o arhivă zip cu toate cele 20 de mâini; 13 sunt duplicate
    await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'toate.zip', { type: 'application/zip' }));
      document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, zipOf('gg/toate.txt', fixture).toString('base64'));
    await loaded(20);
    assert.deepEqual([await kpi('kNew'), await kpi('kDup')], ['7', '13']);

    // 3. același fișier încă o dată: nimic nou
    await page.setInputFiles('#file', [txt('toate.txt', hands)]);
    await page.waitForFunction(() => document.getElementById('kDup')?.textContent.trim() === '20');
    assert.deepEqual([await kpi('kHands'), await kpi('kNew')], ['20', '0']);
    const netBefore = await page.innerText('#sections section .kpi b');

    // 4. nimic nu se păstrează: după reîncărcare pagina este goală, iar în browser nu există nicio bază de date
    assert.equal(await page.locator('#wipe').count(), 0);
    assert.ok(await page.isVisible('#savePdf'));
    await page.emulateMedia({ media: 'print' }); // la tipărire dispar zona de încărcare și filtrele, rămâne raportul
    assert.equal(await page.isVisible('#drop'), false);
    assert.equal(await page.isVisible('#savePdf'), false);
    assert.ok(await page.isVisible('#sections section'));
    await page.emulateMedia({ media: 'screen' });
    assert.equal(netBefore.length > 0, true);
    await open();
    assert.equal(await page.isVisible('#report'), false);
    assert.equal(await page.isVisible('#status'), false);
    assert.deepEqual(await page.evaluate(async () => (await indexedDB.databases?.())?.map((d) => d.name) ?? []), []);
    assert.equal(await page.evaluate(() => localStorage.length), 0);

    // totul local: singura cerere de rețea este pagina însăși
    assert.deepEqual([...new Set(requests)], [url]);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
