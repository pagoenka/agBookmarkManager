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

  currentClusters.forEach(cluster => {
    const item = document.createElement('div');
    item.className = 'cluster-item';
    item.innerHTML = `
      <div class="flex justify-between items-center">
        <h4 class="text-sm font-medium">${cluster.name}</h4>
        <span class="text-xs bg-surface-hover px-xs rounded">${cluster.bookmarkIds.length} items</span>
      </div>
    `;
    item.onclick = () => {
        // Switch to map and focus cluster? Or just show list?
        // For now, let's just keep it simple.
        console.log("Clicked cluster:", cluster.name);
    };
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
      // Use the global 'pill' class for consistency
      span.className = 'pill';
      span.style.padding = '4px 10px';
      span.style.fontSize = '12px';
      span.textContent = `#${tag}`;
      detailTags.appendChild(span);
    });
  }

  // Hide move button if it's not in a cluster
  const cluster = currentClusters.find(c => c.bookmarkIds.includes(bookmark.id));
  detailMoveBtn.style.display = cluster ? 'block' : 'none';

  detailsOverlay.classList.remove('hidden');
}

/**
 * Handle moving a whole cluster to a folder
 */
async function handleMoveCluster() {
  if (!selectedBookmark) return;
  
  const cluster = currentClusters.find(c => c.bookmarkIds.includes(selectedBookmark.id));
  if (!cluster) {
    alert("This bookmark is not part of a cluster.");
    return;
  }

  detailMoveBtn.disabled = true;
  detailMoveBtn.textContent = 'Moving...';

  try {
    await groupClusterToFolder(cluster.name, cluster.bookmarkIds);
    alert(`Successfully moved ${cluster.bookmarkIds.length} bookmarks to '${cluster.name}' folder.`);
    detailsOverlay.classList.add('hidden');
    // Refresh to show they are moved (though D3 is purely visual representation of DB, 
    // the bookmarks IDs haven't changed, only their parent in Chrome's internal tree)
  } catch (err) {
    alert("Failed to move bookmarks: " + err.message);
  } finally {
    detailMoveBtn.disabled = false;
    detailMoveBtn.textContent = 'Move to Folder';
  }
}

// Start
init();
