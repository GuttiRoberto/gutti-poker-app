# Pasul 2 — testul solverului postflop în browser

## Concluzie

**Nu** pentru arborele cerut și **nu** pentru rezolvarea de flopuri la cerere; **da** pentru turn și river.

- Arborele cerut (33% / 75% / all-in pe fiecare stradă, raise 3x, 97,5bb, range-urile `4` și `9A`) are nevoie de **31–34 GB** de memorie (16–17 GB în modul comprimat pe 16 biți). WebAssembly în browser este limitat la 4 GB, deci alocarea eșuează imediat. Spotul cerut **nu a fost rezolvat**.
- Un arbore redus, care păstrează flopul cerut dar simplifică turn-ul și river-ul, se rezolvă în browser în **aproape 10 minute** cu 4 fire și aproximativ 2,6 GB. Funcționează, dar este prea lent pentru un trainer interactiv.
- Un **turn** se rezolvă în browser în **4,5 s**, iar un **river** în **sub 0,1 s**, cu mărimile complete 33% / 75% / all-in și raise 3x.

Recomandare: flopurile se rezolvă nativ, dinainte, și se salvează; browserul doar citește strategia salvată și, la nevoie, rezolvă pe loc turn-ul sau river-ul.

## Condițiile testului

| | |
|---|---|
| Mașină | container cloud, Intel Xeon 2,10 GHz, **4 nuclee**, 15 GB RAM (nu i5-8400 cu 6 nuclee) |
| Browser | Chromium 153 (Playwright, headless) |
| Cod | `b-inary/wasm-postflop` la `97360db`, motor `b-inary/postflop-solver` la `9d1509f` |
| Unități | 1bb = 10 jetoane: pot 55, stack 975 |
| Rake | 0 (parametrii `rakeRate` și `rakeCap` din `postflop-test/spot.json`) |
| Țintă | exploatabilitate ≤ 0,5% din pot, verificată la fiecare 10 iterații, ca în interfața originală |
| Praguri de arbore | valorile implicite ale interfeței: all-in adăugat sub 150% din pot, forțat sub 20% din stack, contopire la 10% |

Timpii sunt măsurați, nu estimați, dar pe altă mașină decât PC-ul țintă. Un i5-8400 are nuclee mai rapide și cu două mai multe, deci timpii de acolo ar trebui să fie mai mici; nu am măsurat cu cât.

Range-urile vin din `rangeString("4")` (BTN, 543,5 combinații) și `rangeString("9A")` (BB, 350,7 combinații), trecute prin parserul de range al wasm-postflop și verificate față de `rangeFor`.

## Pașii de build care au funcționat

Build-ul din README nu mai merge ca atare în 2026. Au fost necesare patru ajustări:

1. **Toolchain Rust din 2023.** Cu nightly-ul curent, `wasm-bindgen` 0.2.87 refuză să compileze.
   ```bash
   rustup install nightly-2023-10-01 --profile minimal
   rustup +nightly-2023-10-01 component add rust-src
   rustup +nightly-2023-10-01 target add wasm32-unknown-unknown
   ```
2. **`wasm-pack` și `wasm-bindgen-cli` instalate separat**, al doilea cu toolchain-ul vechi și cu `--locked`.
   ```bash
   cargo install wasm-pack --locked
   cargo +nightly-2023-10-01 install wasm-bindgen-cli --version 0.2.87 --locked
   ```
3. **`wasm-opt` din npm**, fiindcă descărcarea automată de pe GitHub a eșuat în acest mediu.
   ```bash
   npm install -g binaryen
   ```
4. **Cele patru pachete wasm, compilate cu toolchain-ul fixat** (în loc de `npm run wasm`, care folosește `nightly`), apoi o corecție de o linie în fișierul generat pentru firele de lucru, fără de care webpack nu rezolvă importul.
   ```bash
   npm ci --ignore-scripts
   rustup run nightly-2023-10-01 wasm-pack build --out-dir ../../pkg/range rust/range
   rustup run nightly-2023-10-01 wasm-pack build --out-dir ../../pkg/tree rust/tree
   rustup run nightly-2023-10-01 wasm-pack build --target web --out-dir ../../pkg/solver-st rust/solver-st
   rustup run nightly-2023-10-01 wasm-pack build --target web --out-dir ../../pkg/solver-mt rust/solver-mt
   sed -i 's#import("../..")#import("../../solver.js")#' pkg/solver-mt/snippets/*/workerHelpers.js
   npm run build
   npm run serve
   ```

Aplicația originală pornește apoi pe `http://localhost:8080`. Măsurătorile nu s-au făcut prin interfața ei, ci printr-o pagină minimă (`postflop-test/`) care încarcă aceleași pachete wasm și rulează aceeași buclă de rezolvare ca `RunSolver.vue`.

## Memoria cerută de arbore

