// Mâinile încărcate trăiesc doar în memoria paginii: nimic nu se salvează în browser.
// La reîncărcarea paginii totul dispare; fișierele rămân numai pe calculatorul tău. Dublurile se ignoră după ID.

// Împarte un text în mâini brute: { records: [{ id, text }], stray: bucăți care nu sunt mâini }.
export function splitRawHands(text) {
  const clean = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const records = [], stray = [];
  for (const part of clean.split(/\n(?=Poker Hand #)/)) {
    const t = part.trim();
    if (!t) continue;
    const m = /^Poker Hand #(\S+?):/.exec(t);
    if (m) records.push({ id: m[1], text: t }); else stray.push(t.slice(0, 60));
  }
  return { records, stray };
}

// Depozit în memorie (singurul folosit de pagină).
export function memoryBackend() {
  const map = new Map();
  return {
    persistent: false,
    async all() { return [...map.values()]; },
    async putMany(records) { for (const r of records) map.set(r.id, r); },
    async clear() { map.clear(); },
  };
}

// Depozit care nu păstrează textul: pagina ține în memorie doar mâinile deja citite, iar aici rămân numai ID-urile (pentru dubluri).
export function idsOnlyBackend() {
  return { persistent: false, async all() { return []; }, async putMany() {}, async clear() {} };
}

// Logica de dubluri, independentă de depozit.
export async function createHandStore(backend) {
  const ids = new Set((await backend.all()).map((r) => r.id));
  return {
    persistent: backend.persistent,
    count: () => ids.size,
    all: () => backend.all(),
    // Adaugă doar mâinile cu ID nou; întoarce înregistrările adăugate și numărul de dubluri ignorate.
    async add(records) {
      const fresh = [];
      let duplicates = 0;
      for (const r of records) {
        if (ids.has(r.id)) { duplicates++; continue; }
        ids.add(r.id); fresh.push(r);
      }
      try { if (fresh.length) await backend.putMany(fresh); } catch (e) { for (const r of fresh) ids.delete(r.id); throw e; }
      return { added: fresh, duplicates };
    },
    async clear() { await backend.clear(); ids.clear(); },
  };
}
