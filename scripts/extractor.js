// extractor.js
// Background utility for fetching and preparing content for indexing
import { ensureOffscreenDocument } from './offscreen-manager.js';

const MAX_HTML_SIZE = 2 * 1024 * 1024; // 2MB limit for Chrome sendMessage

/**
 * Fetches the HTML content of a URL
 * @param {string} url 
 * @returns {Promise<string|null>}
 */
export async function fetchPageContent(url) {
  if (!url || url.startsWith('chrome://') || url.startsWith('about:')) {
    console.info(`Extractor: Skipping internal/system URL: ${url}`);
    return null;
  }
  try {
    const response = await fetch(url, {
       // Best-effort to look like a browser to avoid some simple blocks
       headers: {
         'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
       }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`Extractor: Broken link (404) for ${url}. Skipping.`);
      } else {
        throw new Error(`Fetch failed with status: ${response.status}`);
      }
      return null;
    }
    
    const text = await response.text();
    return text;
  } catch (err) {
    if (err.name === 'TypeError' && (err.message === 'Failed to fetch' || err.message.includes('fetch'))) {
      // Catch-all for CORS, Connection Refused, Offline, DNS failure, etc.
      console.warn(`Extractor: Could not reach content at ${url}. It may be private, internal, or blocking automated access. (TypeError: Failed to fetch)`);
    } else {
      // Log genuine unexpected errors as actual errors
      console.error(`Extractor: Unexpected error fetching ${url}`, err);
    }
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
    
    let safeHtml = html;
    if (html && html.length > MAX_HTML_SIZE) {
      console.warn(`Extractor: HTML too large (${(html.length / 1024 / 1024).toFixed(2)}MB). Truncating to 2MB.`);
      safeHtml = html.substring(0, MAX_HTML_SIZE);
    }

    const response = await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'parseHTML',
      html: safeHtml
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
