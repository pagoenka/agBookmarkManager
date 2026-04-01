(function() {
  const url = window.location.href;
  
  if (url.startsWith('chrome://') || url.startsWith('about:')) return;

  // 1. Ask background if this is a bookmark
  chrome.runtime.sendMessage({ action: 'checkIfBookmark', url: url }, (response) => {
    if (chrome.runtime.lastError) return;
    
    if (response && response.isBookmark) {
      checkConsentAndProcess(response.id);
    }
  });

  async function checkConsentAndProcess(bookmarkId) {
    chrome.storage.local.get(['isAutoIndexEnabled'], (res) => {
      const isAutoIndex = res.isAutoIndexEnabled || false;
      
      if (isAutoIndex) {
        showToast("Indexing bookmark...", 2000);
        performExtraction(bookmarkId);
      } else {
        showConsentBanner(bookmarkId);
      }
    });
  }

  function showToast(message, duration = 3000) {
    const shadow = createShadowContainer('ag-toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    
    shadow.appendChild(toast);
    
    if (duration > 0) {
      setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => shadow.host.remove(), 500);
      }, duration);
    }
  }

  function showConsentBanner(bookmarkId) {
    const shadow = createShadowContainer('ag-consent-container');
    const banner = document.createElement('div');
    banner.className = 'banner flex items-center justify-between';
    
    banner.innerHTML = `
      <div class="flex items-center gap-sm">
        <span style="font-weight: 600;">agBookmarkManager:</span>
        <span>Index this page for semantic search?</span>
      </div>
      <div class="flex gap-sm">
        <button id="btn-always" class="btn btn-secondary">Always</button>
        <button id="btn-now" class="btn btn-primary">Index Now</button>
        <button id="btn-dismiss" class="btn btn-icon">✕</button>
      </div>
    `;
    
    shadow.appendChild(banner);
    
    banner.querySelector('#btn-now').onclick = () => {
      banner.innerHTML = "Indexing...";
      performExtraction(bookmarkId);
      setTimeout(() => shadow.host.remove(), 2000);
    };
    
    banner.querySelector('#btn-always').onclick = () => {
      chrome.storage.local.set({ isAutoIndexEnabled: true });
      banner.innerHTML = "Auto-indexing enabled. Indexing...";
      performExtraction(bookmarkId);
      setTimeout(() => shadow.host.remove(), 2000);
    };
    
    banner.querySelector('#btn-dismiss').onclick = () => {
      shadow.host.remove();
    };
  }

  function createShadowContainer(id) {
    let host = document.getElementById(id);
    if (host) host.remove();
    
    host = document.createElement('div');
    host.id = id;
    document.body.appendChild(host);
    
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `
      .toast, .banner {
        position: fixed;
        right: 20px;
        top: 20px;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 13px;
        padding: 12px 16px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        color: #ffffff;
        background: #1e1e1e;
        transition: opacity 0.5s ease;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .banner {
        top: 20px;
        right: 20px;
        background: #2a2a2a;
        border-left: 4px solid #3b82f6;
        min-width: 320px;
      }
      .flex { display: flex; }
      .items-center { align-items: center; }
      .justify-between { justify-content: space-between; }
      .gap-sm { gap: 8px; }
      .btn {
        cursor: pointer;
        padding: 4px 10px;
        border-radius: 4px;
        border: none;
        font-size: 12px;
        font-weight: 500;
        transition: background 0.2s;
      }
      .btn-primary { background: #3b82f6; color: white; }
      .btn-primary:hover { background: #2563eb; }
      .btn-secondary { background: #444; color: white; }
      .btn-secondary:hover { background: #555; }
      .btn-icon { background: transparent; color: #aaa; font-size: 16px; }
      .btn-icon:hover { color: white; }
    `;
    shadow.appendChild(style);
    return shadow;
  }

  function performExtraction(bookmarkId) {
    const content = extractCleanText();
    chrome.runtime.sendMessage({
      action: 'updateBookmarkContent',
      id: bookmarkId,
      content: content,
      title: document.title
    });
  }

  function extractCleanText() {
    const clone = document.body.cloneNode(true);
    const selectorsToRemove = [
      'script', 'style', 'noscript', 'iframe', 'canvas', 'svg',
      'nav', 'header', 'footer', 'aside', '.ads', '#ads', '.menu'
    ];
    
    selectorsToRemove.forEach(selector => {
      clone.querySelectorAll(selector).forEach(el => el.remove());
    });
    
    return clone.innerText.replace(/\s+/g, ' ').trim();
  }
})();
