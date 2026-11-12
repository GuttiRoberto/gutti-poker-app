# Pasul 5 — analizorul în browser, fără nimic instalat

## Stare

- Ramurile pașilor 1–5 sunt unite în `main`.
- Pagina **nu este încă publicată**: GitHub Pages nu este activat pe depozit, iar activarea se face doar din setările lui. Deploy-ul automat a rulat la push, a trecut testele și build-ul, și s-a oprit la pasul de publicare.

## Ce mai ai de făcut (o singură dată)

1. Pe GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Actions → Publicare pe GitHub Pages → Run workflow** (sau orice push pe `main`).
3. Pagina va fi la **https://guttiroberto.github.io/gutti-poker-app/**

Depozitul este privat. Pe un cont GitHub gratuit, Pages nu se poate activa pe un depozit privat; este nevoie de GitHub Pro sau de un depozit public. Dacă îl faci public, devin vizibile și cele 20 de mâini reale din `test/fixtures/` și `data/ranges.json`. Site-ul publicat conține doar pagina, fără mâini.

## Ce face pagina

| Cerință | Rezultat |
|---|---|
| Fișiere GG `.txt` și `.zip`, mai multe deodată, drag & drop și buton | exista deja din pasul 3; am adăugat un buton vizibil „Alege fișiere” și am testat și drag & drop |
| Calcul local | singura cerere de rețea este pagina însăși (verificat în test); fișierele nu pleacă nicăieri |
| Raport automat | raportul complet (pașii 3 și 4) apare imediat după încărcare și la fiecare vizită |
| Păstrare în browser | IndexedDB, baza `gutti-analizor`; se păstrează textul brut al fiecărei mâini, cu ID-ul drept cheie |
| Duplicate | ignorate după ID-ul mâinii, și în aceeași încărcare, și față de ce este deja păstrat |
| „Șterge tot” | buton cu confirmare; golește baza și raportul |

Pe arhiva completă (7.191 de mâini), în Chromium: prima încărcare durează aproximativ 1 secundă, redeschiderea paginii sub 1 secundă; reîncărcarea unei arhive deja adăugate dă 0 mâini noi și 4.370 de duplicate ignorate.

## De știut

- Mâinile sunt păstrate pe browser și pe adresă: ce încarci pe telefon nu apare pe PC, iar ce ai încărcat în `dist/analizor.html` deschis de pe disc nu apare pe pagina publicată.
- Dacă browserul blochează IndexedDB (unele ferestre private), pagina funcționează, dar spune că mâinile rămân doar până o închizi.
- Se păstrează text brut, nu rezultate calculate, deci o versiune viitoare a analizorului recalculează totul din aceleași mâini.

## Teste

`node --test`: 27 din 27. Parserul și calculele existente nu au fost modificate.

- `test/store.test.js` (5 teste): împărțirea în mâini, duplicate, persistență între două vizite, ștergere, lipsa IndexedDB.
- `test/browser.test.js` (1 test): pagina reală în Chromium — două `.txt` prin buton, un `.zip` prin drag & drop, același fișier a doua oară, reîncărcarea paginii, „șterge tot”. Rulează doar unde este instalat Playwright; în deploy-ul automat este sărit.

## Fișiere noi

`src/store.js`, `.github/workflows/pages.yml`, `test/store.test.js`, `test/browser.test.js`.
