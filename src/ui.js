// Interfața analizorului. La build, toate modulele sunt lipite într-un singur fișier HTML.
import { parseHands } from './hands.js';
import { classify } from './classify.js';
import { computeStats, describeHand } from './stats.js';
import { readZipTexts } from './zip.js';
import { computeBreakdowns, SMALL_SAMPLE } from './breakdowns.js';
import { allinEv, summarizeAllin } from './allin.js';
import { splitRawHands, createHandStore, idsOnlyBackend } from './store.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = (x, d = 1) => x.toLocaleString('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d });
const bbTxt = (x, d = 1) => `<span class="${x < 0 ? 'neg' : x > 0 ? 'pos' : ''}">${x > 0 ? '+' : x < 0 ? '−' : ''}${nf(Math.abs(x), d)}</span>`;
const SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' };
const cardsHtml = (cards) => `<span class="cards">${cards.map((c) => `<span class="c${c[1]}">${c[0]}${SUIT[c[1]]}</span>`).join(' ')}</span>`;

const smallTag = (n) => (n > 0 && n < SMALL_SAMPLE ? ' <span class="tag off">eșantion mic</span>' : '');
const nCell = (n) => `${n.toLocaleString('ro-RO')}${smallTag(n)}`;
const usdTxt = (x) => `<span class="${x < 0 ? 'neg' : x > 0 ? 'pos' : ''}">${x > 0 ? '+' : x < 0 ? '−' : ''}${nf(Math.abs(x), 2)} $</span>`;
const ciTxt = (c) => (c.lo == null ? '–' : `<span class="ci">IC 95%: ${c.lo < 0 ? '−' : '+'}${nf(Math.abs(c.lo))} … ${c.hi < 0 ? '−' : '+'}${nf(Math.abs(c.hi))}</span>`);

