// Etichetă și categorie pentru cărțile lui Hero: „AKs”, „QJo”, „99” și grupe mari de mâini.
const HC_RANKS = '23456789TJQKA';

export function handLabel(cards) {
  let r1 = HC_RANKS.indexOf(cards[0][0]), r2 = HC_RANKS.indexOf(cards[1][0]), s1 = cards[0][1], s2 = cards[1][1];
  if (r2 > r1) [r1, r2] = [r2, r1];
  return r1 === r2 ? HC_RANKS[r1] + HC_RANKS[r2] : HC_RANKS[r1] + HC_RANKS[r2] + (s1 === s2 ? 's' : 'o');
}

export const HAND_CATEGORIES = [
  'premium (AA–QQ, AK)', 'perechi medii (JJ–88)', 'perechi mici (77–22)', 'broadway (AQ–JT, ambele cărți T sau mai mari)',
  'as suited mic (A9s–A2s)', 'alte suited', 'alte offsuit',
];

// Indexul categoriei pentru o etichetă de tip „AKs”.
export function handCategory(label) {
  const hi = HC_RANKS.indexOf(label[0]), lo = HC_RANKS.indexOf(label[1]);
  if (label.length === 2) return hi >= 10 ? 0 : hi >= 6 ? 1 : 2;
  if (hi === 12 && lo === 11) return 0;
  if (lo >= 8) return 3;
  if (label[2] === 's' && hi === 12) return 4;
  return label[2] === 's' ? 5 : 6;
}
