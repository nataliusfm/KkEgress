// Offline temporary storage: queues report submissions in IndexedDB and
// auto-syncs them when the connection returns.
import { api } from './api.js';
import { toast } from './util.js';

const DB_NAME = 'sedts-offline';
const STORE = 'pending-reports';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const out = fn(store);
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
  });
}

export async function queueReport({ method, path, fields, photoBlob }) {
  await tx('readwrite', (s) => s.add({ method, path, fields, photoBlob, queuedAt: Date.now() }));
  toast('Saved offline — will sync when back online.', 'warn');
}

export async function pendingCount() {
  return tx('readonly', (s) => s.count());
}

async function allPending() {
  return tx('readonly', (s) => new Promise((res) => {
    const items = []; const cur = s.openCursor();
    cur.onsuccess = () => { const c = cur.result; if (c) { items.push({ key: c.key, ...c.value }); c.continue(); } else res(items); };
  }));
}

async function remove(key) {
  return tx('readwrite', (s) => s.delete(key));
}

let syncing = false;
export async function syncPending() {
  if (syncing || !navigator.onLine) return;
  syncing = true;
  try {
    const items = await allPending();
    for (const item of items) {
      try {
        const form = new FormData();
        for (const [k, v] of Object.entries(item.fields)) form.append(k, v);
        if (item.photoBlob) form.append('photo', item.photoBlob, 'team.jpg');
        if (item.method === 'PUT') await api.putForm(item.path, form);
        else await api.postForm(item.path, form);
        await remove(item.key);
      } catch (err) {
        // Conflict (e.g. duplicate already submitted) — drop it; other errors stop the run.
        if (/already submitted/i.test(err.message)) await remove(item.key);
        else break;
      }
    }
    const left = await pendingCount();
    if (items.length && left === 0) toast('Offline reports synced.', 'success');
    window.dispatchEvent(new CustomEvent('offline:synced'));
  } finally {
    syncing = false;
  }
}

window.addEventListener('online', syncPending);
