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
  const pauseResumeBtn = document.getElementById('pause-resume-btn');
  const pauseIcon = document.getElementById('pause-icon');
  const resumeIcon = document.getElementById('resume-icon');

  // AI Modal Elements
  const aiModal = document.getElementById('ai-settings-modal');
  const aiModalTitle = document.getElementById('ai-modal-title');
  const onboardingWelcome = document.getElementById('onboarding-welcome');
  const aiProviderSelect = document.getElementById('ai-provider-select');
  
  // Check for onboarding status
  const urlParams = new URLSearchParams(window.location.search);
  const isOnboarding = urlParams.get('onboarding') === 'true';

  if (isOnboarding) {
    // Automatically trigger AI settings for first-time setup
    setTimeout(() => {
      aiModal.classList.remove('hidden');
      if (onboardingWelcome) onboardingWelcome.classList.remove('hidden');
      if (aiModalTitle) aiModalTitle.textContent = 'Welcome! Initial AI Setup';
      
      // Clear the onboarding flag from URL so it doesn't reappear on reload
      window.history.replaceState({}, document.title, window.location.pathname);
    }, 500);
  }
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
  let isIndexPaused = false;

  // Initialize Pause/Resume state
  chrome.storage.local.get(['isIndexPaused'], (res) => {
    isIndexPaused = res.isIndexPaused || false;
    // updatePauseResumeUI initialized on load if button is present
    if (pauseResumeBtn) updatePauseResumeUI();
  });

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

  // Check current indexing status on load
  chrome.runtime.sendMessage({ action: 'getStatus' }, (state) => {
    if (state && (state.processing || state.queueLength > 0 || state.isPaused)) {
      updateProgressUI(state);
    }
  });

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
            
            // Fetch full bookmarks context safely
            const ids = resultsBase.map(r => r.id);
            
            // Use individual promises to handle missing IDs without failing the whole batch
            const bookmarkPromises = ids.map(id => 
              chrome.bookmarks.get(id).catch(() => null)
            );
            
            Promise.all(bookmarkPromises).then(results => {
              // results is an array of arrays (since get returns a list), or null if failed
              const fullBookmarks = results.filter(Boolean).flat();
              
              if (fullBookmarks.length === 0) {
                renderBookmarks([]);
                return;
              }
              
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
    const modelEmbed = aiModelEmbedInput.value;
    const modelChat = aiModelChatInput.value;
    
    aiTestResult.textContent = 'Testing connection...';
    aiTestResult.style.color = 'var(--text-muted)';
    
    chrome.runtime.sendMessage({ action: 'testConnection', endpoint, apiKey, modelEmbed, modelChat }, (results) => {
      if (results && results.embed) {
        let msg = '';
        if (results.embed.success && results.chat.success) {
          msg = '✅ All systems go! Search and Summaries work.';
          aiTestResult.style.color = 'var(--success)';
        } else {
          msg += results.embed.success ? '✓ Search OK. ' : '✗ Search Failed. ';
          msg += results.chat.success ? '✓ Summaries OK.' : '✗ Summaries Failed.';
          aiTestResult.style.color = results.embed.success ? '#f59e0b' : '#ef4444'; // Amber or Red
        }
        aiTestResult.textContent = msg;
      } else {
        const err = results ? results.error : 'Unknown error';
        aiTestResult.textContent = `✗ Failed: ${err}`;
        aiTestResult.style.color = '#ef4444';
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
      updateProgressUI(msg);
    } else if (msg.action === 'indexComplete') {
      indexProgress.innerHTML = `<span style="color: var(--success); font-weight: 600;">✓ Indexing Complete!</span>`;
      if (pauseResumeBtn) pauseResumeBtn.classList.add('hidden');
      setTimeout(() => indexProgress.classList.add('hidden'), 5000);
    }
  });

  function updateProgressUI(state) {
    if (!indexProgress) return;
    indexProgress.classList.remove('hidden');
    if (pauseResumeBtn) pauseResumeBtn.classList.remove('hidden');
    
    // Use stored pause state if available, otherwise from message
    const paused = typeof state.isPaused !== 'undefined' ? state.isPaused : isIndexPaused;
    
    const percent = state.total > 0 ? Math.round((state.processed / state.total) * 100) : 
                   (state.totalItems > 0 ? Math.round((state.processedItems / state.totalItems) * 100) : 0);
    
    const processed = state.processed || state.processedItems || 0;
    const total = state.total || state.totalItems || 0;

    indexProgress.innerHTML = `
      <div class="flex items-center justify-between" style="margin-bottom: 4px;">
         <div class="flex items-center gap-sm">
           <div class="${paused ? 'pause-indicator' : 'spinner-sm'}"></div>
           <span style="font-weight: 600;">${paused ? 'Paused' : 'Indexing'}: ${percent}%</span>
         </div>
         <span style="font-size: 11px;">${processed} / ${total}</span>
      </div>
      <div class="progress-container">
        <div class="progress-bar" style="width: ${percent}%"></div>
      </div>
    `;
  }

  // Pause/Resume Logic
  if (pauseResumeBtn) {
    pauseResumeBtn.addEventListener('click', () => {
      isIndexPaused = !isIndexPaused;
      chrome.storage.local.set({ isIndexPaused });
      updatePauseResumeUI();

      const action = isIndexPaused ? 'pauseIndexing' : 'resumeIndexing';
      chrome.runtime.sendMessage({ action });
      
      // Request progress update to refresh UI
      chrome.runtime.sendMessage({ action: 'getProgress' });
    });
  }

  function updatePauseResumeUI() {
    if (!pauseResumeBtn) return;
    if (isIndexPaused) {
      pauseIcon.classList.add('hidden');
      resumeIcon.classList.remove('hidden');
      pauseResumeBtn.title = 'Resume Indexing';
    } else {
      pauseIcon.classList.remove('hidden');
      resumeIcon.classList.add('hidden');
      pauseResumeBtn.title = 'Pause Indexing';
    }
  }

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
        <div class="flex items-center gap-sm" style="overflow: hidden; flex: 1;">
          <svg style="flex-shrink: 0;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
          </svg>
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${titleStr}</span>
        </div>
        <button class="folder-delete-btn" title="Delete Folder" style="flex-shrink: 0; margin-left: 12px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
        </button>
      `;

      fDiv.addEventListener('click', async () => {
        // Update selection UI
        document.querySelectorAll('.folder-item, .intent-view').forEach(el => el.classList.remove('active'));
        fDiv.classList.add('active');
        
        activeFolderId = folder.id;
        searchInput.value = ''; // clear search when switching
        await loadFolderContents(activeFolderId);
      });

      const deleteBtn = fDiv.querySelector('.folder-delete-btn');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Don't trigger the folder click
        const id = folder.id;
        const title = titleStr;
        if (confirm(`Are you sure you want to delete the "${title}" collection and all its bookmarks?`)) {
          chrome.bookmarks.removeTree(id, () => {
            renderSidebar();
            if (activeFolderId === id) {
              loadFolderContents('1'); // Go back to root
            }
          });
        }
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
