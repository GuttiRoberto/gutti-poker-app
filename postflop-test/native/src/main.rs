// Rulează arborele nativ (motorul postflop-solver direct), măsoară timp/memorie,
// salvează rezultatul pe disc în mai multe moduri și exportă range-urile pentru turn și river.
// Utilizare: native-bench <input.txt> <director ieșire>   (fire: RAYON_NUM_THREADS)
use postflop_solver::*;
use std::collections::HashMap;
use std::fmt::Write as _;
use std::time::Instant;

fn peak_rss_mb() -> f64 {
    let s = std::fs::read_to_string("/proc/self/status").unwrap_or_default();
    s.lines()
        .find(|l| l.starts_with("VmHWM"))
        .and_then(|l| l.split_whitespace().nth(1)?.parse::<f64>().ok())
        .map_or(0.0, |kb| kb / 1024.0)
}

fn raw_range(game: &PostFlopGame, player: usize) -> Vec<f32> {
    let mut raw = vec![0.0f32; 1326];
    for (&(c1, c2), &w) in game.private_cards(player).iter().zip(game.weights(player)) {
        let (a, b) = (c1.min(c2) as usize, c1.max(c2) as usize);
        raw[a * (101 - a) / 2 + b - 1] = w.clamp(0.0, 1.0);
    }
    raw
}

fn subgame_json(game: &PostFlopGame, base_pot: i32, base_stack: i32, board: &[u8]) -> String {
    let bet = game.total_bet_amount();
    let arr = |v: Vec<f32>| v.iter().map(|x| format!("{:.5}", x)).collect::<Vec<_>>().join(",");
    let combos = |p: usize| game.weights(p).iter().sum::<f32>();
    format!(
        "{{\"board\":{:?},\"startingPot\":{},\"effectiveStack\":{},\"combos\":[{:.1},{:.1}],\"oop\":[{}],\"ip\":[{}]}}",
        board, base_pot + bet[0] + bet[1], base_stack - bet[0].max(bet[1]), combos(0), combos(1),
        arr(raw_range(game, 0)), arr(raw_range(game, 1))
    )
}

