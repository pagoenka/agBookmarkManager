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
function createBookmarkElement(bookmark, meta = { tags: [], intent: null }, onDelete, onEditMetadata) {
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

  // Render Pills (Phase 2)
  if ((meta.tags && meta.tags.length > 0) || meta.intent) {
    const pillContainer = document.createElement('div');
    pillContainer.className = 'pill-container';
    
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

  actions.appendChild(tagBtn);
  actions.appendChild(delBtn);

  div.appendChild(linkArea);
  div.appendChild(actions);

  return div;
}

export { getHostnameLetter, flattenBookmarks, createBookmarkElement };
