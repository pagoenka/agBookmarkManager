import { getClusterData, getAllEmbeddings } from '../scripts/db.js';
import { groupClusterToFolder } from '../scripts/utils.js';
import { initGraph, updateGraph, resetZoom, zoomIn, zoomOut } from '../scripts/map-view.js';

const clusteringStatus = document.getElementById('clustering-status');
const viewMapBtn = document.getElementById('view-map-btn');
const viewListBtn = document.getElementById('view-list-btn');
const mapContainer = document.getElementById('map-container');
const listContainer = document.getElementById('list-container');
const clusterList = document.getElementById('cluster-list');

const detailsOverlay = document.getElementById('details-overlay');
const closeDetails = document.getElementById('close-details');
const detailTitle = document.getElementById('detail-title');
const detailSummary = document.getElementById('detail-summary');
const detailTags = document.getElementById('detail-tags');
const detailLink = document.getElementById('detail-link');
const detailMoveBtn = document.getElementById('detail-move-btn');
const detailClusterBanner = document.getElementById('detail-cluster-banner');
const detailClusterName = document.getElementById('detail-cluster-name');
const detailClusterCount = document.getElementById('detail-cluster-count');
const mapEmptyState = document.getElementById('map-empty-state');
const btnGenerateClusters = document.getElementById('btn-generate-clusters');
const graphCanvas = document.getElementById('graph-canvas-container');

let currentClusters = [];
let allBookmarks = [];
let selectedBookmark = null;

// Initialize
async function init() {
  console.log("Sidepanel: Initializing...");
  
  // Setup View Switcher
  viewMapBtn.addEventListener('click', () => switchView('map'));
  viewListBtn.addEventListener('click', () => switchView('list'));

  // Setup Details
  closeDetails.addEventListener('click', () => detailsOverlay.classList.add('hidden'));
  detailsOverlay.addEventListener('click', (e) => {
    if (e.target === detailsOverlay) detailsOverlay.classList.add('hidden');
  });

  // Setup Actions
  detailMoveBtn.addEventListener('click', handleMoveCluster);
  btnGenerateClusters.addEventListener('click', handleGenerateMap);

  // Setup Map Controls
  document.getElementById('btn-zoom-in').addEventListener('click', zoomIn);
  document.getElementById('btn-zoom-out').addEventListener('click', zoomOut);
  document.getElementById('btn-reset').addEventListener('click', resetZoom);

  // Initial Load
  await refreshData();
  
  // Init Graph
  initGraph('graph-svg', showBookmarkDetails);
  if (allBookmarks.length > 0) {
    updateGraph(allBookmarks, currentClusters);
  }

  // Listen for updates from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'clusteringComplete') {
      console.log("Sidepanel: Clustering update received.");
      clusteringStatus.textContent = `Updated (${msg.count} topics)`;
      refreshData().then(() => {
        updateGraph(allBookmarks, currentClusters);
        renderTopicList();
      });
    }
    if (msg.action === 'indexProgress') {
        clusteringStatus.textContent = `Indexing... (${msg.processed}/${msg.total})`;
    }
    if (msg.action === 'indexComplete') {
        clusteringStatus.textContent = `Clustering...`;
    }
  });
}

async function refreshData() {
  currentClusters = await getClusterData();
  allBookmarks = await getAllEmbeddings();
  
  const hasClusters = currentClusters.length > 0;
  
  // Update Status Text
  clusteringStatus.textContent = hasClusters
    ? `${currentClusters.length} topics identified` 
    : "No clusters yet";

  // Toggle Empty State for Map
  if (mapEmptyState) {
    if (!hasClusters) {
      mapEmptyState.classList.remove('hidden');
      if (graphCanvas) graphCanvas.classList.add('hidden');
      
      // Update empty state text based on search progress
      const emptyTitle = mapEmptyState.querySelector('h3');
      const emptyDesc = mapEmptyState.querySelector('p');
      if (allBookmarks.length === 0) {
        emptyTitle.textContent = "Index your bookmarks first";
        emptyDesc.textContent = "AI clustering requires your bookmarks to be indexed with embeddings. Go to Settings to start.";
        btnGenerateClusters.classList.add('hidden');
      } else {
        emptyTitle.textContent = "Knowledge Map";
        emptyDesc.textContent = "You have indexed bookmarks but no clusters yet. Click below to group them into topics.";
        btnGenerateClusters.classList.remove('hidden');
      }
    } else {
      mapEmptyState.classList.add('hidden');
      if (graphCanvas) graphCanvas.classList.remove('hidden');
    }
  }
}

