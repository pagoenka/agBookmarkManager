// llm.js
// Abstraction for LLM execution via Offscreen Document
import { ensureOffscreenDocument } from './offscreen-manager.js';

export async function generateEmbedding(bookmark) {
  const { provider, endpoint, apiKey, modelEmbed } = await getSettings();
  
  // Use extracted content if available for richer embedding, otherwise fallback to title/url
  const text = bookmark.content 
    ? `${bookmark.title || ''}: ${bookmark.content.substring(0, 2000)}`
    : `${bookmark.title || ''} - ${bookmark.url || ''}`;

  if (provider === 'local' && endpoint) {
     return generateLocalAPIEmbedding(text, endpoint, apiKey, modelEmbed || 'nomic-embed-text');
  } else {
     return generateBrowserEmbedding(text);
  }
}

/**
 * Generates a summary: AI-powered in Local Mode, metadata or sentence extraction in Browser Mode.
 */
export async function generateSummary(bookmark) {
  const { provider, endpoint, apiKey, modelChat } = await getSettings();
  if (!bookmark.content) return null;

  // Browser Mode / Fallback: Use Meta Description or first few sentences
  if (provider === 'browser') {
    if (bookmark.description && bookmark.description.length > 20) {
      return bookmark.description.trim();
    }
    // Extract first ~160 chars as basic summary
    return bookmark.content.substring(0, 160).trim() + (bookmark.content.length > 160 ? "..." : "");
  }

  // Local/Ollama Mode
  try {
    const prompt = `Summarize this page content in 1-2 concise sentences for a bookmark manager. Focus on the main topic or utility:\n\nContent: ${bookmark.content.substring(0, 1500)}`;
    
    const response = await callLocalChatAPI(prompt, endpoint, apiKey, modelChat || 'llama3');
    return response ? response.trim() : null;
  } catch (err) {
    console.error("LLM: Summary generation failed", err);
    // Silent fallback to basic summary on error to ensure *something* is stored
    if (bookmark.description) return bookmark.description.trim();
    return bookmark.content.substring(0, 160).trim() + (bookmark.content.length > 160 ? "..." : "");
  }
}

/**
 * Suggests 3-5 tags based on page content
 */
export async function suggestTags(bookmark) {
  const { provider, endpoint, apiKey, modelChat } = await getSettings();
  if (!bookmark.content || provider !== 'local') return [];

  try {
    const prompt = `Based on this page content, suggest 3-5 short, one-word tags (no hashtags). Respond ONLY with a JSON array of strings.\n\nContent: ${bookmark.content.substring(0, 1500)}`;
    
    const response = await callLocalChatAPI(prompt, endpoint, apiKey, modelChat || 'llama3');
    // Try to extract JSON if LLM added chatter
    const jsonMatch = response.match(/\[.*\]/s);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return [];
  } catch (err) {
    console.error("LLM: Tag suggestion failed", err);
    return [];
  }
}

async function getSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get(['aiProvider', 'aiEndpoint', 'aiApiKey', 'aiModelEmbed', 'aiModelChat'], res => {
      resolve({
        provider: res.aiProvider || 'browser',
        endpoint: res.aiEndpoint || 'http://127.0.0.1:11434/v1/embeddings',
        apiKey: res.aiApiKey || '',
        modelEmbed: res.aiModelEmbed || 'nomic-embed-text',
        modelChat: res.aiModelChat || 'llama3'
      });
    });
  });
}

async function generateBrowserEmbedding(text) {
  try {
    await ensureOffscreenDocument();
    
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

async function generateLocalAPIEmbedding(text, endpoint, apiKey, model) {
   try {
     const headers = { 'Content-Type': 'application/json' };
     if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

     const res = await fetch(endpoint, {
       method: 'POST',
       headers: headers,
       body: JSON.stringify({
          input: text,
          model: model
       })
     });
     
     if (!res.ok) {
       throw new Error(`Endpoint returned status: ${res.status}`);
     }
     
     const data = await res.json();
     if (data && data.data && data.data[0]) {
        return { embedding: data.data[0].embedding, text };
     }
     // Ollama direct format fallback
     if (data && data.embedding) {
        return { embedding: data.embedding, text };
     }
     throw new Error("Invalid response format from Local API");
   } catch (e) {
     console.error("Local API Embedding Error", e);
     throw e;
   }
}

/**
 * Generic helper for Chat/Completion tasks specifically for summaries/tags
 */
async function callLocalChatAPI(prompt, endpoint, apiKey, model) {
  // Try to derive chat endpoint from embeddings endpoint
  // Usually /v1/embeddings -> /v1/chat/completions
  let chatEndpoint = endpoint.replace('/embeddings', '/chat/completions');
  if (chatEndpoint === endpoint) {
    // If it didn't change (e.g. Ollama direct port), handle specifically
    if (endpoint.includes(':11434')) {
      chatEndpoint = endpoint.replace(/\/[^/]+$/, '/api/generate');
    }
  }

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const body = chatEndpoint.includes('/api/generate') 
    ? { model: model, prompt: prompt, stream: false } // Ollama format
    : { model: model, messages: [{role: 'user', content: prompt}] }; // OpenAI format

  const res = await fetch(chatEndpoint, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error(`Chat API failed with status ${res.status}`);
  const data = await res.json();

  return data.choices ? data.choices[0].message.content : data.response;
}

/**
 * Comprehensive test connectivity for both Embedding and Chat endpoints
 */
export async function testEndpoint(endpoint, apiKey = '', modelEmbed = 'nomic-embed-text', modelChat = 'llama3') {
  const results = {
    embed: { success: false, error: null },
    chat: { success: false, error: null }
  };

  // 1. Test Embeddings
  try {
    const embedRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({ input: "test", model: modelEmbed })
    });
    
    if (embedRes.ok) {
      results.embed.success = true;
    } else {
      results.embed.error = `HTTP ${embedRes.status}`;
    }
  } catch (err) {
    results.embed.error = err.message || "Connection refused";
  }

  // 2. Test Chat/Summarization
  try {
    // Derive chat endpoint
    let chatEndpoint = endpoint.replace('/embeddings', '/chat/completions');
    if (chatEndpoint === endpoint && endpoint.includes(':11434')) {
      chatEndpoint = endpoint.replace(/\/[^/]+$/, '/api/generate');
    }

    const testPrompt = "Respond with 'ok'";
    const body = chatEndpoint.includes('/api/generate') 
      ? { model: modelChat, prompt: testPrompt, stream: false } 
      : { model: modelChat, messages: [{role: 'user', content: testPrompt}] };

    const chatRes = await fetch(chatEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify(body)
    });

    if (chatRes.ok) {
      results.chat.success = true;
    } else {
      results.chat.error = `HTTP ${chatRes.status} (Check if model '${modelChat}' exists in Ollama)`;
    }
  } catch (err) {
    results.chat.error = err.message || "Connection refused";
  }

  return results;
}
