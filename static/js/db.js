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
    // Import from JSON
    async importAll(data) {
      if (data.box) { for (const item of data.box) await this.put('box', item); }
      if (data.teams) { for (const item of data.teams) await this.put('teams', item); }
      if (data.threats) { for (const item of data.threats) await this.put('threats', item); }
      if (data.records) { for (const item of data.records) await this.put('records', item); }
    }
  };
})();