fn find(game: &PostFlopGame, pred: impl Fn(&Action) -> bool) -> usize {
    game.available_actions().iter().position(pred).expect("acțiune lipsă")
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let (input, out_dir) = (&args[1], &args[2]);
    let text = std::fs::read_to_string(input).unwrap();
    let kv: HashMap<&str, &str> = text.lines().filter_map(|l| l.split_once('=')).collect();
    let nums = |k: &str| kv[k].split_whitespace().map(|x| x.parse::<f32>().unwrap()).collect::<Vec<_>>();
    let num = |k: &str| kv[k].parse::<f64>().unwrap();
    let sizes = |k: &str| BetSizeOptions::try_from((kv[&*format!("{k}_bet")], kv[&*format!("{k}_raise")])).unwrap();
    let board: Vec<u8> = nums("board").iter().map(|&x| x as u8).collect();
    let compress = kv["compress"] == "1";
    let (pot, stack) = (num("startingPot") as i32, num("effectiveStack") as i32);

    let card_config = CardConfig {
        range: [Range::from_raw_data(&nums("oop")).unwrap(), Range::from_raw_data(&nums("ip")).unwrap()],
        flop: board[..3].try_into().unwrap(),
        turn: NOT_DEALT,
        river: NOT_DEALT,
    };
    let tree_config = TreeConfig {
        initial_state: BoardState::Flop,
        starting_pot: pot,
        effective_stack: stack,
        rake_rate: num("rakeRate"),
        rake_cap: num("rakeCap"),
        flop_bet_sizes: [sizes("flop"), sizes("flop")],
        turn_bet_sizes: [sizes("turn"), sizes("turn")],
        river_bet_sizes: [sizes("river"), sizes("river")],
        turn_donk_sizes: None,
        river_donk_sizes: None,
        add_allin_threshold: num("addAllInThreshold"),
        force_allin_threshold: num("forceAllInThreshold"),
        merging_threshold: num("mergingThreshold"),
    };

    let t = Instant::now();
    let mut game = PostFlopGame::with_config(card_config, ActionTree::new(tree_config).unwrap()).unwrap();
    let build_ms = t.elapsed().as_millis();
    let (mem, mem_c) = game.memory_usage();

    let target = pot as f32 * num("targetPct") as f32 / 100.0;
    let max_iter = num("maxIterations") as u32;
    let t = Instant::now();
    game.allocate_memory(compress);
    let (mut it, mut expl) = (0u32, compute_exploitability(&game).max(0.0));
    while it < max_iter && expl > target {
        solve_step(&game, it);
        it += 1;
        if it % 10 == 0 {
            expl = compute_exploitability(&game).max(0.0);
            eprintln!("iter {it} expl {expl:.4}");
        }
    }
    if it % 10 != 0 {
        expl = compute_exploitability(&game).max(0.0);
    }
    finalize(&mut game);
    let solve_ms = t.elapsed().as_millis();
    let peak = peak_rss_mb();

    let mut out = String::new();
    write!(out, "{{\"threads\":{},\"compress\":{compress},\"buildMs\":{build_ms},\"solveMs\":{solve_ms},\"iterations\":{it},\"exploitability\":{expl},\"explPct\":{},\"mem\":{mem},\"memC\":{mem_c},\"peakRssMB\":{peak:.0}",
        std::env::var("RAYON_NUM_THREADS").unwrap_or_default(), 100.0 * expl / pot as f32).unwrap();

    if kv.get("save") == Some(&"1") {
        // Salvare pe disc: modul River = tot arborele (doar strategia, fără valorile contrafactuale);
        // Turn/Flop = arbore trunchiat după strada respectivă (cu valorile contrafactuale ale ultimei străzi păstrate).
        out.push_str(",\"files\":{");
        let mut first = true;
        for (name, mode) in [("river", BoardState::River), ("turn", BoardState::Turn), ("flop", BoardState::Flop)] {
            game.set_target_storage_mode(mode).unwrap();
            for (suffix, level) in [("raw", None), ("zstd3", Some(3))] {
                let path = format!("{out_dir}/save-{name}-{suffix}.bin");
                let t = Instant::now();
                save_data_to_file(&game, "pas2", &path, level).unwrap();
                let bytes = std::fs::metadata(&path).unwrap().len();
                let _ = std::fs::remove_file(&path);
                write!(out, "{}\"{name}-{suffix}\":{{\"bytes\":{bytes},\"saveMs\":{}}}", if first { "" } else { "," }, t.elapsed().as_millis()).unwrap();
                first = false;
            }
        }
        out.push('}');

        // Range-uri pentru subjocuri: flop check, BTN bet mic (33%), BB call -> turn
        game.back_to_root();
        game.play(find(&game, |a| *a == Action::Check));
        game.play(find(&game, |a| matches!(a, Action::Bet(_))));
        game.play(find(&game, |a| *a == Action::Call));
        let turn = num("turnCard") as u8;
        let mut b = board.clone();
        b.push(turn);
        // ponderile pe nodul de șansă nu țin cont încă de cartea de turn; o jucăm întâi
        game.play(turn as usize);
        std::fs::write(format!("{out_dir}/subgame-turn.json"), subgame_json(&game, pot, stack, &b)).unwrap();
        // turn: BB check, BTN bet 75%, BB call -> river
        game.play(find(&game, |a| *a == Action::Check));
        game.play(find(&game, |a| matches!(a, Action::Bet(_))));
        game.play(find(&game, |a| *a == Action::Call));
        let river = num("riverCard") as u8;
        b.push(river);
        game.play(river as usize);
        std::fs::write(format!("{out_dir}/subgame-river.json"), subgame_json(&game, pot, stack, &b)).unwrap();
    }
    out.push('}');
    println!("{out}");
}