async function handleGenerateMap() {
  btnGenerateClusters.disabled = true;
  btnGenerateClusters.textContent = "Generating...";
  clusteringStatus.textContent = "Clustering...";

  chrome.runtime.sendMessage({ action: 'startClustering' }, (response) => {
    console.log("Clustering triggered:", response);
    // The clusteringComplete message will refresh the UI when done
  });
}

function switchView(view) {
  if (view === 'map') {
    viewMapBtn.classList.add('active');
    viewListBtn.classList.remove('active');
    mapContainer.classList.remove('hidden');
    listContainer.classList.add('hidden');
    refreshData(); // Ensure empty state is correct
  } else {
    viewListBtn.classList.add('active');
    viewMapBtn.classList.remove('active');
    listContainer.classList.remove('hidden');
    mapContainer.classList.add('hidden');
    renderTopicList();
  }
}

function renderTopicList() {
  clusterList.innerHTML = '';
  if (currentClusters.length === 0) {
    clusterList.innerHTML = `
      <div class="text-xs text-muted text-center p-md" style="margin-top: 40px;">
        <p>No clusters found.</p>
        <p style="margin-top: 8px;">Ensure you have bookmarks indexed in Options.</p>
      </div>
    `;
    return;
  }

  // Build a quick lookup map from bookmark id -> bookmark data
  const bmMap = {};
  allBookmarks.forEach(bm => { bmMap[bm.id] = bm; });

  currentClusters.forEach(cluster => {
    const count = cluster.bookmarkIds.length;

    // Resolve up to 3 bookmark titles for the preview
    const previewBms = cluster.bookmarkIds
      .map(id => bmMap[id])
      .filter(Boolean)
      .slice(0, 3);

    // Collect top tags across the cluster (max 4 shown)
    const tagCounts = {};
    cluster.bookmarkIds.forEach(id => {
      const bm = bmMap[id];
      if (bm && bm.suggestedTags) {
        bm.suggestedTags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
      }
    });
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([tag]) => tag);

    const previewHTML = previewBms.map(bm => {
      const host = (() => { try { return new URL(bm.url).hostname.replace('www.', ''); } catch { return ''; } })();
      return `
        <div class="topic-preview-row">
          <span class="topic-preview-title">${bm.title || 'Untitled'}</span>
          ${host ? `<span class="topic-preview-host">${host}</span>` : ''}
        </div>`;
    }).join('');

    const remaining = count - previewBms.length;
    const moreHTML = remaining > 0
      ? `<div class="topic-preview-more">+${remaining} more bookmark${remaining !== 1 ? 's' : ''}</div>`
      : '';

    const tagsHTML = topTags.length > 0
      ? `<div class="topic-tags-row">${topTags.map(t => `<span class="pill topic-tag">#${t}</span>`).join('')}</div>`
      : '';

    const item = document.createElement('div');
    item.className = 'cluster-item';
    item.innerHTML = `
      <div class="cluster-item-header">
        <div class="cluster-item-title-row">
          <h4 class="cluster-item-name">${cluster.name}</h4>
          <span class="cluster-item-count">${count} bookmark${count !== 1 ? 's' : ''}</span>
        </div>
        ${tagsHTML}
      </div>
      <div class="topic-preview-list">
        ${previewHTML}
        ${moreHTML}
      </div>
      <div class="cluster-item-actions">
        <button class="btn btn-sm btn-move-cluster" data-cluster-id="${cluster.id}" title="Move all ${count} bookmarks into a folder named '${cluster.name}'">
          Move to &ldquo;${cluster.name}&rdquo;
        </button>
      </div>
    `;

    // Wire up the move button
    item.querySelector('.btn-move-cluster').addEventListener('click', async (e) => {
      e.stopPropagation();
      const btn = e.currentTarget;
      const confirmed = confirm(
        `Move ${count} bookmark${count !== 1 ? 's' : ''} into a folder named "${cluster.name}"?\n\n` +
        `This folder will be created (or reused if it already exists) in your bookmarks.`
      );
      if (!confirmed) return;
      btn.disabled = true;
      btn.textContent = 'Moving…';
      try {
        await groupClusterToFolder(cluster.name, cluster.bookmarkIds);
        clusteringStatus.textContent = `✓ Moved ${count} to "${cluster.name}"`;
        setTimeout(() => {
          clusteringStatus.textContent = `${currentClusters.length} topics identified`;
        }, 4000);
        btn.textContent = '✓ Done';
      } catch (err) {
        alert('Failed to move bookmarks: ' + err.message);
        btn.disabled = false;
        btn.textContent = `Move to "${cluster.name}"`;
      }
    });

    clusterList.appendChild(item);
  });
}

