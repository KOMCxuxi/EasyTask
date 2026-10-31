// db.js — IndexedDB 存取层
// 结构：
//   tasks   任务（key: id，索引 startAt / done）
//   notes   笔记（key: id，索引 taskId / updatedAt）taskId 为空 = 独立备忘录
//   files   附件元资料（key: id，索引 taskId）
//   blobs   附件内容（out-of-line key = 附件 id）
//   meta    设定与杂项（key: key）

const DB_NAME = 'pixel-notes';
const DB_VERSION = 1;

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const idb = event.target.result;
      if (!idb.objectStoreNames.contains('tasks')) {
        const s = idb.createObjectStore('tasks', { keyPath: 'id' });
        s.createIndex('startAt', 'startAt');
        s.createIndex('done', 'done');
      }
      if (!idb.objectStoreNames.contains('notes')) {
        const s = idb.createObjectStore('notes', { keyPath: 'id' });
        s.createIndex('taskId', 'taskId');
        s.createIndex('updatedAt', 'updatedAt');
      }
      if (!idb.objectStoreNames.contains('files')) {
        const s = idb.createObjectStore('files', { keyPath: 'id' });
        s.createIndex('taskId', 'taskId');
      }
      if (!idb.objectStoreNames.contains('blobs')) {
        idb.createObjectStore('blobs');
      }
      if (!idb.objectStoreNames.contains('meta')) {
        idb.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB 被其他分页占用，请关闭其他分页后重试'));
  });
  return dbPromise;
}

function request(storeName, mode, action) {
  return openDB().then((idb) => new Promise((resolve, reject) => {
    let tx;
    try {
      tx = idb.transaction(storeName, mode);
    } catch (err) {
      reject(err);
      return;
    }
    let req;
    try {
      req = action(tx.objectStore(storeName));
    } catch (err) {
      reject(err);
      return;
    }
    if (req && typeof req.onsuccess !== 'undefined') {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } else {
      tx.oncomplete = () => resolve(undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
    }
  }));
}

function multi(stores, mode, action) {
  return openDB().then((idb) => new Promise((resolve, reject) => {
    let tx;
    try {
      tx = idb.transaction(stores, mode);
    } catch (err) {
      reject(err);
      return;
    }
    try {
      action(tx);
    } catch (err) {
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
  }));
}

export const db = {
  init() {
    return openDB();
  },

  // ---- 任务 ----
  tasksAll() {
    return request('tasks', 'readonly', (s) => s.getAll());
  },
  taskPut(task) {
    return request('tasks', 'readwrite', (s) => s.put(task));
  },
  taskDel(id) {
    return request('tasks', 'readwrite', (s) => s.delete(id));
  },

  // ---- 笔记 ----
  notesAll() {
    return request('notes', 'readonly', (s) => s.getAll());
  },
  notePut(note) {
    return request('notes', 'readwrite', (s) => s.put(note));
  },
  noteDel(id) {
    return request('notes', 'readwrite', (s) => s.delete(id));
  },

  // ---- 附件 ----
  filesAll() {
    return request('files', 'readonly', (s) => s.getAll());
  },
  filePut(meta) {
    return request('files', 'readwrite', (s) => s.put(meta));
  },
  fileDel(id) {
    return multi(['files', 'blobs'], 'readwrite', (tx) => {
      tx.objectStore('files').delete(id);
      tx.objectStore('blobs').delete(id);
    });
  },
  blobGet(id) {
    return request('blobs', 'readonly', (s) => s.get(id));
  },
  blobPut(id, blob) {
    return request('blobs', 'readwrite', (s) => s.put(blob, id));
  },

  // ---- 设定 ----
  metaGet(key) {
    return request('meta', 'readonly', (s) => s.get(key)).then((row) => (row ? row.value : undefined));
  },
  metaSet(key, value) {
    return request('meta', 'readwrite', (s) => s.put({ key, value }));
  },

  // ---- 批量 ----
  clearAll() {
    const stores = ['tasks', 'notes', 'files', 'blobs', 'meta'];
    return multi(stores, 'readwrite', (tx) => {
      stores.forEach((name) => tx.objectStore(name).clear());
    });
  },
  importAll(payload) {
    return multi(['tasks', 'notes', 'files', 'blobs', 'meta'], 'readwrite', (tx) => {
      const tasks = tx.objectStore('tasks');
      const notes = tx.objectStore('notes');
      const files = tx.objectStore('files');
      const blobs = tx.objectStore('blobs');
      (payload.tasks || []).forEach((t) => tasks.put(t));
      (payload.notes || []).forEach((n) => notes.put(n));
      (payload.files || []).forEach((row) => {
        if (!row || !row.meta) return;
        files.put(row.meta);
        if (row.blob) blobs.put(row.blob, row.meta.id);
      });
      tx.objectStore('meta').put({ key: 'seeded', value: true });
    });
  },
};
