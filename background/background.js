// background.js

import { getEmbedding, deleteEmbedding } from '../scripts/db.js';
import { processQueue, addToQueue, setPauseState, getQueueState, removeFromQueue } from '../scripts/queue.js';
import { flattenBookmarks } from '../scripts/utils.js';
import { deleteBookmarkMeta } from '../scripts/storage.js';
import { testEndpoint } from '../scripts/llm.js';
import { ensureOffscreenDocument } from '../scripts/offscreen-manager.js';

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
      aiModelChat: 'llama3'
    });
    
    chrome.storage.local.set({
      isAutoIndexEnabled: true
    });
    
    console.log("Default AI settings initialized (AI Mode: Enabled by default).");
    
    // NEW: Onboard the user by opening the options page first
    chrome.tabs.create({ url: 'options/options.html?onboarding=true' });
  } else {
    // Only auto-index on updates/startup, not on clean install (options page will handle it)
    await queueAllUnprocessedBookmarks();
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
  }
});
