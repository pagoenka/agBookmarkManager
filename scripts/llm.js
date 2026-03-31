// llm.js
// Abstraction for LLM execution via Offscreen Document

export async function generateEmbedding(bookmark) {
  const { provider, endpoint } = await getSettings();
  
  if (provider === 'local' && endpoint) {
     return generateLocalAPIEmbedding(bookmark, endpoint);
  } else {
     return generateBrowserEmbedding(bookmark);
  }
}

async function getSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get(['aiProvider', 'aiEndpoint'], res => {
      resolve({
        provider: res.aiProvider || 'browser',
        endpoint: res.aiEndpoint || 'http://127.0.0.1:11434/v1/embeddings' // Default OpenAI-compatible endpoint
      });
    });
  });
}

let creating; // Promise state
async function setupOffscreenDocument(path) {
  // Check if offscreen exists, if so return
  let exists = false;
  if (chrome.runtime.getContexts) {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL(path)]
    });
    exists = existingContexts.length > 0;
  } else {
    exists = await chrome.offscreen.hasDocument();
  }

  if (exists) return;

  // If we are already creating it, await the promise
  if (creating) {
    await creating;
  } else {
    creating = chrome.offscreen.createDocument({
      url: path,
      reasons: [chrome.offscreen.Reason.WORKERS || 'WORKERS'],
      justification: 'Run heavy Transformers.js machine learning tasks off-thread'
    });
    await creating;
    creating = null;
  }
}

async function generateBrowserEmbedding(bookmark) {
  const text = `${bookmark.title || ''} - ${bookmark.url || ''}`;
  
  try {
    await setupOffscreenDocument('offscreen/offscreen.html');
    
    // Send message to the offscreen document
    // Adding retry logic in case the offscreen document took a second to initialize its listeners
    for (let i = 0; i < 3; i++) {
        try {
            const response = await chrome.runtime.sendMessage({
              target: 'offscreen',
              action: 'generateBrowserEmbedding',
              text
            });
            
            if (response && response.success) {
              return { embedding: response.embedding, text: response.text };
            } else if (response && response.error) {
              throw new Error(response.error);
            }
        } catch (err) {
            if (i === 2) throw err; // throw on last attempt
            await new Promise(r => setTimeout(r, 200)); // Wait and retry
        }
    }
  } catch(e) {
    console.error("Browser Embedding Error", e);
    throw new Error(e.message || "Failed to generate embedding offline.");
  }
}

async function generateLocalAPIEmbedding(bookmark, endpoint) {
   // User requested using standard OpenAI format
   const text = `${bookmark.title || ''} - ${bookmark.url || ''}`;
   try {
     const res = await fetch(endpoint, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
          input: text,
          model: 'nomic-embed-text' // generic fallback
       })
     });
     
     if (!res.ok) {
       throw new Error(`Endpoint returned status: ${res.status}`);
     }
     
     const data = await res.json();
     if (data && data.data && data.data[0]) {
        return { embedding: data.data[0].embedding, text };
     }
     throw new Error("Invalid response format from Local API");
   } catch (e) {
     console.error("Local API Error", e);
     return null;
   }
}
