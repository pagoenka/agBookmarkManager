// queue.js
import { generateEmbedding } from './llm.js';
import { saveEmbedding, getEmbedding } from './db.js';

let queue = [];
let processing = false;

export function addToQueue(bookmark) {
  queue.push(bookmark);
  if (!processing) processQueue();
}

export async function processQueue() {
  if (processing || queue.length === 0) return;
  processing = true;
  console.log(`Starting queue. ${queue.length} items remaining.`);

  while(queue.length > 0) {
    const bm = queue.shift();
    try {
      // Check if already processed just in case
      const existing = await getEmbedding(bm.id);
      if (!existing) {
        console.log(`Processing embedding for bookmark: ${bm.id} - ${bm.title}`);
        const result = await generateEmbedding(bm);
        if (result && result.embedding) {
          await saveEmbedding(bm.id, {
            embedding: result.embedding,
            text: result.text,
            title: bm.title,
            url: bm.url
          });
        }
      }
    } catch(err) {
      console.error("Error processing bookmark", bm.id, err);
    }
    
    // Broadcast status to UI
    chrome.runtime.sendMessage({ action: 'indexProgress', remaining: queue.length }).catch(() => {});
    
    // Small delay to prevent blocking
    await new Promise(r => setTimeout(r, 100));
  }
  
  processing = false;
  console.log("Queue processing complete.");
  chrome.runtime.sendMessage({ action: 'indexComplete' }).catch(() => {});
}
