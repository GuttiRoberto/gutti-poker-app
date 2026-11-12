// Poduri 3-bet / 4-bet: ce mâini plătește Hero, cu ce poziție, cât din rezultat este noroc la all-in, și cum răspunde la 3-bet după ce a deschis.
import { prop } from './stats.js';
import { handLabel, handCategory, HAND_CATEGORIES } from './handclass.js';

const TB_POSITIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const tbGroup = (list, key) => { const m = new Map(); for (const x of list) { const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };
const tbLuck = (h) => (h.allin && h.allin.luck != null ? h.allin.luck / h.bb : 0);
const tbRow = (list) => {
  const net = list.reduce((s, h) => s + h.heroNetBb, 0), luck = list.reduce((s, h) => s + tbLuck(h), 0);
  return { n: list.length, net, perHand: list.length ? net / list.length : null, luck, netNoLuck: net - luck };
};
const firstRaiser = (h) => h.streets.preflop.find((a) => a.type === 'raise')?.player;

export function computeThreeBet(hands) {
  // ca caller în pot 3-bet sau 4-bet+, cu flop văzut (aceleași mâini ca în „Unde se duc banii”)
  const callers = hands.filter((h) => h.cls.sawFlop && h.cls.heroRole === 'caller' && (h.cls.potType === '3-bet' || h.cls.potType === '4-bet+'));
  const byCategory = HAND_CATEGORIES.map((label, i) => ({ label, ...tbRow(callers.filter((h) => handCategory(handLabel(h.heroCards)) === i)) })).filter((r) => r.n);
  const opened = callers.filter((h) => h.cls.potType === '3-bet' && firstRaiser(h) === 'Hero');
  const openedByPos = TB_POSITIONS.map((pos) => ({ pos, ...tbRow(opened.filter((h) => h.heroPos === pos)) })).filter((r) => r.n);
  const worstTypes = [...tbGroup(callers, (h) => handLabel(h.heroCards))].map(([label, list]) => ({ label, ...tbRow(list) }))
    .filter((r) => r.n >= 3 && r.net < 0).sort((a, b) => a.net - b.net).slice(0, 8);

  // răspunsul lui Hero la 3-bet după ce a deschis (toate mâinile, inclusiv cele terminate preflop)
  const facing = [];
  for (const h of hands) {
    const acts = h.streets.preflop, i0 = acts.findIndex((a) => a.type === 'raise');
    if (i0 < 0 || acts[i0].player !== 'Hero') continue;
    const j = acts.findIndex((a, i) => i > i0 && a.type === 'raise' && a.player !== 'Hero');
    if (j < 0) continue;
    const resp = acts.find((a, i) => i > j && a.player === 'Hero' && a.type !== 'post');
    if (resp) facing.push({ pos: h.heroPos, response: resp.type });
  }
  const resp = (list) => ({ n: list.length, fold: prop(list.filter((x) => x.response === 'fold').length, list.length),
    call: prop(list.filter((x) => x.response === 'call').length, list.length), raise: prop(list.filter((x) => x.response === 'raise').length, list.length) });
  return {
    callers: tbRow(callers), byCategory, opened: tbRow(opened), openedByPos, worstTypes,
    vs3bet: { total: resp(facing), byPos: TB_POSITIONS.map((pos) => ({ pos, ...resp(facing.filter((x) => x.pos === pos)) })).filter((r) => r.n) },
  };
}