Măsurată cu `GameManager.memory_usage()` după construirea arborelui (`postflop-test/probe.mjs`). Limita practică în browser este 3,9 GB.

| Arbore (aceleași mărimi pentru ambii jucători) | 32 de biți | 16 biți | Încape? |
|---|---|---|---|
| **Cerut:** 33/75/all-in pe toate străzile, raise 3x | 31,3 GB | 15,9 GB | nu |
| 33/75 pe toate străzile, raise 3x | 27,9 GB | 14,2 GB | nu |
| 33/75/all-in; raise 3x doar pe flop, all-in pe turn și river | 14,8 GB | 7,5 GB | nu |
| Flop 33/75, turn 75, river 75, raise 3x | 7,0 GB | 3,5 GB | doar pe 16 biți |
| **Redus (cel rezolvat):** flop 33/75/all-in + raise 3x; turn și river bet 75%, raise all-in | 4,1 GB | 2,1 GB | doar pe 16 biți |
| Flop 33/75, turn 75, river 75, raise all-in | 1,9 GB | 1,0 GB | da |
| Flop 33, turn 75, river 75, raise all-in | 1,2 GB | 0,6 GB | da |

Ce umflă arborele sunt raise-urile de 3x repetate pe turn și river la stack adânc, nu betul all-in.

## Timp, memorie, iterații

Arborele redus, până la țintă:

| Variantă | Timp | Memorie de vârf | Iterații | Exploatabilitate |
|---|---|---|---|---|
| Browser, 4 fire, 16 biți | **598 s** | 2.568 MB (toate procesele browserului); memoria wasm 2.145 MB | 260 | 0,35% din pot |
| Nativ, 4 fire, 16 biți | **440 s** | 2.154 MB | 260 | 0,35% din pot |
| Nativ, 4 fire, 32 de biți | **365 s** | 4.222 MB | 260 | 0,37% din pot |
| Browser, un singur fir | nemăsurat | — | — | — |

- Browserul este de aproximativ 1,36 ori mai lent decât motorul nativ în același mod (16 biți), cu iterații și exploatabilitate identice.
- Rularea cu un singur fir pe arborele redus a fost oprită la cerere înainte să se termine. Pe turn, varianta cu un fir a fost de 6,5 ori mai lentă decât cea cu 4 fire (vezi mai jos).
- Programul nativ (`postflop-test/native/`) folosește același commit al motorului și se compilează cu Rust stabil 1.97, cu `bincode` și `bincode_derive` fixate la `2.0.0-rc.3`.

## Doar turn și doar river, în browser

Range-urile și potul sunt cele rămase în arborele redus rezolvat. Mărimi: 33% / 75% / all-in, raise 3x, pe toate străzile rămase.

| Spot | Pot / stack | Combinații BB / BTN | 4 fire | Un fir | Iterații | Exploatabilitate | Memorie arbore |
|---|---|---|---|---|---|---|---|
| **Turn:** Ks7d2c + 5h, după check / bet 33% / call | 9,1bb / 95,7bb | 148,2 / 439,5 | **4,5 s** | 29,0 s | 150 | 0,47% din pot | 70 MB |
| **River:** + 9s, după check / bet 75% / call pe turn | 22,7bb / 88,9bb | 80,7 / 203,1 | **0,06 s** | 0,03 s | 80 | 0,37% din pot | 0,2 MB |

Diferența mare dintre un fir și 4 fire pe turn (6,5x pe 4 nuclee) vine și din faptul că varianta cu fire este compilată cu instrucțiuni SIMD, iar cea cu un fir nu.

## Spațiul pe disc al rezultatului salvat

Măsurat nativ cu `save_data_to_file` pe arborele redus rezolvat (16 biți). Aplicația de browser nu are funcție de salvare: legătura wasm nu expune serializarea, deci ar trebui adăugată.

| Ce se păstrează | Necomprimat | Comprimat zstd (nivel 3) |
|---|---|---|
| Tot arborele (flop + turn + river) | **1.023 MB** | **416 MB** |
| Doar flop + turn (river-ul se rezolvă din nou la cerere) | **21,3 MB** | **13,4 MB** |
| Doar flop | 0,15 MB | 0,10 MB |

- Salvarea întregului arbore conține **deja doar strategia** și structura arborelui. Datele interne ale solverului (regrete și valori contrafactuale, încă aproximativ 1,1 GB în memorie) nu se scriu pe disc. „Doar strategia” înseamnă deci 1.023 MB, respectiv 416 MB cu zstd.
- Varianta flop + turn păstrează și valorile turn-ului, fiindcă din ele se reface river-ul.
- Aproape tot spațiul este river-ul. Cum un river se rezolvă în sub 0,1 s în browser, varianta de 13–21 MB pe flop este cea practică.

## Strategia la rădăcină (arborele redus)

