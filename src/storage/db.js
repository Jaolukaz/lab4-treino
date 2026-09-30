/**
 * Camada mínima sobre IndexedDB (sem dependências).
 * Stores: plans (planejamentos), images (foto do atleta e escudos enviados, por planejamento),
 * meta (preferências internas). Imagens são gravadas como ArrayBuffer, e não como Blob, por ser o formato de maior
 * compatibilidade histórica entre Safari/iOS e Chrome/Android.
 * Se o IndexedDB não estiver disponível, cai para um armazenamento em memória e avisa a interface.
 */
// Nome próprio: no GitHub Pages os apps da Lab-4 compartilham a mesma origem (<usuario>.github.io),
// então cada um precisa do seu banco para não misturar dados.
const DB_NAME = 'lab4-treino';
const DB_VERSION = 1;
const STORES = ['plans', 'images', 'meta'];

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

class IdbStore {
  constructor(db) { this.db = db; this.kind = 'idb'; }
  run(store, mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, mode);
      let out;
      Promise.resolve(fn(tx.objectStore(store))).then((v) => { out = v; }, reject);
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transação abortada'));
    });
  }
  get(store, key) { return this.run(store, 'readonly', (s) => req(s.get(key))); }
  getAll(store) { return this.run(store, 'readonly', (s) => req(s.getAll())); }
  put(store, value, key) { return this.run(store, 'readwrite', (s) => req(key === undefined ? s.put(value) : s.put(value, key))); }
  del(store, key) { return this.run(store, 'readwrite', (s) => req(s.delete(key))); }
  delMany(store, keys) { return this.run(store, 'readwrite', (s) => Promise.all(keys.map((k) => req(s.delete(k))))); }
}

class MemoryStore {
  constructor() { this.kind = 'memory'; this.data = Object.fromEntries(STORES.map((s) => [s, new Map()])); }
  async get(store, key) { return this.data[store].get(key); }
  async getAll(store) { return [...this.data[store].values()]; }
  async put(store, value, key) { this.data[store].set(key === undefined ? value.id : key, value); }
  async del(store, key) { this.data[store].delete(key); }
  async delMany(store, keys) { keys.forEach((k) => this.data[store].delete(k)); }
}

export async function openStore() {
  try {
    if (!('indexedDB' in globalThis) || !globalThis.indexedDB) throw new Error('IndexedDB indisponível');
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('plans')) d.createObjectStore('plans', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('images')) d.createObjectStore('images');
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error('Banco bloqueado por outra aba'));
    });
    db.onversionchange = () => db.close();
    const store = new IdbStore(db);
    await store.get('meta', '__probe__'); // detecta ambientes que abrem mas não permitem transações
    return store;
  } catch (err) {
    console.warn('[lab4] usando armazenamento em memória:', err);
    return new MemoryStore();
  }
}