function showBookmarkDetails(bookmark) {
  selectedBookmark = bookmark;
  detailTitle.textContent = bookmark.title;
  detailSummary.textContent = bookmark.summary || "No AI summary generated for this bookmark.";
  detailLink.href = bookmark.url;

  detailTags.innerHTML = '';
  if (bookmark.suggestedTags) {
    bookmark.suggestedTags.forEach(tag => {
      const span = document.createElement('span');
      span.className = 'pill';
      span.style.padding = '4px 10px';
      span.style.fontSize = '12px';
      span.textContent = `#${tag}`;
      detailTags.appendChild(span);
    });
  }

  // Find the cluster this bookmark belongs to
  const cluster = currentClusters.find(c => c.bookmarkIds.includes(bookmark.id));

  if (cluster) {
    // Show the cluster banner so the user knows exactly where "Move" will go
    detailClusterName.textContent = cluster.name;
    detailClusterCount.textContent = `· ${cluster.bookmarkIds.length} bookmark${cluster.bookmarkIds.length !== 1 ? 's' : ''}`;
    detailClusterBanner.classList.remove('hidden');
    detailMoveBtn.style.display = 'block';
    // Keep button label showing the destination folder name
    detailMoveBtn.textContent = `Move to "${cluster.name}"`;
  } else {
    detailClusterBanner.classList.add('hidden');
    detailMoveBtn.style.display = 'none';
  }

  detailsOverlay.classList.remove('hidden');
}

/**
 * Handle moving a whole cluster to a folder
 */
async function handleMoveCluster() {
  if (!selectedBookmark) return;

  const cluster = currentClusters.find(c => c.bookmarkIds.includes(selectedBookmark.id));
  if (!cluster) {
    alert('This bookmark is not part of a cluster.');
    return;
  }

  const count = cluster.bookmarkIds.length;
  const confirmed = confirm(
    `Move ${count} bookmark${count !== 1 ? 's' : ''} into a folder named "${cluster.name}"?\n\n` +
    `This folder will be created (or reused if it already exists) in your bookmarks.`
  );
  if (!confirmed) return;

  detailMoveBtn.disabled = true;
  detailMoveBtn.textContent = 'Moving...';

  try {
    await groupClusterToFolder(cluster.name, cluster.bookmarkIds);
    detailsOverlay.classList.add('hidden');
    // Brief non-blocking status feedback via the status indicator
    clusteringStatus.textContent = `✓ Moved ${count} to "${cluster.name}"`;
    setTimeout(() => {
      clusteringStatus.textContent = `${currentClusters.length} topics identified`;
    }, 4000);
  } catch (err) {
    alert('Failed to move bookmarks: ' + err.message);
  } finally {
    detailMoveBtn.disabled = false;
    // Label will be re-set next time showBookmarkDetails is called
    detailMoveBtn.textContent = 'Move Cluster to Folder';
  }
}

// Start
init();
