// spot.json + sizes -> fișier text pentru native-bench. Utilizare: node make-native-input.mjs <sizes.json> <compress 0|1> <save 0|1> <ieșire>
import { readFileSync, writeFileSync } from 'node:fs';
const [sizesFile, compress, save, out] = process.argv.slice(2);
const s = JSON.parse(readFileSync(new URL('./spot.json', import.meta.url)));
const z = JSON.parse(readFileSync(sizesFile));
const card = (c) => '23456789TJQKA'.indexOf(c[0]) * 4 + 'cdhs'.indexOf(c[1]);
const lines = {
  oop: s.oop.raw.join(' '), ip: s.ip.raw.join(' '), board: s.board.join(' '),
  startingPot: s.startingPot, effectiveStack: s.effectiveStack, rakeRate: s.rakeRate, rakeCap: s.rakeCap,
  addAllInThreshold: s.addAllInThreshold, forceAllInThreshold: s.forceAllInThreshold, mergingThreshold: s.mergingThreshold,
  targetPct: s.targetPct, maxIterations: s.maxIterations, compress, save,
  turnCard: card('5h'), riverCard: card('9s'),
};
for (const st of ['flop', 'turn', 'river']) { lines[`${st}_bet`] = z[st][0]; lines[`${st}_raise`] = z[st][1]; }
writeFileSync(out, Object.entries(lines).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
