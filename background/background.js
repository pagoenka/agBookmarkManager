// background.js

import { getEmbedding } from '../scripts/db.js';
import { processQueue, addToQueue } from '../scripts/queue.js';
import { flattenBookmarks } from '../scripts/utils.js';

console.log("agBookmarkManager: Background Service Worker Started.");

// Listener for extension installation or update
chrome.runtime.onInstalled.addListener(async () => {
  console.log("Extension installed/updated. Initializing background tasks...");
  await queueAllUnprocessedBookmarks();
});

// Also trigger on startup
chrome.runtime.onStartup.addListener(async () => {
  console.log("Extension started. Checking for unprocessed bookmarks...");
  await queueAllUnprocessedBookmarks();
});

// Listeners for bookmark changes
chrome.bookmarks.onCreated.addListener((id, bookmark) => {
  if (bookmark.url) {
    addToQueue(bookmark);
  }
});

chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
  // If title or URL changed, we should probably re-process
  if (changeInfo.title || changeInfo.url) {
    chrome.bookmarks.get(id, (results) => {
      if (results && results[0] && results[0].url) {
        addToQueue(results[0]);
      }
    });
  }
});

// Main function to find bookmarks without embeddings and queue them
async function queueAllUnprocessedBookmarks() {
  chrome.bookmarks.getTree(async (tree) => {
    const allBookmarks = flattenBookmarks(tree);
    console.log(`Found ${allBookmarks.length} total bookmarks.`);
    
    let queued = 0;
    for (const bm of allBookmarks) {
      // Check if we already have an embedding
      const existing = await getEmbedding(bm.id);
      if (!existing && bm.url) {
        addToQueue(bm);
        queued++;
      }
    }
    
    console.log(`Queued ${queued} bookmarks for processing.`);
    processQueue();
  });
}

// Ensure the queue processes periodically or handles UI messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getStatus') {
    // Allows Options page to ask for queue status
    sendResponse({ status: 'ok' });
  } else if (request.action === 'startProcessing') {
    queueAllUnprocessedBookmarks();
    sendResponse({ started: true });
  }
});
