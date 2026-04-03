// queue.js
import { generateEmbedding, generateSummary, suggestTags } from './llm.js';
import { saveEmbedding, getEmbedding } from './db.js';
import { fetchPageContent, parseHTMLOffline } from './extractor.js';

let queue = [];
let processing = false;
let isPaused = false;
let totalItems = 0;
let processedItems = 0;

// Initialize isPaused from storage on load
chrome.storage.local.get(['isIndexPaused'], (res) => {
  isPaused = res.isIndexPaused || false;
});

export function setPauseState(paused) {
  isPaused = paused;
  if (!isPaused && queue.length > 0 && !processing) {
    processQueue();
  }
}

export function getQueueState() {
  return {
    queueLength: queue.length,
    totalItems,
    processedItems,
    isPaused,
    processing
  };
}

export function removeFromQueue(id) {
  const initialLength = queue.length;
  queue = queue.filter(bm => bm.id !== id);
  if (queue.length < initialLength) {
    if (totalItems > 0) totalItems--;
    console.log(`Removed bookmark ${id} from queue.`);
  }
}

export function addToQueue(bookmark) {
  // If the bookmark already exists in the queue (e.g. from multiple events), 
  // update its content if the new one has it. 
  const existingIdx = queue.findIndex(b => b.id === bookmark.id);
  if (existingIdx !== -1) {
    queue[existingIdx] = { ...queue[existingIdx], ...bookmark };
  } else {
    queue.push(bookmark);
  }
  
  // Update total tracker in a simple way
  if (totalItems < queue.length) totalItems = queue.length;

  if (!processing && !isPaused) {
    processedItems = 0;
    processQueue();
  }
}

export async function processQueue() {
  if (processing || queue.length === 0 || isPaused) return;
  processing = true;
  if (totalItems < queue.length) totalItems = queue.length;
  console.log(`Starting queue. ${queue.length} items remaining. Total batch: ${totalItems}`);

  while(queue.length > 0) {
    if (isPaused) {
      console.log("Indexing paused. Stopping queue processing.");
      break;
    }
    const bm = queue.shift();
    try {
      // 1. Check if we have an embedding already
      const existing = await getEmbedding(bm.id);
      
      // If we don't have content yet, try to fetch it
      if (!bm.content && bm.url) {
        console.log(`Fetching remote content for: ${bm.url}`);
        const html = await fetchPageContent(bm.url);
        if (html) {
          const parsed = await parseHTMLOffline(html);
          bm.content = parsed.text;
        }
      }

      console.log(`Processing intelligence for bookmark: ${bm.id} - ${bm.title}`);
      
      // 2. Generate content-aware embedding
      const result = await generateEmbedding(bm);
      
      if (result && result.embedding) {
        // 3. Optional Intelligence: Summary & Tags (best effort)
        const summary = await generateSummary(bm);
        const suggestedTags = await suggestTags(bm);

        // SAFE MERGE: Only overwrite if we got a valid result, otherwise keep the old one
        // This prevents "disappearing" summaries if Ollama is busy/unreachable
        const finalSummary = summary || (existing ? existing.summary : null);
        const finalTags = (suggestedTags && suggestedTags.length > 0) 
          ? suggestedTags 
          : (existing ? (existing.suggestedTags || []) : []);

        await saveEmbedding(bm.id, {
          embedding: result.embedding,
          text: result.text,
          title: bm.title,
          url: bm.url,
          summary: finalSummary,
          suggestedTags: finalTags,
          contentCache: bm.content // Store extracted text for reference
        });
      }
    } catch(err) {
      console.error("Error processing bookmark", bm.id, err);
    }
    
    processedItems++;
    // Broadcast status to UI
    chrome.runtime.sendMessage({ 
      action: 'indexProgress', 
      remaining: queue.length,
      total: totalItems,
      processed: processedItems
    }).catch(() => {});
    
    // Polite Indexing: Add a randomized delay (jitter) to mimic human-like timing
    // Range: 1s to 2.5s (1000ms base + up to 1500ms random)
    const jitter = Math.floor(Math.random() * 1500) + 1000;
    await new Promise(r => setTimeout(r, jitter));
  }
  
  processing = false;
  
  // Only clear stats and send complete message if the queue is actually empty
  if (queue.length === 0) {
    totalItems = 0;
    processedItems = 0;
    console.log("Queue processing complete.");
    chrome.runtime.sendMessage({ action: 'indexComplete' }).catch(() => {});
  }
}
