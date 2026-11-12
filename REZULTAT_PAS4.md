# Pasul 4 — defalcări pentru analizorul de leak-uri

Cifrele sunt de pe arhiva completă: 35 de fișiere, 7.191 de mâini, 05.09.2026 – 10.11.2026. Verificarea potului trece în continuare pe toate mâinile (0 respinse, 0 linii necunoscute). Parserul nu a fost modificat.

Se reproduc cu `node scripts/report.mjs <arhivă.zip> ...` și apar în `dist/analizor.html`.

## 1. Verificare bb / $

**Nu este o eroare.** Arhiva conține două mize, nu doar NL2:

| Miză | Big blind | Mâini | Net (bb) | Net ($) | bb/100 | Interval 95% bb/100 |
|---|---|---|---|---|---|---|
| 0.01/0.02 | 0,02 $ | 4.724 | −186,0 | −3,72 | −3,9 | −31,9 … +24,0 |
| 0.02/0.05 | 0,05 $ | 2.467 | −102,6 | −5,13 | −4,2 | −47,6 … +39,3 |
| **total** | | 7.191 | −288,6 | −8,85 | −4,0 | −27,7 … +19,7 |

- bb se calculează pe fiecare mână, cu big blind-ul acelei mâini (`heroNet / bb`), apoi se adună. Un test verifică asta pe fiecare mână.
- −186,0 × 0,02 $ = −3,72 $ și −102,6 × 0,05 $ = −5,13 $; împreună −8,85 $. Cei −5,77 $ ar fi fost corecți doar dacă toate mâinile erau NL2.
- Nu s-a schimbat nimic în calcul; am adăugat doar tabelul pe miză.

## 2. Mâini terminate preflop

Mâinile în care Hero nu a văzut flopul (6.156).

| Poziție | Mâini | Net (bb) | bb/100 | Blinduri postate (bb) | Net fără blinduri (bb) |
|---|---|---|---|---|---|
| UTG | 1.107 | +128,7 | +11,6 | 0 | +128,7 |
| HJ | 1.063 | +72,4 | +6,8 | 0 | +72,4 |
| CO | 1.056 | +107,6 | +10,2 | 0 | +107,6 |
| BTN | 1.022 | +141,9 | +13,9 | 0 | +141,9 |
| SB | 1.039 | −320,8 | −30,9 | 484,7 | +163,9 |
| BB | 869 | −466,3 | −53,7 | 869,0 | +402,7 |
| **SB + BB** | 1.908 | −787,1 | −41,3 | 1.353,7 | +566,6 |
| **celelalte poziții** | 4.248 | +450,6 | +10,6 | 0 | +450,6 |
| **total** | 6.156 | −336,5 | −5,5 | 1.353,7 | +1.017,2 |

- Tot minusul preflop vine din blinduri: din celelalte patru poziții ești pe plus cu 450,6 bb.
- În toate mâinile, inclusiv cele cu flop, ai postat 1.756,5 bb în blinduri.
- Blindul mic este 0,5 bb la NL2, dar 0,4 bb la NL5 (0,02 $ din 0,05 $); de aceea SB are 484,7 bb, nu 519,5.

## 3. Single-raised, caller, OOP, heads-up

209 mâini, −384,8 bb. Toate grupele de aici sunt sub 200 de mâini, deci „eșantion mic”.

| Hero / cine a deschis | Mâini | Net (bb) | bb/mână | Fold la tot (bb) | Diferență (bb) | Diferență/mână |
|---|---|---|---|---|---|---|
| **Hero BB** | 170 | −351,4 | −2,07 | −170,0 | −181,4 | −1,07 |
| contra UTG | 32 | −375,2 | −11,73 | −32,0 | −343,2 | −10,73 |
| contra HJ | 36 | −25,2 | −0,70 | −36,0 | +10,8 | +0,30 |
| contra CO | 39 | +50,1 | +1,28 | −39,0 | +89,1 | +2,28 |
| contra BTN | 63 | −1,1 | −0,02 | −63,0 | +61,9 | +0,98 |
| **Hero SB** | 39 | −33,4 | −0,86 | −17,6 | −15,8 | −0,41 |
| contra UTG | 10 | −3,6 | −0,36 | −4,3 | +0,7 | +0,07 |
| contra HJ | 11 | +28,8 | +2,62 | −5,0 | +33,8 | +3,07 |
| contra CO | 7 | −7,2 | −1,03 | −3,1 | −4,1 | −0,59 |
| contra BTN | 11 | −51,4 | −4,67 | −5,2 | −46,2 | −4,20 |

