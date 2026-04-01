// extractor.js
// Background utility for fetching and preparing content for indexing
import { ensureOffscreenDocument } from './offscreen-manager.js';

/**
 * Fetches the HTML content of a URL
 * @param {string} url 
 * @returns {Promise<string|null>}
 */
export async function fetchPageContent(url) {
  try {
    const response = await fetch(url, {
       // Best-effort to look like a browser to avoid some simple blocks
       headers: {
         'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
       }
    });
    
    if (!response.ok) {
      throw new Error(`Fetch failed with status: ${response.status}`);
    }
    
    return await response.text();
  } catch (err) {
    console.error(`Extractor: Failed to fetch ${url}`, err);
    return null;
  }
}

/**
 * Sends HTML to offscreen document for parsing and cleaning
 * @param {string} html 
 * @returns {Promise<{text: string, title: string, description: string}>}
 */
export async function parseHTMLOffline(html) {
  try {
    await ensureOffscreenDocument();
    const response = await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'parseHTML',
      html: html
    });
    
    if (response && response.success) {
      return {
        text: response.text,
        title: response.title,
        description: response.description
      };
    }
    throw new Error(response?.error || 'Unknown parsing error');
  } catch (err) {
    console.error("Extractor: Parsing error", err);
    return { text: '', title: '', description: '' };
  }
}