const state = { hands: [], seen: new Set(), rejected: [], unknown: {}, store: null, last: null };

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
  return `<span class="pct">${nf(p.p)}%</span> ${ci}${tag}${smallTag(p.n)}`;
}
const table = (head, rows) => `<div class="scroll"><table><thead><tr>${head.map((h) => `<th${h.startsWith('#') ? ' class="num"' : ''}>${esc(h.replace(/^#/, ''))}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${head[i].startsWith('#') ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const propRows = (list) => table(['Situație', 'Frecvență'], list.map((r) => [esc(r.label), pctCell(r, r.ref)]));
const netRow = (r) => [nCell(r.n), bbTxt(r.net), r.n ? bbTxt(r.bb100) : '–'];

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
  const L = state.last;
  let html = `<h2>Mâini încărcate</h2><div class="kpis">
    <div class="kpi"><b id="kHands">${state.hands.length.toLocaleString('ro-RO')}</b><span>mâini în raport</span></div>
    <div class="kpi"><b id="kNew">${L ? L.added.toLocaleString('ro-RO') : '–'}</b><span>mâini noi la ultima încărcare${L ? ` (${L.files} ${L.files === 1 ? 'fișier' : 'fișiere'})` : ''}</span></div>
    <div class="kpi"><b id="kDup">${L ? L.duplicates.toLocaleString('ro-RO') : '–'}</b><span>duplicate ignorate (același ID)</span></div>
    <div class="kpi"><b>${state.rejected.length}</b><span>mâini respinse</span></div>
    <div class="kpi"><b>${unknown.reduce((s, u) => s + u[1], 0)}</b><span>linii necunoscute</span></div></div>
    <p class="sub" style="margin-top:10px">Nimic nu se păstrează: mâinile există doar cât timp pagina este deschisă. La reîncărcare dispare tot, iar fișierele rămân doar pe calculatorul tău. Salvează raportul cu „Salvează PDF”.</p>`;
  const headShapes = {};
  for (const r of state.rejected) if (r.sample && r.reason.startsWith('antet')) { const k = r.sample.replace(/#\S+?:/, '#ID:').replace(/[0-9]/g, 'N').slice(0, 110); headShapes[k] = (headShapes[k] ?? 0) + 1; }
  const headList = Object.entries(headShapes).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (state.rejected.length) html += `<div class="note"><b>Mâini respinse:</b><ul class="plain">${Object.entries(reasons).map(([k, v]) => `<li>${esc(k)}: ${v}</li>`).join('')}</ul>
    ${headList.length ? `<p class="sub" style="margin:8px 0 0">Forme de antet necunoscute:</p><ul class="plain">${headList.map(([k, v]) => `<li>${v} × <code>${esc(k)}</code></li>`).join('')}</ul>` : ''}
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
  const B = computeBreakdowns(hands);
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
    </div>
    <h3>Pe miză</h3>${table(['Miză', 'Big blind', '#Mâini', '#Net (bb)', '#Net ($)', '#bb/100', 'Interval bb/100'],
      [...B.byStake.map((r) => [esc(r.stakes), `${nf(r.bb, 2)} $`, nCell(r.n), bbTxt(r.net), usdTxt(r.usd), bbTxt(r.bb100), ciTxt(r.ci)]),
        ['<b>total</b>', '', nCell(B.total.n), bbTxt(B.total.net), usdTxt(B.total.usd), B.total.n ? bbTxt(B.total.bb100) : '–', ciTxt(B.total.ci)]])}
    <p class="note plain">bb se calculează pe fiecare mână, cu big blind-ul acelei mâini, apoi se adună; de aceea totalul în bb nu se transformă în $ cu un singur curs.
    Intervalul de încredere al bb/100 vine din deviația standard reală a mâinilor${B.total.ci.sd100 != null ? ` (${nf(B.total.ci.sd100, 0)} bb la 100 de mâini)` : ''}.
    Rezultatele sunt după rake. Grupele sub ${SMALL_SAMPLE} de mâini sunt marcate „eșantion mic”.</p>`);

  const AI = summarizeAllin(hands);
  const luckTxt = (x) => bbTxt(x, 0);
  let aiBody;
  if (!AI.n) aiBody = AI.pending ? '<p class="few">Se calculează…</p>' : '<p class="few">niciun all-in cu cărți vizibile în această selecție</p>';
  else {
    const margin = 1.96 * AI.se;
    const verdict = AI.n < 30 ? '<p class="note">Prea puține all-in-uri pentru o concluzie.</p>'
      : AI.luckBb < -margin ? `<p class="note"><b>Ghinion peste variația normală:</b> ai încasat cu ${nf(-AI.luckBb, 0)} bb mai puțin decât îți reveneau după echitate, iar marja obișnuită este de ±${nf(margin, 0)} bb.</p>`
      : AI.luckBb > margin ? `<p class="note"><b>Noroc peste variația normală:</b> ai încasat cu ${nf(AI.luckBb, 0)} bb mai mult decât îți reveneau după echitate, iar marja obișnuită este de ±${nf(margin, 0)} bb.</p>`
      : `<p class="note plain">Diferența dintre rezultatul real și cel așteptat (${nf(Math.abs(AI.luckBb), 0)} bb) se încadrează în variația normală (±${nf(margin, 0)} bb), deci nu se poate spune că a fost ghinion sau noroc neobișnuit.</p>`;
    const skippedTxt = Object.entries(AI.skipped).map(([k, v]) => `${v} × ${esc(k)}`).join(', ');
    aiBody = `<div class="kpis">
      <div class="kpi"><b>${AI.n.toLocaleString('ro-RO')}</b><span>all-in-uri cu cărți vizibile, analizate</span></div>
      <div class="kpi"><b>${bbTxt(AI.net)} bb</b><span>rezultat real (${bbTxt(AI.bb100)} bb/100)</span></div>
      <div class="kpi"><b>${bbTxt(AI.evNet)} bb</b><span>rezultat cu EV all-in (${bbTxt(AI.evBb100)} bb/100)</span></div>
      <div class="kpi"><b>${luckTxt(AI.luckBb)} bb</b><span>noroc (real − așteptat), marjă normală ±${nf(margin, 0)} bb</span></div></div>${verdict}
      <h3>După cât de favorit ai fost</h3>${table(['Situația la all-in', '#All-in-uri', '#Echitate medie', '#Câștigate efectiv', '#Noroc (bb)'],
        AI.bands.map((b) => [esc(b.label), nCell(b.n), `${nf(b.expectedWin, 0)}%`, `${nf(b.actualWin, 0)}%`, luckTxt(b.luck)]))}
      <h3>După stradă</h3>${table(['Stradă', '#All-in-uri', '#Noroc (bb)'], AI.streets.map((x) => [x.street, nCell(x.n), luckTxt(x.luck)]))}
      <p class="sub" style="margin-top:10px">${AI.pending ? `Se mai calculează ${AI.pending.toLocaleString('ro-RO')} mâini… ` : ''}Echitatea se calculează din cărțile arătate la all-in (la preflop prin simulare, cu mică eroare); egalitățile împart potul și rake-ul este scăzut. Nu spune dacă all-in-ul a fost o decizie bună, ci doar cât de mult a contat norocul.${skippedTxt ? ` Sărite: ${skippedTxt}.` : ''}</p>`;
  }
  sec('EV all-in: ghinion sau joc prost?', 'Rezultatul real față de cel așteptat din echitate, doar pentru mâinile cu all-in și cărți vizibile.', aiBody);

  const P = B.preflop;
  const preRow = (label, r) => [label, nCell(r.n), bbTxt(r.net), r.n ? bbTxt(r.bb100) : '–', r.blinds ? `−${nf(r.blinds)}` : '0', bbTxt(r.netNoBlinds)];
  sec('Mâini terminate preflop', 'Mâinile în care Hero nu a văzut flopul. „Net fără blinduri” = netul plus blindurile postate de Hero.',
    table(['Poziție', '#Mâini', '#Net (bb)', '#bb/100', '#Blinduri postate (bb)', '#Net fără blinduri (bb)'],
      [...P.byPos.map((r) => preRow(esc(r.pos), r)), preRow('<b>SB + BB</b>', P.blinds), preRow('<b>celelalte poziții</b>', P.others), preRow('<b>total</b>', P.total)]) +
    `<p class="sub" style="margin-top:8px">Blinduri postate în toate mâinile din filtru, inclusiv cele cu flop: ${nf(P.blindsAllHands)} bb.</p>`);

  sec('1. Unde se duc banii', 'Tip de pot × rolul lui Hero × poziție × număr de jucători pe flop, de la cel mai mare minus. IP = Hero vorbește ultimul pe flop.',
    table(['Tip de pot', 'Rol', 'Poziție', 'Jucători', '#Mâini', '#Net (bb)', '#bb/100'],
      s.money.map((r) => [esc(r.potType), esc(r.role), r.position, r.players, ...(r.n < s.minN ? [nCell(r.n), bbTxt(r.net), '<span class="few">prea puține mâini</span>'] : netRow(r))])));

  const R = B.srpCallerOop;
  const refRow = (label, r) => [label, nCell(r.n), bbTxt(r.net), r.n ? bbTxt(r.net / r.n, 2) : '–', r.ref == null ? '–' : bbTxt(r.ref), r.diff == null ? '–' : bbTxt(r.diff), r.diffPerHand == null ? '–' : bbTxt(r.diffPerHand, 2)];
  sec('1b. Single-raised, caller, OOP, heads-up', 'Pe poziția lui Hero și a celui care a deschis. Reperul „fold la tot” = Hero pierde doar blindul postat (1 bb din BB; din SB 0,5 bb la NL2 și 0,4 bb la NL5). Diferență pozitivă = apărarea a adus mai mult decât foldul.',
    R.total.n ? table(['Hero / deschide', '#Mâini', '#Net (bb)', '#bb/mână', '#Fold la tot (bb)', '#Diferență (bb)', '#Diferență/mână'],
      [...R.byHero.flatMap((g) => [refRow(`<b>Hero ${esc(g.heroPos)}</b>`, g), ...g.byOpener.map((o) => refRow(`&nbsp;&nbsp;contra ${esc(o.opener)}`, o))]), refRow('<b>total</b>', { ...R.total, ref: null, diff: null, diffPerHand: null })]) : '<p class="few">fără cazuri</p>');

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
    table(['', '#Mâini', '#Net (bb)', '#bb/100'], [['mâini cu showdown', ...netRow(W.netSd)], ['mâini fără showdown', ...netRow(W.netNoSd)]]) +
    (() => {
      const L = B.lostShowdown, share = (x, t) => (t ? `${nf(x)} <span class="ci">(${nf((100 * x) / t, 0)}%)</span>` : '0');
      if (!L.n) return '';
      const row = (label, x) => [label, nf(x.total), share(x.call, x.total), share(x.raise, x.total), nf(x.blind)];
      return `<h3>Mâini pierdute la showdown</h3><p class="sub">${nCell(L.n)} mâini în care Hero a ajuns la showdown și nu a încasat nimic: ${bbTxt(L.net)} bb. Cât a investit pe fiecare stradă și cum.</p>` +
        table(['Stradă', '#Investit (bb)', '#Prin call', '#Prin bet/raise', '#Blinduri'], [...['preflop', 'flop', 'turn', 'river'].map((st) => row(st, L.streets[st])), row('<b>total</b>', L.totals)]) +
        `<h3>După ultima acțiune a lui Hero</h3>` + table(['Ultima acțiune', '#Mâini', '#Net (bb)', '#bb/mână'], L.byLast.map((g) => [esc(g.label), nCell(g.n), bbTxt(g.net), g.n ? bbTxt(g.net / g.n) : '–']));
    })());

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
    s.lines.length ? table(['Linie', '#Mâini', '#Net (bb)', '#bb/mână'], s.lines.map((l) => [esc(l.line), nCell(l.n), bbTxt(l.net), bbTxt(l.net / l.n)])) : '<p class="few">nicio linie cu cel puțin 10 mâini pe minus</p>');

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

// Trece prin parser înregistrările brute (noi sau citite din browser) și le adaugă în raport.
function ingest(records) {
  if (!records.length) return;
  const r = parseHands(records.map((x) => x.text).join('\n\n'), state.seen);
  for (const h of r.hands) h.cls = classify(h);
  state.hands.push(...r.hands); state.rejected.push(...r.rejected);
  for (const [k, v] of Object.entries(r.unknownLines)) state.unknown[k] = (state.unknown[k] ?? 0) + v;
}

function refresh() {
  const stakes = [...new Set(state.hands.map((h) => h.stakes))].sort();
  const cur = $('fStake').value;
  $('fStake').innerHTML = '<option value="">toate mizele</option>' + stakes.map((s) => `<option value="${esc(s)}">${esc(s)} $</option>`).join('');
  $('fStake').value = stakes.includes(cur) ? cur : '';
  renderStatus();
  render();
}

// Calculează EV all-in pentru mâinile nou intrate, fără să blocheze pagina; la final redesenează raportul.
async function computeEv() {
  if (state.evRunning) return;
  state.evRunning = true;
  try {
    for (;;) {
      const todo = state.hands.filter((h) => h.allin === undefined);
      if (!todo.length) break;
      let last = performance.now();
      for (let i = 0; i < todo.length; i++) {
        todo[i].allin = allinEv(todo[i]);
        if (performance.now() - last > 60) {
          $('busy').textContent = `Se calculează EV all-in… ${i.toLocaleString('ro-RO')}/${todo.length.toLocaleString('ro-RO')}`;
          await new Promise((r) => setTimeout(r)); last = performance.now();
        }
      }
    }
  } finally { state.evRunning = false; $('busy').textContent = ''; render(); }
}

async function addFiles(files) {
  if (!files.length) return;
  await state.ready;
  $('busy').textContent = 'Se citesc fișierele…';
  const last = { files: 0, added: 0, duplicates: 0 };
  for (const f of files) {
    try {
      const texts = /\.zip$/i.test(f.name) ? await readZipTexts(await f.arrayBuffer()) : [{ name: f.name, text: await f.text() }];
      for (const t of texts) {
        const { records, stray } = splitRawHands(t.text);
        for (const sample of stray) state.rejected.push({ id: '?', reason: 'text în afara unei mâini', sample });
        const res = await state.store.add(records);
        ingest(res.added);
        last.files++; last.added += res.added.length; last.duplicates += res.duplicates;
      }
    } catch (e) {
      state.rejected.push({ id: f.name, reason: `fișier necitit: ${e.message}` });
    }
  }
  state.last = last;
  $('busy').textContent = '';
  refresh();
  await computeEv();
}

// Tipărește raportul: în dialog se alege „Salvează ca PDF”. Titlul paginii devine numele implicit al fișierului.
function savePdf() {
  const old = document.title, d = new Date(), pad = (x) => String(x).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  document.title = `Analiza-poker-${state.hands.length}-maini-${stamp}`;
  const restore = () => { document.title = old; window.removeEventListener('afterprint', restore); };
  window.addEventListener('afterprint', restore);
  window.print();
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
  $('savePdf').addEventListener('click', savePdf);
  state.ready = (async () => {
    state.store = await createHandStore(idsOnlyBackend());
    document.body.dataset.ready = '1';
  })();
}
initUi();
