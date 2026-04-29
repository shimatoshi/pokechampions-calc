// IndexedDB wrapper with persistence
const DB = (() => {
  const DB_NAME = 'pokechamp';
  const DB_VER = 2;
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
    async persist() {
      if (navigator.storage && navigator.storage.persist) return navigator.storage.persist();
      return false;
    }
  };
})();
