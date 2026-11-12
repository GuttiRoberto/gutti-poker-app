// Lipește modulele din src/ într-un singur fișier autonom: dist/analizor.html
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compactRanges } from '../src/chart3bet.js';
const src = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const strip = (code) => code.replace(/^import .*$/gm, '').replace(/^export /gm, '');
const ranges = compactRanges(JSON.parse(readFileSync(new URL('../data/ranges.json', import.meta.url), 'utf8')));
const js = [`const REFERENCE = ${JSON.stringify(JSON.parse(src('reference.json')))};`, `const RANGES3 = ${JSON.stringify(ranges)};`,
  ...['hands.js', 'classify.js', 'stats.js', 'breakdowns.js', 'equity.js', 'allin.js', 'handclass.js', 'threebet.js', 'chart3bet.js', 'review.js', 'graph.js', 'zip.js', 'store.js', 'ui.js'].map((f) => `// ---- ${f}\n${strip(src(f))}`)].join('\n');
if (/<\/script/i.test(js)) throw new Error('codul conține </script');
// modulele sunt lipite într-un singur script: verifică sintaxa (prinde nume declarate de două ori)
const tmp = join(tmpdir(), `analizor-check-${process.pid}.mjs`);
writeFileSync(tmp, js);
try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); } catch (e) { throw new Error(`scriptul lipit nu este valid:\n${e.stderr}`); } finally { rmSync(tmp, { force: true }); }
const html = `<!doctype html>
<html lang="ro">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Analizor de leak-uri postflop</title>
<style>
${src('page.css')}</style>
</head>
<body>
<main>
  <h1>Analizor de leak-uri postflop</h1>
  <p class="sub">Mâini de cash de pe GG Poker (Hold'em No Limit). Totul se prelucrează local, în acest browser; fișierele nu sunt trimise nicăieri și nimic nu se păstrează: la reîncărcarea paginii dispare tot.</p>
  <div id="drop" role="button" tabindex="0" aria-label="Alege fișiere cu mâini">
    <strong>Trage aici fișierele .txt sau .zip</strong>
    <span class="sub">mai multe deodată · hand history de pe GG Poker</span>
    <div style="margin-top:10px"><button id="pick" type="button" class="primary" tabindex="-1">Alege fișiere</button></div>
    <div id="busy" class="sub" aria-live="polite"></div>
  </div>
  <input id="file" type="file" accept=".txt,.zip" multiple class="hidden">
  <section id="status" class="hidden"></section>
  <div id="report" class="hidden">
    <div class="actions noprint"><button id="savePdf" type="button" class="primary">Salvează PDF</button><span class="sub">se deschide dialogul de tipărire: alege „Salvează ca PDF”</span></div>
    <section class="noprint">
      <h2>Filtre</h2>
      <div class="filters">
        <label>Miză<select id="fStake"><option value="">toate mizele</option></select></label>
        <label>De la<input id="fFrom" type="date"></label>
        <label>Până la<input id="fTo" type="date"></label>
        <label>Jucători pe flop<select id="fPlayers"><option value="">toate mâinile</option><option value="hu">doar heads-up</option><option value="mw">doar multiway</option></select></label>
        <button id="reset" type="button">Resetează</button>
      </div>
    </section>
    <div id="sections"></div>
    <footer>
      <p><b>Repere orientative</b> (nu sunt rezultate de solver; se editează în <code>src/reference.json</code>):</p>
      <ul class="plain" id="ref"></ul>
      <p>Fiecare procent are numărul de cazuri și intervalul de încredere de 95% (Wilson). Sub 30 de cazuri nu se compară cu niciun reper; sub 200 de mâini grupa este marcată „eșantion mic”.</p>
    </footer>
  </div>
</main>
<script type="module">
${js}
</script>
</body>
</html>
`;
mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist/analizor.html', import.meta.url), html);
console.log(`dist/analizor.html scris (${(html.length / 1024).toFixed(0)} KB)`);
