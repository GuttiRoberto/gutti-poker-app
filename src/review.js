// „Mâini de revăzut”: situațiile în care Hero a deschis și a primit 3-bet, comparate cu graficul din Range.pdf.
import { handLabel } from './handclass.js';
import { chartDecision } from './chart3bet.js';

export const REVIEW_CLASSES = ['în grafic', 'rar în grafic', 'în afara graficului', 'deschis în afara graficului', 'necomparabil'];
export const RESPONSE_NAMES = { fold: 'fold', call: 'call', raise: '4-bet' };

// Ce a făcut Hero la primul 3-bet după ce a deschis; null dacă mâna nu are o astfel de situație.
function facing(h) {
  const acts = h.streets.preflop, i0 = acts.findIndex((a) => a.type === 'raise');
  if (i0 < 0 || acts[i0].player !== 'Hero') return null;
  const j = acts.findIndex((a, i) => i > i0 && a.type === 'raise' && a.player !== 'Hero');
  if (j < 0) return null;
  const resp = acts.find((a, i) => i > j && a.player === 'Hero' && a.type !== 'post');
  if (!resp) return null;
  // limp înaintea deschiderii sau call între deschidere și 3-bet: nu mai este „deschidere simplă contra 3-bet” din grafic
  const clean = !acts.slice(0, i0).some((a) => a.type === 'call') && !acts.slice(i0 + 1, j).some((a) => a.type === 'call');
  // 3-bet all-in sau call all-in: nu se mai poate da 4-bet, deci call-ul este singura formă de continuare
  const allin = !!acts[j].allin || (resp.type === 'call' && !!resp.allin);
  return { villainPos: acts[j].pos, response: resp.type, clean, allin };
}

export function classifyResponse(chart, response, allin = false) {
  // la un 3-bet all-in, „continuă” = call + 4-bet din grafic
  const f = allin && response === 'call' ? chart.call + chart.raise : chart[response];
  return f >= 20 ? 'în grafic' : f >= 5 ? 'rar în grafic' : 'în afara graficului';
}

export function computeReview(hands, data) {
  const items = [];
  for (const h of hands) {
    const f = facing(h);
    if (!f) continue;
    const label = handLabel(h.heroCards);
    const chart = f.clean ? chartDecision(data, h.heroPos, f.villainPos, label) : null;
    const cls = !chart ? 'necomparabil' : chart.reach === 0 ? 'deschis în afara graficului' : classifyResponse(chart, f.response, f.allin);
    items.push({ h, label, heroPos: h.heroPos, villainPos: f.villainPos, response: f.response, allin: f.allin, chart, cls, net: h.heroNetBb });
  }
  const group = (list) => ({ n: list.length, net: list.reduce((s, x) => s + x.net, 0) });
  const byClass = REVIEW_CLASSES.map((cls) => ({ cls, ...group(items.filter((x) => x.cls === cls)) })).filter((r) => r.n);
  const comparable = items.filter((x) => x.cls !== 'necomparabil');
  const off = (x) => x.cls === 'rar în grafic' || x.cls === 'în afara graficului';
  const byResponse = ['fold', 'call', 'raise'].map((response) => {
    const l = comparable.filter((x) => x.response === response), o = l.filter(off);
    return { response, n: l.length, off: o.length, offNet: o.reduce((s, x) => s + x.net, 0), offNetCall: group(o) };
  }).filter((r) => r.n);
  return { items, byClass, byResponse, total: group(items), comparable: comparable.length };
}
