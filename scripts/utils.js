/**
 * Extract the first letter of the domain from a url string
 */
function getHostnameLetter(u) {
  try {
    const url = new URL(u);
    let hostname = url.hostname.replace(/^www\./, '');
    return hostname.charAt(0).toUpperCase();
  } catch (e) {
    return '?';
  }
}

/**
 * Traverses bookmark tree to flat structure
 */
function flattenBookmarks(nodes, result = []) {
  for (const node of nodes) {
    if (node.url) {
      result.push(node);
    }
    if (node.children) {
      flattenBookmarks(node.children, result);
    }
  }
  return result;
}

/**
 * Renders a single bookmark item DOM node
 */
function createBookmarkElement(bookmark, meta = { tags: [], intent: null }, onDelete, onEditMetadata, onMove) {
  const div = document.createElement('div');
  div.className = 'bookmark-item';
  div.dataset.id = bookmark.id;
  div.dataset.url = bookmark.url;

  // Icon / Letter Avatar
  const icon = document.createElement('div');
  icon.className = 'bookmark-icon flex items-center justify-center';
  icon.style.width = '24px';
  icon.style.height = '24px';
  icon.style.borderRadius = '4px';
  icon.style.backgroundColor = 'var(--surface-hover)';
  icon.style.color = 'var(--text-primary)';
  icon.style.fontWeight = '500';
  icon.style.fontSize = '12px';
  icon.style.flexShrink = '0';
  
  const letter = getHostnameLetter(bookmark.url);
  icon.textContent = letter;

  // Info: Title & URL
  const info = document.createElement('div');
  info.className = 'bookmark-info flex';
  info.style.flexDirection = 'column';
  
  const title = document.createElement('span');
  title.className = 'bookmark-title truncate';
  title.textContent = bookmark.title || new URL(bookmark.url).hostname;
  
  const urlParams = document.createElement('span');
  urlParams.className = 'bookmark-url truncate text-sm text-muted';
  urlParams.textContent = bookmark.url;

  info.appendChild(title);
  info.appendChild(urlParams);

  // Render Summary (Phase 4)
  if (meta.summary) {
    const summary = document.createElement('p');
    summary.className = 'bookmark-summary';
    summary.style.marginTop = '4px';
    summary.style.fontSize = '12px';
    summary.style.color = '#6b7280'; // Gray 500
    summary.style.fontStyle = 'italic';
    summary.style.display = '-webkit-box';
    summary.style.webkitLineClamp = '2';
    summary.style.webkitBoxOrient = 'vertical';
    summary.style.overflow = 'hidden';
    summary.textContent = meta.summary;
    info.appendChild(summary);
  }

  // Render Pills (Phase 2)
    if ((meta.tags && meta.tags.length > 0) || meta.intent || meta.health) {
      const pillContainer = document.createElement('div');
      pillContainer.className = 'pill-container';
      
      if (meta.health) {
        const healthPill = document.createElement('span');
        healthPill.className = `pill ${meta.health.status}`;
        healthPill.textContent = (meta.health.status === 'broken' ? 'BROKEN' : 'OFFLINE');
        pillContainer.appendChild(healthPill);
      }

      if (meta.intent) {
      const intentPill = document.createElement('span');
      // e.g., "read-later" -> "intent-read-later"
      intentPill.className = `pill intent intent-${meta.intent.replace(' ', '-')}`;
      intentPill.textContent = meta.intent.replace('-', ' ').toUpperCase();
      pillContainer.appendChild(intentPill);
    }
    
    if (meta.tags) {
      meta.tags.forEach(t => {
        const tagPill = document.createElement('span');
        tagPill.className = 'pill';
        tagPill.textContent = `#${t}`;
        pillContainer.appendChild(tagPill);
      });
    }
    
    info.appendChild(pillContainer);
  }

  // Layout wrapper for clickable area
  const linkArea = document.createElement('div');
  linkArea.className = 'bookmark-link flex items-center gap-sm';
  linkArea.style.flexGrow = '1';
  linkArea.style.cursor = 'pointer';
  linkArea.style.minWidth = '0';
  linkArea.appendChild(icon);
  linkArea.appendChild(info);

  // Click to open bookmark
  linkArea.addEventListener('click', () => {
    chrome.tabs.create({ url: bookmark.url });
  });

  // Actions
  const actions = document.createElement('div');
  actions.className = 'bookmark-actions flex gap-sm';
  
  // Tag / Edit Meta Button
  const tagBtn = document.createElement('button');
  tagBtn.className = 'btn btn-icon';
  tagBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>`;
  tagBtn.title = 'Edit Tags / Intent';
  tagBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (onEditMetadata) onEditMetadata(bookmark, meta);
  });
  
  const delBtn = document.createElement('button');
  delBtn.className = 'btn btn-icon danger';
  delBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>`;
  delBtn.title = 'Delete';
  
  delBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await chrome.bookmarks.remove(bookmark.id);
    if (onDelete) onDelete(bookmark.id);
    div.remove();
  });

  // Move to Folder button
  const moveBtn = document.createElement('button');
  moveBtn.className = 'btn btn-icon';
  moveBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="12" y1="11" x2="12" y2="17"></line><polyline points="9 14 12 17 15 14"></polyline></svg>`;
  moveBtn.title = 'Move to Folder';
  moveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (onMove) onMove(bookmark);
  });

  actions.appendChild(moveBtn);
  actions.appendChild(tagBtn);
  actions.appendChild(delBtn);

  div.appendChild(linkArea);
  div.appendChild(actions);

  return div;
}

async function groupClusterToFolder(clusterName, bookmarkIds) {
  try {
    // 1. Get or create "AI Topics" parent folder under "Other Bookmarks" (id: '2')
    const searchResults = await chrome.bookmarks.search({ title: 'AI Topics' });
    let parentFolder = searchResults.find(f => !f.url);
    
    if (!parentFolder) {
      parentFolder = await chrome.bookmarks.create({
        parentId: '2', // Other Bookmarks
        title: 'AI Topics'
      });
    }

    // 2. Check if a folder for this cluster already exists UNDER the AI Topics folder
    const existingChildren = await chrome.bookmarks.getChildren(parentFolder.id);
    let clusterFolder = existingChildren.find(f => !f.url && f.title === clusterName);

    if (!clusterFolder) {
      clusterFolder = await chrome.bookmarks.create({
        parentId: parentFolder.id,
        title: clusterName
      });
    }

    // 3. Move all bookmarks into it
    for (const id of bookmarkIds) {
      try {
        const bm = await chrome.bookmarks.get(id);
        // Only move if not already in the target folder
        if (bm && bm[0] && bm[0].parentId !== clusterFolder.id) {
          await chrome.bookmarks.move(id, { parentId: clusterFolder.id });
        }
      } catch (err) {
        console.warn(`Failed to move bookmark ${id}:`, err);
      }
    }

    return clusterFolder;
  } catch (err) {
    console.error("Critical error in groupClusterToFolder:", err);
    throw err;
  }
}

export { getHostnameLetter, flattenBookmarks, createBookmarkElement, groupClusterToFolder };
