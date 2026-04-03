/**
 * Wrapper for IndexedDB to store Bookmark text, embeddings, and metadata.
 * Designed to store large embedding arrays without hitting chrome.storage limits.
 */

const DB_NAME = 'agBookmarkManagerDB';
const STORE_NAME = 'embeddings';
const CLUSTERS_STORE_NAME = 'clusters';
const DB_VERSION = 2;

let _db = null;

async function initDB() {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => reject(event.target.error);

    request.onsuccess = (event) => {
      _db = event.target.result;
      resolve(_db);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(CLUSTERS_STORE_NAME)) {
        db.createObjectStore(CLUSTERS_STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

/**
 * Save computed clusters to DB
 * @param {Array} clusters - Array of { id, name, bookmarkIds }
 */
export async function saveClusterData(clusters) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CLUSTERS_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(CLUSTERS_STORE_NAME);
    
    // Clear existing clusters first
    store.clear();
    
    let count = 0;
    if (clusters.length === 0) resolve();
    
    clusters.forEach(cluster => {
      const request = store.put(cluster);
      request.onsuccess = () => {
        count++;
        if (count === clusters.length) resolve();
      };
      request.onerror = (e) => reject(e.target.error);
    });
  });
}

/**
 * Get all computed clusters
 */
export async function getClusterData() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CLUSTERS_STORE_NAME], 'readonly');
    const store = transaction.objectStore(CLUSTERS_STORE_NAME);
    const request = store.getAll();

    request.onsuccess = (event) => resolve(event.target.result || []);
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Save an embedding and plain text for a bookmark
 * @param {string} id - Bookmark ID
 * @param {object} data - { embedding: number[], text: string, title: string, url: string, summary?: string, suggestedTags?: string[] }
 */
export async function saveEmbedding(id, data) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put({ id, ...data });

    request.onsuccess = () => resolve();
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Get embedding and data for a specific bookmark
 * @param {string} id 
 * @returns {Promise<object|null>}
 */
export async function getEmbedding(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = (event) => resolve(event.target.result || null);
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Get all stored embeddings
 * @returns {Promise<object[]>} Array of { id, embedding, text, title, url }
 */
export async function getAllEmbeddings() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = (event) => resolve(event.target.result || []);
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Delete data for a specific bookmark
 * @param {string} id 
 */
export async function deleteEmbedding(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Clear all embeddings
 */
export async function clearAllEmbeddings() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = (event) => reject(event.target.error);
  });
}
