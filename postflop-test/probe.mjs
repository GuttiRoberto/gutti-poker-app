// Măsoară doar memoria cerută de arbore pentru mai multe variante de mărimi. Utilizare: node probe.mjs <port>
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const S = (flop, turn, river) => ({ flop, turn, river });
const variants = {
  'A cerut: 33/75/allin pe toate străzile, raise 3x': S(['33%,75%,a', '3x'], ['33%,75%,a', '3x'], ['33%,75%,a', '3x']),
  'B fără bet all-in explicit: 33/75, raise 3x': S(['33%,75%', '3x'], ['33%,75%', '3x'], ['33%,75%', '3x']),
  'C 33/75/allin, raise 3x doar pe flop; turn/river raise all-in': S(['33%,75%,a', '3x'], ['33%,75%,a', 'a'], ['33%,75%,a', 'a']),
  'D flop 33/75, turn 75, river 75/allin, raise 3x': S(['33%,75%', '3x'], ['75%', '3x'], ['75%,a', '3x']),
  'E flop 33/75, turn 75, river 75, raise 3x': S(['33%,75%', '3x'], ['75%', '3x'], ['75%', '3x']),
  'F flop 33, turn 75, river 75, raise 3x': S(['33%', '3x'], ['75%', '3x'], ['75%', '3x']),
  'G flop 33/75, turn 75, river 75, raise all-in': S(['33%,75%', 'a'], ['75%', 'a'], ['75%', 'a']),
  'H flop 33, turn 75, river 75, raise all-in': S(['33%', 'a'], ['75%', 'a'], ['75%', 'a']),
  'I flop 33/75, turn 33/75, river 33/75, raise all-in': S(['33%,75%', 'a'], ['33%,75%', 'a'], ['33%,75%', 'a']),
  'J flop 33/75, turn 75, river 75, fără raise': S(['33%,75%', ''], ['75%', ''], ['75%', '']),
};
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://localhost:${process.argv[2] ?? 8090}/`);
const gb = (x) => (x / 2 ** 30).toFixed(2);
for (const [name, sizes] of Object.entries(variants)) {
  const r = await page.evaluate((o) => window.run(o), { variant: 'st', sizes, memOnly: true });
  console.log(r.error || r.message ? `${name} | EROARE ${r.error ?? r.message}` : `${name} | ${gb(r.mem)} GB | comprimat ${gb(r.memC)} GB`);
}
await browser.close();