Frecvențe medii pe range, la 0,35% exploatabilitate. Turn-ul și river-ul sunt simplificate în acest arbore, deci cifrele de flop ar putea diferi față de arborele cerut.

| Nod | Acțiune | Frecvență |
|---|---|---|
| BB, primul la vorbă | check | 100,00% |
| | bet 33% / bet 75% / all-in | 0,00% fiecare |
| BTN, după check | check | 8,19% |
| | bet 33% (1,8bb) | 91,80% |
| | bet 75% (4,1bb) | 0,01% |
| | all-in | 0,00% |
| BB contra betului de 33% | fold | 31,75% |
| | call | 47,50% |
| | **check-raise 3x (la 5,4bb)** | **20,75%** |

## Unde sunt în cod range-urile, arborele și strategia

Toată legătura dintre interfață și motor este în două fișiere din wasm-postflop: `rust/solver-src/lib.rs` (clasa `GameManager`, expusă în JavaScript) și `src/worker.ts` (o înfășoară într-un Web Worker). Apelurile din interfață sunt în `src/components/RunSolver.vue`.

- **Range-uri și arbore:** `GameManager.init(...)`.
  - Range-urile sunt două `Float32Array` de 1326 de ponderi 0–1. Indexul perechii de cărți `a < b` este `a*(101-a)/2 + b - 1`, cu cartea = rang×4 + culoare (2=0 … A=12; c=0, d=1, h=2, s=3). Conversia din text o face `RangeManager.from_string()` + `raw_data()` din pachetul `range`.
  - Board-ul este un `Uint8Array` de 3, 4 sau 5 cărți; cu 4 sau 5 se rezolvă direct turn-ul sau river-ul.
  - Urmează pot, stack, `rake_rate`, `rake_cap`, apoi mărimile ca text pe jucător și stradă (`"33%,75%,a"` pentru bet, `"3x"` pentru raise) și cele trei praguri.
- **Rezolvare:** `memory_usage(comprimat)` → `allocate_memory(comprimat)` → în buclă `solve_step(i)` și `exploitability()` → `finalize()`.
- **Citirea unui nod:**
  - `apply_history([i0, i1, ...])` mută la nodul dat de indicii acțiunilor de la rădăcină (la un nod de șansă, indicele este cartea).
  - `current_player()` și `actions_after([])` spun cine vorbește și ce acțiuni are (de exemplu `Check:0/Bet:18/Bet:41/Allin:975`).
  - `private_cards(jucător)` dă mâinile, în aceeași ordine ca strategia.
  - `get_results()` întoarce un singur `Float64Array`: 3 valori de antet, apoi pentru ambii jucători ponderi, ponderi normalizate, equity, EV și EQR (5 blocuri de câte `n_oop + n_ip` valori), apoi strategia jucătorului curent ca `[acțiune][mână]`.
- Un exemplu complet, de 80 de rânduri, este `postflop-test/worker.js` (funcția `readNode` calculează frecvențele din tabelul de mai sus).

## Multithreading și găzduire

- Varianta cu fire folosește memorie partajată (`SharedArrayBuffer`), deci pagina trebuie servită cu `Cross-Origin-Opener-Policy: same-origin` și `Cross-Origin-Embedder-Policy: require-corp`. Aplicația originală le pune în `server.js` și în `public/_headers` (pentru Cloudflare Pages). Găzduirile care nu permit antete proprii, cum este GitHub Pages, nu le pot furniza direct.
- Există și un build fără fire (`solver-st`), pe care aplicația originală îl alege doar pentru Safari și iOS. În testele de aici a rulat corect pe turn și river, dar pe o pagină servită cu antetele.
- Testul fără antete **nu a fost rulat** (sărit la cerere). Rămâne neverificat dacă `solver-st` pornește fără ele și cum eșuează `solver-mt`.

## Ce nu s-a făcut

- Spotul cerut nu a fost rezolvat în nicio variantă; nu încape în 4 GB.
- Arborele redus nu a fost rezolvat cu un singur fir.
- Nicio măsurătoare pe i5-8400.
- Testul fără COOP/COEP.

## Fișiere

Toate în `postflop-test/`:

| Fișier | Rol |
|---|---|
| `make-spot.mjs`, `spot.json` | definiția spotului, generată din modulul de la pasul 1 |
| `index.html`, `worker.js`, `serve.mjs`, `run.mjs` | pagina de test, serverul cu antete și rularea automată în Chromium |
| `probe.mjs` | memoria cerută de fiecare variantă de arbore |
| `native/`, `make-native-input.mjs` | programul nativ: timp, memorie, salvare pe disc, export de subjocuri |
| `subgame-turn.json`, `subgame-river.json` | range-urile și potul pentru turn și river |
| `results/` | rezultatele brute ale fiecărei rulări |
