// background.js

import { getEmbedding, deleteEmbedding } from '../scripts/db.js';
import { processQueue, addToQueue, setPauseState, getQueueState, removeFromQueue } from '../scripts/queue.js';
import { flattenBookmarks } from '../scripts/utils.js';
import { deleteBookmarkMeta } from '../scripts/storage.js';
import { testEndpoint } from '../scripts/llm.js';
import { ensureOffscreenDocument } from '../scripts/offscreen-manager.js';
import { startClustering } from '../scripts/clustering.js';

console.log("agBookmarkManager: Background Service Worker Started.");

// Listener for extension installation or update
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("Extension installed/updated. Initializing background tasks...");
  
  // Set default settings if they don't exist
  if (details.reason === 'install') {
    chrome.storage.sync.set({
      aiProvider: 'browser',
      aiEndpoint: 'http://127.0.0.1:11434/v1/embeddings',
      aiModelEmbed: 'nomic-embed-text',
      aiModelChat: 'llama3',
      clusteringEnabled: false,
      clusteringStrength: 50
    });
    
    chrome.storage.local.set({
      isAutoIndexEnabled: true,
      brokenLinks: {} // id -> { status, lastCheck }
    });
    
    console.log("Default AI settings initialized.");
    chrome.tabs.create({ url: 'options/options.html?onboarding=true' });
  }

  // Set up periodic health check (e.g., every 24 hours)
  chrome.alarms.create('linkHealthCheck', { periodInMinutes: 1440 });
  
  await queueAllUnprocessedBookmarks();
});

// Trigger health check on alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'linkHealthCheck') {
    checkAllLinkHealth();
  }
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

chrome.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
  console.log(`Bookmark ${id} removed. Cleaning up...`);
  removeFromQueue(id);
  await deleteEmbedding(id);
  await deleteBookmarkMeta(id);
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
  await ensureOffscreenDocument();
  chrome.storage.sync.get(['aiProvider'], async (res) => {
    const provider = res.aiProvider || 'browser';
    
    chrome.bookmarks.getTree(async (tree) => {
      const allBookmarks = flattenBookmarks(tree);
      console.log(`Searching through ${allBookmarks.length} total bookmarks.`);
      
      const toProcess = [];
      for (const bm of allBookmarks) {
        const existing = await getEmbedding(bm.id);
        
        // 1. If it's completely missing
        const isMissing = !existing;
        
        // 2. If it has an embedding but is missing intelligence (summary)
        // We backfill for any provider now that browser mode has a basic fallback
        const isMissingInsights = existing && !existing.summary;
        
        if ((isMissing || isMissingInsights) && bm.url) {
          toProcess.push(bm);
        }
      }
      
      console.log(`Queuing ${toProcess.length} bookmarks for processing (Insights missing: ${toProcess.filter(b => b.id).length - toProcess.filter(b => !b.id).length}).`);
      // Add to queue specifically
      toProcess.forEach(bm => addToQueue(bm));
    });
  });
}

async function checkAllLinkHealth() {
  console.log("Starting Link Health Check...");
  const { brokenLinks = {} } = await chrome.storage.local.get(['brokenLinks']);
  
  chrome.bookmarks.getTree(async (tree) => {
    const allBookmarks = flattenBookmarks(tree);
    const newBrokenLinks = { ...brokenLinks };
    
    // Process in small batches to avoid network congestion
    const batchSize = 10;
    for (let i = 0; i < allBookmarks.length; i += batchSize) {
      const batch = allBookmarks.slice(i, i + batchSize);
      await Promise.all(batch.map(async (bm) => {
        try {
          const isOk = await checkUrlHealth(bm.url);
          if (!isOk) {
            newBrokenLinks[bm.id] = { status: 'broken', lastCheck: Date.now() };
          } else {
            delete newBrokenLinks[bm.id];
          }
        } catch (err) {
            // Probably timeout or network err
            newBrokenLinks[bm.id] = { status: 'unreachable', lastCheck: Date.now() };
        }
      }));
      // Polite delay between batches
      await new Promise(r => setTimeout(r, 2000));
    }
    
    await chrome.storage.local.set({ brokenLinks: newBrokenLinks });
    console.log(`Link Health Check Complete. ${Object.keys(newBrokenLinks).length} broken links found.`);
  });
}

/**
 * Perform a lightweight HEAD request to check if a URL is still alive
 */
async function checkUrlHealth(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
    
    const response = await fetch(url, { 
      method: 'HEAD', 
      signal: controller.signal,
      mode: 'no-cors' // Allow checking across origins
    });
    
    clearTimeout(timeoutId);
    // If it's no-cors, we can't see status, but if it didn't throw it's probably okay
    return true; 
  } catch (err) {
    return false;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getStatus' || request.action === 'getProgress') {
    // Allows Options page to ask for queue status
    sendResponse(getQueueState());
  } else if (request.action === 'startProcessing') {
    queueAllUnprocessedBookmarks();
    sendResponse({ started: true });
  } else if (request.action === 'checkIfBookmark') {
    // Check if a URL is a bookmark by searching for it
    chrome.bookmarks.search({ url: request.url }, (results) => {
      if (results && results.length > 0) {
        sendResponse({ isBookmark: true, id: results[0].id });
      } else {
        sendResponse({ isBookmark: false });
      }
    });
    return true; // async
  } else if (request.action === 'updateBookmarkContent') {
    // Content script found content, add it to process specifically
    console.log(`Received active content for bookmark ${request.id}`);
    addToQueue({
      id: request.id,
      title: request.title,
      url: request.url || sender.tab.url,
      content: request.content
    });
    sendResponse({ success: true });
  } else if (request.action === 'testConnection') {
    const { endpoint, apiKey, modelEmbed, modelChat } = request;
    testEndpoint(endpoint, apiKey, modelEmbed, modelChat)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async
  } else if (request.action === 'pauseIndexing') {
    setPauseState(true);
    sendResponse({ success: true });
  } else if (request.action === 'resumeIndexing') {
    setPauseState(false);
    sendResponse({ success: true });
  } else if (request.action === 'runHealthCheck') {
    checkAllLinkHealth();
    sendResponse({ success: true });
  } else if (request.action === 'startClustering') {
    startClustering();
    sendResponse({ started: true });
  }
});
