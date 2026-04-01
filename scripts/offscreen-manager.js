/**
 * Helper to ensure the offscreen document is open for tasks like DOM parsing or browser-local AI.
 */
let creating; // A global promise to avoid race conditions when creating the document

export async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL('offscreen/offscreen.html');

  // Check if it already exists
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });

  if (contexts.length > 0) {
    return;
  }

  // If already creating, wait for it
  if (creating) {
    await creating;
    return;
  }

  // Create document
  creating = chrome.offscreen.createDocument({
    url: offscreenUrl,
    reasons: ['DOM_PARSER', 'WORKERS'],
    justification: 'To parse bookmark HTML and generate browser-native embeddings offline.'
  });

  try {
    await creating;
  } catch (err) {
    // Standard error if document already exists or is being created
    if (err.message.includes('Only a single offscreen document may be created')) {
        return;
    }
    throw err;
  } finally {
    creating = null;
  }
}

/**
 * Closes the offscreen document when no longer needed (optional optimization)
 */
export async function closeOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL('offscreen/offscreen.html');
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });

  if (contexts.length > 0) {
    await chrome.offscreen.closeDocument();
  }
}
