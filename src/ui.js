// Interfața analizorului. La build, toate modulele sunt lipite într-un singur fișier HTML.
import { parseHands } from './hands.js';
import { classify } from './classify.js';
import { computeStats, describeHand } from './stats.js';
import { readZipTexts } from './zip.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = (x, d = 1) => x.toLocaleString('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d });
const bbTxt = (x, d = 1) => `<span class="${x < 0 ? 'neg' : x > 0 ? 'pos' : ''}">${x > 0 ? '+' : x < 0 ? '−' : ''}${nf(Math.abs(x), d)}</span>`;
const SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' };
const cardsHtml = (cards) => `<span class="cards">${cards.map((c) => `<span class="c${c[1]}">${c[0]}${SUIT[c[1]]}</span>`).join(' ')}</span>`;

const state = { hands: [], seen: new Set(), rejected: [], duplicates: 0, unknown: {}, files: 0, total: 0 };

// Procent cu n și interval de încredere; sub pragul minim nu se colorează și nu se compară cu reperul.
function pctCell(p, refKey) {
  if (!p.n) return '<span class="few">fără cazuri</span>';
  const ci = `<span class="ci">${p.k}/${p.n} · IC 95%: ${nf(p.lo, 0)}–${nf(p.hi, 0)}%</span>`;
  if (p.few) return `<span class="few">${nf(p.p)}% · prea puține mâini</span> ${ci}`;
  let tag = '';
  const r = refKey && REFERENCE[refKey];
  if (r) {
    const where = p.p < r.min ? 'sub reper' : p.p > r.max ? 'peste reper' : 'în reper';
    tag = ` <span class="tag ${where === 'în reper' ? 'ok' : 'off'}">${where} · reper orientativ ${r.min}–${r.max}%</span>`;
  }
  return `<span class="pct">${nf(p.p)}%</span> ${ci}${tag}`;
}
const table = (head, rows) => `<div class="scroll"><table><thead><tr>${head.map((h) => `<th${h.startsWith('#') ? ' class="num"' : ''}>${esc(h.replace(/^#/, ''))}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${head[i].startsWith('#') ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const propRows = (list) => table(['Situație', 'Frecvență'], list.map((r) => [esc(r.label), pctCell(r, r.ref)]));
const netRow = (r) => [String(r.n), bbTxt(r.net), r.n ? bbTxt(r.bb100) : '–'];

function filtered() {
  const stake = $('fStake').value, from = $('fFrom').value, to = $('fTo').value, pl = $('fPlayers').value;
  return state.hands.filter((h) => {
    if (stake && h.stakes !== stake) return false;
    const day = h.date.slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (pl && !(h.cls.sawFlop && h.cls.headsUp === (pl === 'hu'))) return false;
    return true;
  });
}

function renderStatus() {
  const unknown = Object.entries(state.unknown).sort((a, b) => b[1] - a[1]);
  const reasons = {};
  for (const r of state.rejected) { const k = r.reason.replace(/\(.*\)/, '').trim(); reasons[k] = (reasons[k] ?? 0) + 1; }
  let html = `<h2>Ce s-a citit</h2><div class="kpis">
    <div class="kpi"><b>${state.hands.length.toLocaleString('ro-RO')}</b><span>mâini citite din ${state.files} fișiere</span></div>
    <div class="kpi"><b>${state.rejected.length}</b><span>mâini respinse</span></div>
    <div class="kpi"><b>${state.duplicates}</b><span>dubluri eliminate</span></div>
    <div class="kpi"><b>${unknown.reduce((s, u) => s + u[1], 0)}</b><span>linii necunoscute</span></div></div>`;
  if (state.rejected.length) html += `<div class="note"><b>Mâini respinse:</b><ul class="plain">${Object.entries(reasons).map(([k, v]) => `<li>${esc(k)}: ${v}</li>`).join('')}</ul>
    <details><summary>Lista (${state.rejected.length})</summary><ul class="plain">${state.rejected.slice(0, 200).map((r) => `<li>${esc(r.id)} — ${esc(r.reason)}</li>`).join('')}</ul></details></div>`;
  if (unknown.length) html += `<div class="note"><b>Linii care nu se potrivesc cu nimic cunoscut</b> (mâinile respective au fost păstrate dacă potul se verifică):<ul class="plain">${unknown.slice(0, 30).map(([k, v]) => `<li>${v} × <code>${esc(k)}</code></li>`).join('')}</ul></div>`;
  const tb = state.hands.filter((h) => h.timeBank).reduce((s, h) => s + h.timeBank, 0), tbN = state.hands.filter((h) => h.timeBank).length;
  if (tbN) html += `<p class="sub" style="margin-top:10px">„Time bank card”: ${tbN} ${tbN === 1 ? 'mână' : 'mâini'}, ${(tb / 100).toFixed(2)} $ în afara potului, neinclus în rezultate.</p>`;
  $('status').innerHTML = html;
  $('status').classList.remove('hidden');
}

function render() {
  const hands = filtered();
  $('report').classList.toggle('hidden', !state.hands.length);
  if (!state.hands.length) return;
  const s = computeStats(hands);
  const S = s.summary;
  const out = [];
  const sec = (title, sub, body) => out.push(`<section><h2>${title}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}${body}</section>`);
  const day = (d) => (d ? d.slice(0, 10).split('-').reverse().join('.') : '–');

  sec('Rezultat', `${hands.length.toLocaleString('ro-RO')} mâini în filtru · ${day(S.from)} – ${day(S.to)} · mize ${S.stakes.map(esc).join(', ') || '–'}`,
    `<div class="kpis">
      <div class="kpi"><b>${bbTxt(S.all.net)} bb</b><span>rezultat net total (${S.all.n ? bbTxt(S.all.bb100) : '–'} bb/100)</span></div>
      <div class="kpi"><b>${bbTxt(S.preflopOnly.net)} bb</b><span>${S.preflopOnly.n.toLocaleString('ro-RO')} mâini terminate preflop</span></div>
      <div class="kpi"><b>${bbTxt(S.flop.net)} bb</b><span>${S.flop.n.toLocaleString('ro-RO')} mâini în care Hero a văzut flopul</span></div>
      <div class="kpi"><b>${bbTxt(s.showdown.netSd.net)} bb</b><span>la showdown (${s.showdown.netSd.n} mâini)</span></div>
      <div class="kpi"><b>${bbTxt(s.showdown.netNoSd.net)} bb</b><span>postflop fără showdown (${s.showdown.netNoSd.n} mâini)</span></div>
    </div><p class="note plain">Rezultatele sunt după rake. Toate statisticile de mai jos privesc doar mâinile în care Hero a văzut flopul.</p>`);

  sec('1. Unde se duc banii', 'Tip de pot × rolul lui Hero × poziție × număr de jucători pe flop, de la cel mai mare minus. IP = Hero vorbește ultimul pe flop.',
    table(['Tip de pot', 'Rol', 'Poziție', 'Jucători', '#Mâini', '#Net (bb)', '#bb/100'],
      s.money.map((r) => [esc(r.potType), esc(r.role), r.position, r.players, ...(r.n < s.minN ? [String(r.n), bbTxt(r.net), '<span class="few">prea puține mâini</span>'] : netRow(r))])));

  const A = s.aggressor;
  sec('2. Ca agresor preflop', 'C-bet = Hero pariază primul pe flop, când nimeni nu a pariat înaintea lui.',
    `<h3>C-bet pe flop</h3>${propRows(A.cbet)}<h3>C-bet pe textură</h3>${propRows(A.texture)}
     <h3>Continuare</h3>${propRows([{ label: 'al doilea bet, pe turn, după c-bet', ...A.turn }, { label: 'al treilea bet, pe river', ...A.river }])}
     <h3>Mărimea beturilor (din pot)</h3>${table(['Stradă', ...s.sizeBuckets.map((b) => '#' + b), '#Beturi'],
      ['flop', 'turn', 'river'].map((st) => { const t = A.sizes[st].reduce((a, b) => a + b, 0); return [st, ...A.sizes[st].map((n) => (t ? `${nf((100 * n) / t, 0)}% <span class="ci">(${n})</span>` : '–')), t < s.minN ? `${t} <span class="few">· prea puține</span>` : String(t)]; }))}`);

  const D = s.defender;
  const frc = (label, d, ref = {}) => [esc(label), pctCell(d.fold, ref.fold), pctCell(d.call), pctCell(d.raise)];
  sec('3. Ca apărător', 'Mâinile în care Hero nu este agresorul preflop.',
    `<h3>Contra bet</h3>${table(['Situație', 'Fold', 'Call', 'Raise'], [frc('contra c-bet pe flop', D.vsCbet, D.vsCbet.ref), frc('contra bet pe turn', D.vsTurn), frc('contra bet pe river', D.vsRiver)])}
     <h3>Inițiativă</h3>${propRows([
      { label: 'check-raise pe flop (după check și bet al adversarului)', ...D.checkRaise },
      { label: 'donk bet pe flop (pariază înaintea agresorului)', ...D.donk },
      { label: 'bet pe flop după check-ul agresorului', ...D.stab },
      { label: 'bet pe turn după un flop fără niciun bet', ...D.probe }])}`);

  const W = s.showdown;
  sec('4. Showdown', '', propRows([
    { label: 'ajunge la showdown după ce vede flopul', ...W.wtsd, ref: 'wtsd' },
    { label: 'câștigă la showdown', ...W.wsd, ref: 'wsd' },
    { label: 'câștigă potul fără showdown (din mâinile cu flop)', ...W.wonNoSd }]) +
    table(['', '#Mâini', '#Net (bb)', '#bb/100'], [['mâini cu showdown', ...netRow(W.netSd)], ['mâini fără showdown', ...netRow(W.netNoSd)]]));

  const RC = s.riverCalls;
  let verdict = '';
  if (RC.won.n && !RC.won.few) {
    verdict = RC.won.hi < RC.need ? '<p class="note"><b>Leak direct:</b> câștigi mai rar decât cer pot odds, chiar și la marginea de sus a intervalului.</p>'
      : RC.won.p < RC.need ? '<p class="note">Câștigi mai rar decât cer pot odds, dar diferența este încă în marja de eroare.</p>'
      : '<p class="note plain">Câștigi cel puțin cât cer pot odds în medie.</p>';
  }
  sec('5. Call-uri pe river', 'Echitatea necesară = suma de call ÷ (pot + suma de call), media pe toate call-urile.',
    RC.won.n ? propRows([{ label: 'call-uri câștigate', ...RC.won }]) +
      `<div class="kpis"><div class="kpi"><b>${nf(RC.need)}%</b><span>echitate necesară, în medie</span></div>
       <div class="kpi"><b>${bbTxt(RC.callNet)} bb</b><span>rezultatul call-urilor (încasat minus plătit la call)</span></div></div>${verdict}` : '<p class="few">fără cazuri</p>');

  const RB = s.riverBets;
  sec('6. Beturi pe river', `${RB.n} beturi ale lui Hero pe river (primul bet al străzii).`, RB.n ? propRows([
    { label: 'adversarul dă fold', ...RB.fold }, { label: 'plătit și câștigă', ...RB.won },
    { label: 'plătit și pierde', ...RB.lost }, { label: 'primește raise', ...RB.raised }]) : '<p class="few">fără cazuri</p>');

  sec('7. Linii care pierd', 'Secvența acțiunilor lui Hero pe străzi; primele 10 după totalul pierdut, cu cel puțin 10 mâini. Rezultatul este al întregii mâini.',
    s.lines.length ? table(['Linie', '#Mâini', '#Net (bb)', '#bb/mână'], s.lines.map((l) => [esc(l.line), String(l.n), bbTxt(l.net), bbTxt(l.net / l.n)])) : '<p class="few">nicio linie cu cel puțin 10 mâini pe minus</p>');

  sec('8. Cele mai mari mâini pierdute', 'Atinge o mână pentru acțiunea completă. Cele marcate „heads-up pe flop” pot merge la solver.',
    s.worst.map((h, i) => {
      const c = h.cls;
      const tags = c.sawFlop ? `${esc(c.potType)} · ${c.heroRole} · ${c.position}` : 'fără flop';
      const ro = (t) => t.replace(/(\d)\.(\d)/g, '$1,$2'); // virgulă zecimală
      const lines = describeHand(h).map((l) => `<div class="street"><b>${l.street}${l.pot ? ` (${ro(l.pot)})` : ''}</b><span>${l.cards ? cardsHtml(l.cards.split(' ')) + ' — ' : ''}${esc(ro(l.text))}</span></div>`).join('');
      const shown = Object.entries(h.shown).filter(([n]) => n !== 'Hero').map(([n, cs]) => `${esc(h.players.find((p) => p.name === n)?.pos ?? n)} ${cardsHtml(cs)}`).join(', ');
      return `<details><summary><span class="amt neg">−${nf(-h.heroNetBb)} bb</span>${cardsHtml(h.heroCards)}<span>${h.heroPos}</span><span class="sub">${tags}</span>${c.sawFlop && c.headsUp ? '<span class="tag hu">heads-up pe flop</span>' : c.sawFlop ? '<span class="tag">multiway</span>' : ''}</summary>
        ${lines}${shown ? `<div class="street"><b>arătat</b><span>${shown}</span></div>` : ''}
        <div class="street"><b>mâna</b><span class="sub">#${i + 1} · ${esc(h.id)} · ${day(h.date)} · ${esc(h.stakes)}${h.runs > 1 ? ` · rulată de ${h.runs} ori` : ''}</span></div></details>`;
    }).join('') || '<p class="few">nicio mână pierdută</p>');

  $('sections').innerHTML = out.join('');
}

async function addFiles(files) {
  $('busy').textContent = 'Se citesc fișierele…';
  for (const f of files) {
    try {
      const texts = /\.zip$/i.test(f.name) ? await readZipTexts(await f.arrayBuffer()) : [{ name: f.name, text: await f.text() }];
      for (const t of texts) {
        const r = parseHands(t.text, state.seen);
        for (const h of r.hands) h.cls = classify(h);
        state.hands.push(...r.hands); state.rejected.push(...r.rejected); state.duplicates += r.duplicates; state.total += r.total; state.files++;
        for (const [k, v] of Object.entries(r.unknownLines)) state.unknown[k] = (state.unknown[k] ?? 0) + v;
      }
    } catch (e) {
      state.rejected.push({ id: f.name, reason: `fișier necitit: ${e.message}` });
    }
  }
  $('busy').textContent = '';
  const stakes = [...new Set(state.hands.map((h) => h.stakes))].sort();
  const cur = $('fStake').value;
  $('fStake').innerHTML = '<option value="">toate mizele</option>' + stakes.map((s) => `<option value="${esc(s)}">${esc(s)} $</option>`).join('');
  $('fStake').value = stakes.includes(cur) ? cur : '';
  renderStatus();
  render();
}

function initUi() {
  const drop = $('drop'), input = $('file');
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => { addFiles([...input.files]); input.value = ''; });
  for (const ev of ['dragenter', 'dragover']) document.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); });
  for (const ev of ['dragleave', 'drop']) document.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); });
  document.addEventListener('drop', (e) => addFiles([...e.dataTransfer.files].filter((f) => /\.(txt|zip)$/i.test(f.name))));
  for (const id of ['fStake', 'fFrom', 'fTo', 'fPlayers']) $(id).addEventListener('change', render);
  $('reset').addEventListener('click', () => { for (const id of ['fStake', 'fFrom', 'fTo', 'fPlayers']) $(id).value = ''; render(); });
  $('ref').innerHTML = Object.values(REFERENCE).filter((r) => r.eticheta).map((r) => `<li>${esc(r.eticheta)}: ${r.min}–${r.max}%</li>`).join('');
  window.__addFiles = addFiles; // pentru verificări automate
}
initUi();
