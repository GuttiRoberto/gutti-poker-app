// Rulează un test în Chromium și scrie rezultatul JSON.
// Utilizare: node run.mjs <port> <mt|st> <fire> <fișier ieșire> [maxIter|0] [sizes JSON]
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const [port, variant, threads, outFile, maxIter, sizes] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => m.type() === 'error' && console.error('[browser]', m.text()));
await page.goto(`http://localhost:${port}/`);

// Vârful memoriei rezidente însumate pe toate procesele browserului (MB)
let peakRss = 0;
const timer = setInterval(() => {
  try {
    const kb = execSync("ps -eo rss=,args= | grep -i '[c]hrom' | awk '{s+=$1} END {print s}'").toString().trim();
    peakRss = Math.max(peakRss, Number(kb) / 1024);
  } catch {}
}, 500);

const t0 = Date.now();
const result = await page.evaluate((o) => window.run(o), {
  variant, threads: Number(threads), maxIter: Number(maxIter) || undefined, sizes: sizes ? JSON.parse(sizes) : undefined,
});
clearInterval(timer);
result.wallMs = Date.now() - t0;
result.peakRssMB = Math.round(peakRss);
writeFileSync(outFile, JSON.stringify(result, null, 1));
const { trace, strategy, ...brief } = result;
console.log(JSON.stringify(brief));
await browser.close();
