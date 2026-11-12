// Păstrarea mâinilor în browser. Se salvează textul brut al fiecărei mâini, cu ID-ul ei drept cheie;
// la fiecare vizită textul se trece din nou prin parser. Dublurile se ignoră după ID.

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

// Depozit în memorie: pentru teste și ca rezervă când IndexedDB nu este disponibil.
export function memoryBackend() {
  const map = new Map();
  return {
    persistent: false,
    async all() { return [...map.values()]; },
    async putMany(records) { for (const r of records) map.set(r.id, r); },
    async clear() { map.clear(); },
  };
}

// Depozit IndexedDB: o singură colecție, cu ID-ul mâinii drept cheie.
export function idbBackend(idb, name = 'gutti-analizor') {
  const STORE = 'maini';
  const open = () => new Promise((resolve, reject) => {
    const req = idb.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const run = async (mode, work) => {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const result = work(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(result?.result);
        tx.onerror = tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  };
  return {
    persistent: true,
    all: () => run('readonly', (s) => s.getAll()),
    putMany: (records) => run('readwrite', (s) => { for (const r of records) s.put(r); }),
    clear: () => run('readwrite', (s) => s.clear()),
  };
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

// Deschide depozitul din browser; dacă IndexedDB lipsește sau este blocat, lucrează doar în memorie.
export async function openBrowserStore(idb) {
  if (idb) { try { return await createHandStore(idbBackend(idb)); } catch { /* blocat: continuă în memorie */ } }
  return createHandStore(memoryBackend());
}
