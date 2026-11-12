// Clasificarea unei mâini: tip de pot, rolul lui Hero, poziție relativă, număr de jucători pe flop, textura flopului.

const RANK_ORDER = '23456789TJQKA';

export function flopTexture(flop) {
  const ranks = flop.map((c) => RANK_ORDER.indexOf(c[0]) + 2);
  const suits = new Set(flop.map((c) => c[1])).size;
  const top = Math.max(...ranks);
  const span = (r) => Math.max(...r) - Math.min(...r);
  const low = ranks.map((r) => (r === 14 ? 1 : r)); // asul poate fi și carte mică (A-2-3)
  return {
    high: top === 14 ? 'A' : top === 13 ? 'K' : top === 12 ? 'Q' : top >= 10 ? 'J–T' : '9 sau mai jos',
    paired: new Set(ranks).size < 3,
    suits: suits === 3 ? 'rainbow' : suits === 2 ? 'două de o culoare' : 'monoton',
    connected: Math.min(span(ranks), span(low)) <= 4,
  };
}

// Ordinea de joc postflop: primul loc după buton vorbește primul, butonul ultimul.
function postflopOrder(h, names) {
  const M = Math.max(...h.players.map((p) => p.seat), 2);
  const key = (p) => (p.seat - h.buttonSeat - 1 + 10 * M) % M;
  return h.players.filter((p) => names.has(p.name)).sort((a, b) => key(a) - key(b)).map((p) => p.name);
}

export function classify(h) {
  const pre = h.streets.preflop;
  const raises = pre.filter((a) => a.type === 'raise');
  const aggressor = raises.length ? raises[raises.length - 1].player : null;
  const potType = raises.length === 0 ? 'limpat' : raises.length === 1 ? 'single-raised' : raises.length === 2 ? '3-bet' : '4-bet+';
  const heroVoluntary = pre.some((a) => a.player === 'Hero' && (a.type === 'call' || a.type === 'raise'));
  const heroRole = !h.heroSawFlop ? null : aggressor === 'Hero' ? 'agresor' : heroVoluntary ? 'caller' : 'blind';
  const c = { potType, aggressor, heroRole, sawFlop: h.heroSawFlop, flopPlayers: [], headsUp: null, position: null, texture: null };
  if (h.flop.length !== 3) return c;
  const foldedPre = new Set(pre.filter((a) => a.type === 'fold').map((a) => a.player));
  c.flopPlayers = postflopOrder(h, new Set(h.players.filter((p) => !foldedPre.has(p.name)).map((p) => p.name)));
  c.headsUp = c.flopPlayers.length === 2;
  c.texture = flopTexture(h.flop);
  if (h.heroSawFlop) c.position = c.flopPlayers[c.flopPlayers.length - 1] === 'Hero' ? 'IP' : 'OOP'; // IP = ultimul la vorbă
  return c;
}
