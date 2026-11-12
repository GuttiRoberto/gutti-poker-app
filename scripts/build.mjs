// Lipește modulele din src/ într-un singur fișier autonom: dist/analizor.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const src = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const strip = (code) => code.replace(/^import .*$/gm, '').replace(/^export /gm, '');
const js = [`const REFERENCE = ${JSON.stringify(JSON.parse(src('reference.json')))};`,
  ...['hands.js', 'classify.js', 'stats.js', 'zip.js', 'ui.js'].map((f) => `// ---- ${f}\n${strip(src(f))}`)].join('\n');
if (/<\/script/i.test(js)) throw new Error('codul conține </script');
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
  <p class="sub">Mâini de cash de pe GG Poker (Hold'em No Limit). Totul se prelucrează local, în acest browser; nimic nu se trimite nicăieri.</p>
  <div id="drop" role="button" tabindex="0" aria-label="Alege fișiere cu mâini">
    <strong>Trage aici fișierele .txt sau .zip</strong>
    <span class="sub">sau atinge pentru a le alege · poți adăuga mai multe pe rând</span>
    <div id="busy" class="sub" aria-live="polite"></div>
  </div>
  <input id="file" type="file" accept=".txt,.zip" multiple class="hidden">
  <section id="status" class="hidden"></section>
  <div id="report" class="hidden">
    <section>
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
      <p>Fiecare procent are numărul de cazuri și intervalul de încredere de 95% (Wilson). Sub 30 de cazuri nu se compară cu niciun reper.</p>
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