- Aproape tot minusul grupei vine din BB contra deschiderii din UTG: 32 de mâini, −375,2 bb. Fără ele, restul grupei este la −9,6 bb.
- Contra HJ, CO și BTN, apărarea din BB a ieșit mai bine decât foldul, cu 162 bb în total.
- La 32 de mâini, câteva poturi mari pot face singure această cifră; merită uitat pe mâinile concrete înainte de orice concluzie.

## 4. Mâini pierdute la showdown

165 de mâini, −4.439,4 bb.

| Stradă | Investit (bb) | Prin call | Prin bet/raise | Blinduri |
|---|---|---|---|---|
| preflop | 985,4 | 448,3 (45%) | 472,2 (48%) | 64,9 |
| flop | 906,4 | 486,2 (54%) | 420,2 (46%) | 0 |
| turn | 982,7 | 565,9 (58%) | 416,8 (42%) | 0 |
| river | 1.564,9 | 854,0 (55%) | 710,9 (45%) | 0 |
| **total** | 4.439,4 | 2.354,4 (53%) | 2.020,1 (46%) | 64,9 |

| Ultima acțiune a lui Hero | Mâini | Net (bb) | bb/mână |
|---|---|---|---|
| am plătit (call) | 48 | −2.413,2 | −50,3 |
| am pariat sau am ridicat și am fost plătit | 34 | −1.423,2 | −41,9 |
| check | 83 | −603,0 | −7,3 |

- River-ul este strada cea mai scumpă: 35% din tot ce s-a pierdut la showdown.
- Jumătate din mâini (83) se termină cu check și costă puțin; cele 82 în care ultima acțiune a pus bani în pot fac 86% din pierdere.

## 5. Mărimea eșantionului

- Lângă fiecare cifră apare numărul de mâini; grupele sub 200 de mâini au eticheta „eșantion mic” (în pagină) sau `[eșantion mic]` (în terminal).
- Pragul vechi rămâne: sub 30 de cazuri un procent este marcat „prea puține mâini” și nu se compară cu niciun reper.
- bb/100 total: **−4,0, cu interval de încredere de 95% între −27,7 și +19,7**. Deviația standard reală este 102,4 bb la 100 de mâini.
- Intervalul include zero cu mult: pe 7.191 de mâini nu se poate spune dacă ești jucător câștigător sau pierzător.

## Definiții alese de mine

- **Mână terminată preflop**: Hero nu a văzut flopul (a dat fold preflop sau mâna s-a încheiat fără flop).
- **Blinduri postate**: suma efectiv postată de Hero, în bb ale acelei mâini.
- **Net fără blinduri**: netul plus blindurile postate, adică rezultatul dacă blindurile ar fi fost gratuite.
- **Reperul „fold la tot”**: am folosit blindul efectiv postat, nu −0,5 bb fix din SB. Din BB este −1 bb pe mână, cum ai cerut; din SB este −0,5 bb la NL2 și −0,4 bb la NL5. Cu −0,5 fix, reperul pentru SB ar fi −19,5 bb în loc de −17,6.
- **Cine a deschis**: ultimul jucător care a ridicat preflop (în pot single-raised este singurul).
- **Mână pierdută la showdown**: Hero ajunge la showdown și nu încasează nimic. Alte 7 mâini de showdown au net negativ deși Hero a încasat ceva (pot împărțit sau rulat de mai multe ori); nu sunt incluse.
- **Investit pe stradă**: banii puși de Hero pe acea stradă, în bb. Suma returnată ca „uncalled bet” se scade din ultimul bet sau raise al lui Hero.
- **Ultima acțiune**: ultima acțiune a lui Hero din mână, fără blinduri. Am adăugat grupa „check”, ca cele trei grupe să dea totalul.
- **Interval de încredere**: media ± 1,96 × deviația standard de eșantion ÷ √n, pe rezultatele pe mână în bb.

## Teste

`node --test`: 21 din 21. Cele 6 teste noi (`test/breakdowns.test.js`) acoperă fiecare defalcare pe mâinile reale din `test/fixtures/`, cu valori calculate de mână, și verifică faptul că sumele dau totalul general:

- pe miză = total, în bb și în $
- pe poziție = total preflop; SB + BB plus celelalte poziții = total preflop
- preflop + mâini cu flop = total
- pe cine a deschis = total pe poziția lui Hero = rândul din tabelul „Unde se duc banii”
- investit pe străzi = pierderea totală la showdown; grupele după ultima acțiune = total

Build-ul paginii verifică acum și sintaxa scriptului lipit. În timpul lucrului, două funcții cu același nume din module diferite au oprit pagina fără ca testele să observe.
