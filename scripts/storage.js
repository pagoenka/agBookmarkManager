/**
 * Storage wrapper for agBookmarkManager metadata (Tags, Intent Tags)
 * Keys are formatted as `bm_${bookmarkId}`
 * Form: { tags: ["string"], intent: "string|null" }
 */

const getMetadataKey = (id) => `bm_${id}`;

/**
 * Fetch metadata for a specific bookmark ID
 * @param {string} bookmarkId 
 * @returns {Promise<{tags: string[], intent: string|null}>}
 */
export async function getBookmarkMeta(bookmarkId) {
  const key = getMetadataKey(bookmarkId);
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve(result[key] || { tags: [], intent: null });
    });
  });
}

/**
 * Fetch metadata for an array of bookmark IDs
 * @param {string[]} bookmarkIds 
 * @returns {Promise<Object>} Map of id -> meta
 */
export async function getBookmarksMeta(bookmarkIds) {
  const keys = bookmarkIds.map(getMetadataKey);
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      const metaMap = {};
      bookmarkIds.forEach(id => {
        metaMap[id] = result[getMetadataKey(id)] || { tags: [], intent: null };
      });
      resolve(metaMap);
    });
  });
}

/**
 * Save metadata for a specific bookmark ID
 * @param {string} bookmarkId 
 * @param {{tags: string[], intent: string|null}} meta 
 */
export async function saveBookmarkMeta(bookmarkId, meta) {
  const key = getMetadataKey(bookmarkId);
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: meta }, () => {
      resolve();
    });
  });
}

/**
 * Find all bookmark IDs that share a specific intent tag
 * @param {string} intent 
 * @returns {Promise<string[]>} Array of bookmark IDs
 */
export async function getBookmarksByIntent(intent) {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (items) => {
      const matchingIds = [];
      for (const [key, meta] of Object.entries(items)) {
        if (key.startsWith('bm_') && meta.intent === intent) {
          const id = key.replace('bm_', '');
          matchingIds.push(id);
        }
      }
      resolve(matchingIds);
    });
  });
}

/**
 * Find all bookmark IDs that contain a specific tag
 * @param {string} tag 
 * @returns {Promise<string[]>}
 */
export async function getBookmarksByTag(tag) {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (items) => {
      const matchingIds = [];
      for (const [key, meta] of Object.entries(items)) {
        if (key.startsWith('bm_') && meta.tags && meta.tags.includes(tag)) {
          const id = key.replace('bm_', '');
          matchingIds.push(id);
        }
      }
      resolve(matchingIds);
    });
  });
}
