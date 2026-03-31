import { getBookmarksMeta } from '../scripts/storage.js';
import { createBookmarkElement } from '../scripts/utils.js';

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('bookmarks-container');
  const searchInput = document.getElementById('popup-search');
  const openOptionsBtn = document.getElementById('open-options');

  // Open full options page
  openOptionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Fetch and render initial bookmarks
  await renderBookmarks();

  // Handle Search
  searchInput.addEventListener('input', async (e) => {
    const query = e.target.value.trim();
    if (query.length > 0) {
      const results = await chrome.bookmarks.search(query);
      renderCustomBookmarks(results.slice(0, 15)); // Limit search to 15 results in popup
    } else {
      await renderBookmarks(); // Re-render default recents
    }
  });

  // Core render function for Recents
  async function renderBookmarks() {
    container.innerHTML = '';
    
    // We get a small number of recently added bookmarks to display in popup
    const recentBookmarks = await chrome.bookmarks.getRecent(10);
    renderCustomBookmarks(recentBookmarks);
  }

  // Render a specific array of bookmarks
  async function renderCustomBookmarks(bookmarksList) {
    container.innerHTML = '';
    
    if (bookmarksList.length === 0) {
      container.innerHTML = '<div class="text-muted" style="padding: 16px; text-align: center; font-size: 13px;">No bookmarks found.</div>';
      return;
    }

    // Fetch metadata
    const ids = bookmarksList.filter(b => b.url).map(b => b.id);
    const metaMap = await getBookmarksMeta(ids);

    const fragment = document.createDocumentFragment();
    bookmarksList.forEach(bookmark => {
      if (bookmark.url) { 
        const meta = metaMap[bookmark.id];
        // Only providing meta; onDelete and onEdit are omitted/null for the popup context
        const el = createBookmarkElement(bookmark, meta);
        fragment.appendChild(el);
      }
    });

    container.appendChild(fragment);
  }
});
