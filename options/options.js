import { getBookmarksMeta, saveBookmarkMeta, getBookmarksByIntent } from '../scripts/storage.js';
import { flattenBookmarks, createBookmarkElement } from '../scripts/utils.js';
import { semanticSearch } from '../scripts/vector.js';
import { getEmbedding, clearAllEmbeddings } from '../scripts/db.js';
import { testEndpoint } from '../scripts/llm.js';

document.addEventListener('DOMContentLoaded', async () => {
  const foldersContainer = document.getElementById('folders-container');
  const bookmarksContainer = document.getElementById('bookmarks-container');
  const searchInput = document.getElementById('search-input');
  const currentFolderTitle = document.getElementById('current-folder-title');
  const emptyState = document.getElementById('empty-state');
  const addBookmarkBtn = document.getElementById('add-bookmark-btn');

  // AI & Semantic Search UI
  const aiSettingsBtn = document.getElementById('ai-settings-btn');
  const semanticToggleBtn = document.getElementById('semantic-toggle-btn');
  const indexProgress = document.getElementById('index-progress');

  // AI Modal Elements
  const aiModal = document.getElementById('ai-settings-modal');
  const aiProviderSelect = document.getElementById('ai-provider-select');
  const aiEndpointInput = document.getElementById('ai-endpoint-input');
  const aiModelEmbedInput = document.getElementById('ai-model-embed-input');
  const aiModelChatInput = document.getElementById('ai-model-chat-input');
  const aiApiKeyInput = document.getElementById('ai-api-key-input');
  const autoIndexCheckbox = document.getElementById('auto-index-checkbox');
  const aiModalCancel = document.getElementById('ai-modal-cancel-btn');
  const aiModalSave = document.getElementById('ai-modal-save-btn');
  const aiTestBtn = document.getElementById('ai-test-connection-btn');
  const aiTestResult = document.getElementById('ai-test-result');
  const aiReindexBtn = document.getElementById('ai-reindex-btn');

  let isSemanticSearch = true;

  // Modal Elements
  const modal = document.getElementById('tag-modal');
  const modalIntent = document.getElementById('modal-intent');
  const modalTags = document.getElementById('modal-tags');
  const suggestedTagsContainer = document.getElementById('suggested-tags-container');
  const suggestedTagsList = document.getElementById('suggested-tags-list');
  const modalCancel = document.getElementById('modal-cancel-btn');
  const modalSave = document.getElementById('modal-save-btn');
  let currentlyEditingBookmarkId = null;

  let activeFolderId = '1'; // Default: Bookmarks Bar

  // Load Tree
  await renderSidebar();
  await loadFolderContents(activeFolderId);

  // Intent Views Logic
  document.querySelectorAll('.intent-view').forEach(el => {
    el.addEventListener('click', async () => {
      // Update selection UI
      document.querySelectorAll('.folder-item, .intent-view').forEach(el => el.classList.remove('active'));
      el.classList.add('active');
      
      const intent = el.dataset.intent;
      currentFolderTitle.textContent = `Intent: ${el.querySelector('span:nth-child(2)').textContent}`;
      searchInput.value = '';
      
      const matchingIds = await getBookmarksByIntent(intent);
      if (matchingIds.length === 0) {
        renderBookmarks([]);
        return;
      }
      
      // Fetch actual bookmark nodes for these IDs
      chrome.bookmarks.get(matchingIds, (results) => {
        renderBookmarks(results);
      });
    });
  });

  // Search Logic
  
  // Debounce search input for semantic search since it can be heavy
  let searchTimeout = null;
  searchInput.addEventListener('input', (e) => {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      const query = e.target.value.trim();
      if (query.length > 0) {
        // Clear active folder visualization
        document.querySelectorAll('.folder-item').forEach(el => el.classList.remove('active'));
        
        if (isSemanticSearch) {
          currentFolderTitle.textContent = `Semantic search for "${query}"`;
          try {
            const resultsBase = await semanticSearch(query, 20);
            
            if (resultsBase.length === 0) {
               renderBookmarks([]);
               return;
            }
            
            // Fetch full bookmarks context
            const ids = resultsBase.map(r => r.id);
            chrome.bookmarks.get(ids, (fullBookmarks) => {
               // Sort based on semanticSearch returned order
               const sortedBookmarks = fullBookmarks.sort((a,b) => ids.indexOf(a.id) - ids.indexOf(b.id));
               renderBookmarks(sortedBookmarks);
            });
          } catch(err) {
            console.error("Semantic search failed", err);
            currentFolderTitle.textContent = `Error in semantic search.`;
            renderBookmarks([]);
          }
        } else {
          currentFolderTitle.textContent = `Search results for "${query}"`;
          const results = await chrome.bookmarks.search(query);
          renderBookmarks(results);
        }
      } else {
        await loadFolderContents(activeFolderId);
      }
    }, 400); // 400ms debounce
  });

  // Semantic Toggle
  semanticToggleBtn.style.filter = isSemanticSearch ? 'grayscale(0)' : 'grayscale(1)';
  semanticToggleBtn.addEventListener('click', () => {
    isSemanticSearch = !isSemanticSearch;
    semanticToggleBtn.style.filter = isSemanticSearch ? 'grayscale(0)' : 'grayscale(1)';
    // Trigger search update if there's text
    if (searchInput.value.trim()) {
      searchInput.dispatchEvent(new Event('input'));
    }
  });

  // Add Bookmark Handler (Simplified alert prompt for Phase 1)
  addBookmarkBtn.addEventListener('click', async () => {
    const title = prompt('Enter bookmark title:');
    if (!title) return;
    const url = prompt('Enter bookmark URL:', 'https://');
    if (!url || !url.startsWith('http')) {
      alert('Invalid URL.');
      return;
    }

    await chrome.bookmarks.create({ parentId: activeFolderId, title, url });
    await loadFolderContents(activeFolderId); // Refresh view
  });

  // Modal Logic
  modalCancel.addEventListener('click', () => {
    modal.classList.add('hidden');
    currentlyEditingBookmarkId = null;
  });

  modalSave.addEventListener('click', async () => {
    if (!currentlyEditingBookmarkId) return;
    
    const intent = modalIntent.value || null;
    const tagsString = modalTags.value.trim();
    const tags = tagsString ? tagsString.split(',').map(s => s.trim()).filter(Boolean) : [];
    
    await saveBookmarkMeta(currentlyEditingBookmarkId, { tags, intent });
    
    modal.classList.add('hidden');
    currentlyEditingBookmarkId = null;
    
    // Quick refresh of the current view to show new tags
    const activeSidebar = document.querySelector('.sidebar .active');
    if (activeSidebar) activeSidebar.click();
  });

  // AI Settings Modal Logic
  aiSettingsBtn.addEventListener('click', () => {
    chrome.storage.sync.get(['aiProvider', 'aiEndpoint', 'aiApiKey', 'aiModelEmbed', 'aiModelChat'], res => {
      aiProviderSelect.value = res.aiProvider || 'browser';
      aiEndpointInput.value = res.aiEndpoint || 'http://127.0.0.1:11434/v1/embeddings';
      aiApiKeyInput.value = res.aiApiKey || '';
      aiModelEmbedInput.value = res.aiModelEmbed || 'nomic-embed-text';
      aiModelChatInput.value = res.aiModelChat || 'llama3';
      
      chrome.storage.local.get(['isAutoIndexEnabled'], localRes => {
        autoIndexCheckbox.checked = localRes.isAutoIndexEnabled || false;
        aiModal.classList.remove('hidden');
      });
    });
  });

  aiModalCancel.addEventListener('click', () => {
    aiModal.classList.add('hidden');
  });

  aiModalSave.addEventListener('click', () => {
    const newProvider = aiProviderSelect.value;
    const newEndpoint = aiEndpointInput.value;
    const newModelEmbed = aiModelEmbedInput.value;
    const newModelChat = aiModelChatInput.value;
    const newApiKey = aiApiKeyInput.value;

    chrome.storage.sync.get(['aiProvider', 'aiEndpoint'], async (res) => {
      const providerChanged = res.aiProvider !== newProvider;
      const endpointChanged = res.aiEndpoint !== newEndpoint;

      if (providerChanged || endpointChanged) {
        const confirmSwitch = confirm('Switching AI providers or endpoints will make your current search index incompatible. Would you like to clear the current index and prepare for re-indexing?');
        if (confirmSwitch) {
            await clearAllEmbeddings();
        }
      }

      // Save sync settings
      chrome.storage.sync.set({
        aiProvider: newProvider,
        aiEndpoint: newEndpoint,
        aiModelEmbed: newModelEmbed,
        aiModelChat: newModelChat,
        aiApiKey: newApiKey
      });

      // Save local privacy settings
      chrome.storage.local.set({
        isAutoIndexEnabled: autoIndexCheckbox.checked
      }, () => {
        aiModal.classList.add('hidden');
        
        // Trigger background processing immediately
        chrome.runtime.sendMessage({ action: 'startProcessing' }, (resp) => {
          console.log("Indexing started:", resp);
          alert('AI Settings Saved! Indexing has started in the background.');
          location.reload();
        });
      });
    });
  });

  // AI Test Connection Logic
  aiTestBtn.addEventListener('click', async () => {
    const endpoint = aiEndpointInput.value;
    const apiKey = aiApiKeyInput.value;
    
    aiTestResult.textContent = 'Testing connection...';
    aiTestResult.style.color = 'var(--text-muted)';
    
    chrome.runtime.sendMessage({ action: 'testConnection', endpoint, apiKey }, (result) => {
      if (result && result.success) {
        aiTestResult.textContent = '✓ Connection successful!';
        aiTestResult.style.color = 'var(--success)';
      } else {
        const err = result ? result.error : 'Unknown error';
        aiTestResult.textContent = `✗ Failed: ${err}`;
        aiTestResult.style.color = '#ef4444';
        
        if (err.includes('403')) {
          aiTestResult.innerHTML += `<br/><span style="color: var(--text-muted); font-size: 10px;">Ollama might need OLLAMA_ORIGINS="chrome-extension://*" set.</span>`;
        }
      }
    });
  });

  // Re-index All Logic
  aiReindexBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to RE-INDEX all bookmarks? This will clear the current index and start over.')) {
      await clearAllEmbeddings();
      aiModal.classList.add('hidden');
      chrome.runtime.sendMessage({ action: 'startProcessing' });
      alert('Index cleared. Starting full re-index...');
      location.reload();
    }
  });

  // Listen to background queue progress
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.action === 'indexProgress') {
      indexProgress.classList.remove('hidden');
      const percent = msg.total > 0 ? Math.round((msg.processed / msg.total) * 100) : 0;
      indexProgress.innerHTML = `
        <div class="flex items-center justify-between" style="margin-bottom: 4px;">
           <div class="flex items-center gap-sm">
             <div class="spinner-sm"></div>
             <span style="font-weight: 600;">Indexing: ${percent}%</span>
           </div>
           <span style="font-size: 11px;">${msg.processed} / ${msg.total}</span>
        </div>
        <div class="progress-container">
          <div class="progress-bar" style="width: ${percent}%"></div>
        </div>
      `;
    } else if (msg.action === 'indexComplete') {
      indexProgress.innerHTML = `<span style="color: var(--success); font-weight: 600;">✓ Indexing Complete!</span>`;
      setTimeout(() => indexProgress.classList.add('hidden'), 5000);
    }
  });

  async function openEditModal(bookmark, currentMeta) {
    currentlyEditingBookmarkId = bookmark.id;
    modalIntent.value = currentMeta.intent || '';
    modalTags.value = currentMeta.tags ? currentMeta.tags.join(', ') : '';
    
    // Check for AI Suggested Tags (Phase 4)
    suggestedTagsList.innerHTML = '';
    suggestedTagsContainer.classList.add('hidden');
    
    const dbEntry = await getEmbedding(bookmark.id);
    if (dbEntry && dbEntry.suggestedTags && dbEntry.suggestedTags.length > 0) {
      dbEntry.suggestedTags.forEach(tag => {
        const span = document.createElement('span');
        span.className = 'pill';
        span.style.cursor = 'pointer';
        span.textContent = `+ ${tag}`;
        span.addEventListener('click', () => {
          const currentTags = modalTags.value.split(',').map(t => t.trim()).filter(Boolean);
          if (!currentTags.includes(tag)) {
            currentTags.push(tag);
            modalTags.value = currentTags.join(', ');
          }
        });
        suggestedTagsList.appendChild(span);
      });
      suggestedTagsContainer.classList.remove('hidden');
    }

    modal.classList.remove('hidden');
  }

  // Functions -------------------------------------------------------------

  async function renderSidebar() {
    foldersContainer.innerHTML = '';
    
    // Get full tree
    const [tree] = await chrome.bookmarks.getTree();
    
    // Recursive folder renderer
    function extractFolders(nodes, depth = 0) {
      let folders = [];
      for (const node of nodes) {
        if (!node.url) { // If it doesn't have a URL, it's a folder
          // Skip root empty containers
          if (node.title || depth > 0) {
            folders.push({ ...node, depth });
          }
          if (node.children) {
            folders = folders.concat(extractFolders(node.children, depth + 1));
          }
        }
      }
      return folders;
    }

    const allFolders = extractFolders(tree.children);
    
    const fragment = document.createDocumentFragment();
    allFolders.forEach(folder => {
      // Default to "Root" if title is empty
      const titleStr = folder.title || 'Bookmarks Bar';

      const fDiv = document.createElement('div');
      fDiv.className = `folder-item ${folder.id === activeFolderId ? 'active' : ''}`;
      // Basic indentation representing depth
      fDiv.style.paddingLeft = `${Math.max(8, folder.depth * 16)}px`;
      
      fDiv.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
        </svg>
        <span>${titleStr}</span>
      `;

      fDiv.addEventListener('click', async () => {
        // Update selection UI
        document.querySelectorAll('.folder-item, .intent-view').forEach(el => el.classList.remove('active'));
        fDiv.classList.add('active');
        
        activeFolderId = folder.id;
        searchInput.value = ''; // clear search when switching
        await loadFolderContents(activeFolderId);
      });

      fragment.appendChild(fDiv);
    });

    foldersContainer.appendChild(fragment);
  }

  async function loadFolderContents(folderId) {
    const [folderNodes] = await chrome.bookmarks.getSubTree(folderId);
    
    if (folderNodes) {
      currentFolderTitle.textContent = folderNodes.title || 'Bookmarks Bar';
      // Only get immediate children that are bookmarks (urls) for cleaner UI
      const bookmarks = folderNodes.children.filter(child => child.url);
      renderBookmarks(bookmarks);
    }
  }

  async function renderBookmarks(bookmarks) {
    bookmarksContainer.innerHTML = '';
    
    if (bookmarks.length === 0) {
      emptyState.classList.remove('hidden');
    } else {
      emptyState.classList.add('hidden');
      
      // Fetch metadata for all these bookmarks at once
      const ids = bookmarks.map(b => b.id);
      const metaMap = await getBookmarksMeta(ids);
      
      const fragment = document.createDocumentFragment();
      for (const bm of bookmarks) {
        const meta = metaMap[bm.id] || { tags: [], intent: null };
        
        // Fetch Phase 4 Intelligence (Summary)
        const dbEntry = await getEmbedding(bm.id);
        const enrichedMeta = { ...meta };
        if (dbEntry && dbEntry.summary) {
          enrichedMeta.summary = dbEntry.summary;
        }

        // use onDelete callback to remove from UI and show empty state if needed
        const el = createBookmarkElement(bm, enrichedMeta, (deletedId) => {
        if (bookmarksContainer.children.length === 1) {
          emptyState.classList.remove('hidden');
        }
      }, openEditModal);
        
        fragment.appendChild(el);
      }
      bookmarksContainer.appendChild(fragment);
    }
  }
});
