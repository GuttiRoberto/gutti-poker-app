// Graficul din Range.pdf (data/ranges.json) pentru „Hero a deschis și a primit 3-bet”: ce frecvență are fiecare acțiune pentru o mână.
// Greutățile sunt procente absolute pe clasă de mână; frecvența la decizie = 100 × pondere acțiune / reach, unde reach este
// ponderea mâinii în range-ul de deschidere. Graficele sunt pentru 100 bb.

// Păstrează doar ce trebuie paginii: range-urile de deschidere și răspunsurile la 3-bet, pe perechea (Hero, cel care dă 3-bet).
export function compactRanges(raw) {
  const R = raw.ranges, rfi = {}, vs3 = {};
  for (const s of raw.scenarios) if (s.category === 'RFI') rfi[s.hero] = { ...R[s.actions[0].range].classes };
  for (const s of raw.scenarios) {
    if (s.category !== 'Vs 3-bet / 4-bet' || s.status !== 'ok') continue;
    const m = /^(\w+) vs (\w+) 3Bet$/.exec(s.title);
    if (!m) continue;
    const range = (k) => ({ ...(R[s.actions.find((a) => a.key === k)?.range]?.classes ?? {}) });
    vs3[`${m[1]}|${m[2]}`] = { call: range('call'), raise: range('raise') };
  }
  return { rfi, vs3 };
}

// label: clasa mâinii (AKs, QJo, 99). Întoarce null dacă nu există grafic pentru perechea de poziții;
// { reach: 0 } dacă mâna nu era în range-ul de deschidere; altfel frecvențele în % (fold + call + raise = 100).
export function chartDecision(data, heroPos, villainPos, label) {
  const sc = data.vs3[`${heroPos}|${villainPos}`], open = data.rfi[heroPos];
  if (!sc || !open) return null;
  const reach = open[label] ?? 0;
  if (reach <= 0) return { reach: 0, call: 0, raise: 0, fold: 0 };
  const call = Math.min(100, (100 * (sc.call[label] ?? 0)) / reach);
  const raise = Math.min(100 - call, (100 * (sc.raise[label] ?? 0)) / reach);
  return { reach, call, raise, fold: Math.max(0, 100 - call - raise) };
}
