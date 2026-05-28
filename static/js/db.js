// IndexedDB wrapper with persistence
export const DB = (() => {
  const DB_NAME = 'pokechamp';
  const DB_VER = 3;
  let db = null;

  function open() {
    if (db) return Promise.resolve(db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('teams'))
          d.createObjectStore('teams', { keyPath: 'id', autoIncrement: true });
        if (!d.objectStoreNames.contains('records'))
          d.createObjectStore('records', { keyPath: 'id', autoIncrement: true });
        if (!d.objectStoreNames.contains('threats'))
          d.createObjectStore('threats', { keyPath: 'id', autoIncrement: true });
        if (!d.objectStoreNames.contains('box'))
          d.createObjectStore('box', { keyPath: 'id', autoIncrement: true });
      };
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }

  async function tx(store, mode) {
    const d = await open();
    return d.transaction(store, mode).objectStore(store);
  }

  function wrap(req) {
    return new Promise((r, j) => { req.onsuccess = () => r(req.result); req.onerror = () => j(req.error); });
  }

  return {
    async getAll(store) { return wrap((await tx(store, 'readonly')).getAll()); },
    async get(store, id) { return wrap((await tx(store, 'readonly')).get(id)); },
    async put(store, obj) { return wrap((await tx(store, 'readwrite')).put(obj)); },
    async add(store, obj) { return wrap((await tx(store, 'readwrite')).add(obj)); },
    async del(store, id) { return wrap((await tx(store, 'readwrite')).delete(id)); },
    async clear(store) { return wrap((await tx(store, 'readwrite')).clear()); },
    async persist() {
      if (navigator.storage && navigator.storage.persist) return navigator.storage.persist();
      return false;
    },
    // Export all data as JSON
    async exportAll() {
      const [box, teams, threats, records] = await Promise.all([
        this.getAll('box'), this.getAll('teams'), this.getAll('threats'), this.getAll('records')
      ]);
      return { box, teams, threats, records, version: 1, exportedAt: Date.now() };
    },
    // Import from JSON (additive merge — never overwrites existing data)
    async importAll(data) {
      const stats = { added: 0, skipped: 0 };
      // BOX: skip duplicates by uid
      if (data.box) {
        const existing = await this.getAll('box');
        const uidSet = new Set(existing.map(e => e.uid).filter(Boolean));
        for (const item of data.box) {
          if (item.uid && uidSet.has(item.uid)) { stats.skipped++; continue; }
          const entry = { ...item }; delete entry.id;
          await this.add('box', entry);
          if (entry.uid) uidSet.add(entry.uid);
          stats.added++;
        }
      }
      // Teams: skip duplicates by name + member names
      if (data.teams) {
        const existing = await this.getAll('teams');
        const teamKeys = new Set(existing.map(t => t.name + '|' + (t.members||[]).map(m => m.name).join(',')));
        for (const item of data.teams) {
          const key = item.name + '|' + (item.members||[]).map(m => m.name).join(',');
          if (teamKeys.has(key)) { stats.skipped++; continue; }
          const entry = { ...item }; delete entry.id;
          await this.add('teams', entry);
          teamKeys.add(key);
          stats.added++;
        }
      }
      // Threats: skip duplicates by name
      if (data.threats) {
        const existing = await this.getAll('threats');
        const nameSet = new Set(existing.map(t => t.name));
        for (const item of data.threats) {
          if (nameSet.has(item.name)) { stats.skipped++; continue; }
          const entry = { ...item }; delete entry.id;
          await this.add('threats', entry);
          nameSet.add(item.name);
          stats.added++;
        }
      }
      // Records: always add (no natural dedup key)
      if (data.records) {
        for (const item of data.records) {
          const entry = { ...item }; delete entry.id;
          await this.add('records', entry);
          stats.added++;
        }
      }
      return stats;
    }
  };
})();
