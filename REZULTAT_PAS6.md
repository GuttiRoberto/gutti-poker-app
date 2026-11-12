# Pasul 6: fără stocare, EV all-in, poduri 3-bet/4-bet

Ramura `claude/pasii-1-4`. Testele trec (`node --test`), inclusiv testul paginii în Chromium.

## Ce s-a schimbat
1. **Fără stocare.** Mâinile trăiesc doar în memoria paginii (fără IndexedDB, fără „Șterge tot”). La reîncărcare dispare tot; fișierele rămân pe PC. Butonul „Salvează PDF” deschide tipărirea, cu stil de tipărire (tabelele nu se taie, antetul se repetă, zona de încărcare și filtrele dispar).
2. **Parser.** `straddle $N` (și „and is all-in”) se citește ca blind postat, deci nu mai rămân linii necunoscute și mâinile respective nu mai pică la verificarea potului. Antetul acceptă detalii în paranteză (ante, straddle) și `$` lipsă. Antetele tot necunoscute sunt afișate în raport cu forma lor, ca să se vadă exact ce lipsește.
3. **EV all-in** (`src/equity.js`, `src/allin.js`). Echitatea se calculează din cărțile arătate: flop/turn/river numărate exact, preflop prin simulare (30.000 board-uri, generator fix, eroare ~0,3%). Valorile sunt verificate față de echități numărate exact pe toate cele 1.712.304 board-uri. Se sar mâinile cu side pot, EV cashout, cărți necunoscute sau pariuri după all-in. Raportul arată rezultat real, rezultat cu EV, norocul cu marjă de variație (±1,96 × rădăcina sumei pătratelor) și norocul pe categorii de echitate și pe stradă.
4. **Poduri 3-bet/4-bet** (`src/handclass.js`, `src/threebet.js`). Secțiunea „1c” împarte mâinile plătite pe 7 categorii (premium, perechi medii/mici, broadway, as suited mic, alte suited/offsuit), cu noroc all-in și net fără noroc, cele mai pierzătoare mâini (cel puțin 3), poziția când Hero a deschis și a plătit 3-bet, și răspunsul la 3-bet (fold/call/4-bet) cu interval de încredere.

## Limite
- EV all-in măsoară norocul, nu calitatea deciziei.
- Preflop echitatea este simulată; diferența față de numărătoarea exactă este sub 0,5% pe mână și se compensează în sumă.
- Parserul nu a putut fi încercat pe fișierele tale reale în acest pas; după încărcare, secțiunea „Mâini respinse” arată ce a rămas nerecunoscut.
