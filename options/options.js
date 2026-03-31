import { getBookmarksMeta, saveBookmarkMeta, getBookmarksByIntent } from '../scripts/storage.js';
import { flattenBookmarks, createBookmarkElement } from '../scripts/utils.js';
import { semanticSearch } from '../scripts/vector.js';

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
  const aiModalCancel = document.getElementById('ai-modal-cancel-btn');
  const aiModalSave = document.getElementById('ai-modal-save-btn');

  let isSemanticSearch = false;

  // Modal Elements
  const modal = document.getElementById('tag-modal');
  const modalIntent = document.getElementById('modal-intent');
  const modalTags = document.getElementById('modal-tags');
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
    chrome.storage.sync.get(['aiProvider', 'aiEndpoint'], res => {
      aiProviderSelect.value = res.aiProvider || 'browser';
      aiEndpointInput.value = res.aiEndpoint || 'http://127.0.0.1:11434/v1/embeddings';
      aiModal.classList.remove('hidden');
    });
  });

  aiModalCancel.addEventListener('click', () => {
    aiModal.classList.add('hidden');
  });

  aiModalSave.addEventListener('click', () => {
    chrome.storage.sync.set({
      aiProvider: aiProviderSelect.value,
      aiEndpoint: aiEndpointInput.value
    }, () => {
      aiModal.classList.add('hidden');
      alert('AI Settings Saved!');
    });
  });

  // Listen to background queue progress
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.action === 'indexProgress') {
      indexProgress.classList.remove('hidden');
      indexProgress.textContent = `Indexing: ${msg.remaining} left`;
    } else if (msg.action === 'indexComplete') {
      indexProgress.classList.add('hidden');
      indexProgress.textContent = 'Indexing Complete!';
    }
  });

  function openEditModal(bookmark, currentMeta) {
    currentlyEditingBookmarkId = bookmark.id;
    modalIntent.value = currentMeta.intent || '';
    modalTags.value = currentMeta.tags ? currentMeta.tags.join(', ') : '';
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
      bookmarks.forEach(bm => {
        const meta = metaMap[bm.id];
        // use onDelete callback to remove from UI and show empty state if needed
        const el = createBookmarkElement(bm, meta, (deletedId) => {
          if (bookmarksContainer.children.length === 1) {
            emptyState.classList.remove('hidden');
          }
        }, openEditModal);
        
        fragment.appendChild(el);
      });
      bookmarksContainer.appendChild(fragment);
    }
  }
});
