// Rulează în Web Worker: aceeași buclă de rezolvare ca RunSolver.vue din wasm-postflop.
const post = (type, data) => postMessage({ type, ...data });

function readNode(g, history) {
  g.apply_history(new Uint32Array(history));
  const player = g.current_player();
  const actions = g.actions_after(new Uint32Array(0)).split('/');
  const n0 = g.private_cards(0).length, n1 = g.private_cards(1).length;
  const res = g.get_results();
  const cur = player === 'oop' ? 0 : 1, n = cur === 0 ? n0 : n1;
  const w = res.subarray(3 + n0 + n1 + (cur ? n0 : 0), 3 + n0 + n1 + (cur ? n0 : 0) + n); // ponderi normalizate
  const strat = res.subarray(3 + 5 * (n0 + n1)); // [acțiune][mână]
  const total = w.reduce((a, b) => a + b, 0);
  const freq = {};
  actions.forEach((a, i) => {
    let s = 0;
    for (let h = 0; h < n; h++) s += strat[i * n + h] * w[h];
    freq[a] = +((100 * s) / total).toFixed(2);
  });
  return { history, player, actions, freq };
}

onmessage = async ({ data: { variant, threads, spot, maxIter, sizes, memOnly } }) => {
  try {
    post('env', { crossOriginIsolated: self.crossOriginIsolated, sab: typeof SharedArrayBuffer !== 'undefined' });
    const mod = await import(`/pkg/solver-${variant}/solver.js`);
    const wasm = await mod.default();
    if (variant === 'mt') await mod.initThreadPool(threads);
    const g = mod.GameManager.new();
    const s = spot;
    // sizes (opțional) înlocuiește mărimile pe stradă: { flop: [bet, raise], turn: [...], river: [...] }
    const z = { flop: [s.bet, s.raise], turn: [s.bet, s.raise], river: [s.bet, s.raise], ...(sizes ?? s.sizes ?? {}) };
    const [fb, fr] = z.flop, [tb, tr] = z.turn, [rb, rr] = z.river;
    let t = performance.now();
    const err = g.init(new Float32Array(s.oop.raw), new Float32Array(s.ip.raw), new Uint8Array(s.board),
      s.startingPot, s.effectiveStack, s.rakeRate, s.rakeCap, false,
      fb, fr, tb, tr, '', rb, rr, '', fb, fr, tb, tr, rb, rr,
      s.addAllInThreshold, s.forceAllInThreshold, s.mergingThreshold, '', '');
    if (err) throw new Error(err);
    const buildMs = performance.now() - t;
    const mem = Number(g.memory_usage(false)), memC = Number(g.memory_usage(true));
    const compress = mem > 3.9 * 2 ** 30;
    post('tree', { buildMs, mem, memC, compress });
    if (memOnly) return post('done', { sizes: z, mem, memC });

    const target = (s.startingPot * s.targetPct) / 100;
    const limit = maxIter ?? s.maxIterations;
    t = performance.now();
    g.allocate_memory(compress);
    let it = 0, expl = Math.max(g.exploitability(), 0), fresh = true;
    const trace = [[0, expl]];
    while (it < limit && expl > target) {
      g.solve_step(it); it++; fresh = false;
      if (it % 10 === 0) { expl = Math.max(g.exploitability(), 0); fresh = true; trace.push([it, expl]); post('progress', { it, expl }); }
    }
    if (!fresh) expl = Math.max(g.exploitability(), 0);
    g.finalize();
    const solveMs = performance.now() - t;

    const root = readNode(g, []);
    const out = { root };
    const iCheck = root.actions.indexOf('Check:0');
    out.afterCheck = readNode(g, [iCheck]);
    const iBet = out.afterCheck.actions.findIndex((a) => a.startsWith('Bet:'));
    out.vsSmallBet = readNode(g, [iCheck, iBet]); // BB contra celui mai mic bet al BTN
    const wasmBytes = (wasm.memory ?? mod.__wbindgen_memory?.())?.buffer?.byteLength ?? null;
    post('done', { variant, threads, sizes: z, buildMs, solveMs, iterations: it, exploitability: expl, target,
      explPct: (100 * expl) / s.startingPot, mem, memC, compress, wasmBytes, trace, strategy: out });
  } catch (e) {
    post('error', { message: String(e?.stack ?? e) });
  }
};
