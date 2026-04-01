import { pipeline, env } from '../scripts/vendor/transformers.min.js';

env.allowLocalModels = false;
env.useBrowserCache = true;

// Prevent it from spawning nested Web Workers which get blocked by CSP (importScripts on blob urls)
env.backends.onnx.wasm.numThreads = 1; 
// Point it to our local offline WASM binaries
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('scripts/vendor/');

let extractorInstance = null;
let loadingPromise = null;

async function getExtractor() {
  if (extractorInstance) return extractorInstance;
  if (loadingPromise) return loadingPromise;
  
  loadingPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
     quantized: true
  }).then(instance => {
     extractorInstance = instance;
     return instance;
  });
  
  return loadingPromise;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.target !== 'offscreen') return false;

  if (request.action === 'generateBrowserEmbedding') {
    getExtractor().then(async (extractor) => {
      try {
        const output = await extractor(request.text, { pooling: 'mean', normalize: true });
        const embedding = Array.from(output.data);
        sendResponse({ success: true, embedding, text: request.text });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    }).catch(e => {
        sendResponse({ success: false, error: e.message });
    });

    return true; // Keep message channel open for async response
  }

  if (request.action === 'parseHTML') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(request.html, 'text/html');
      
      const title = doc.title || '';
      const metaDescription = doc.querySelector('meta[name="description"]')?.getAttribute('content') || '';
      
      // Clean up junk
      const selectorsToRemove = ['script', 'style', 'noscript', 'iframe', 'canvas', 'svg', 'nav', 'header', 'footer', 'aside'];
      selectorsToRemove.forEach(s => {
        doc.querySelectorAll(s).forEach(el => el.remove());
      });
      
      const text = doc.body.innerText.replace(/\s+/g, ' ').trim();
      
      sendResponse({ 
        success: true, 
        text, 
        title, 
        description: metaDescription 
      });
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
    return true;
  }
});
