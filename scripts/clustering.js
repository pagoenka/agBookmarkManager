// clustering.js
// Implementation of DBSCAN for semantic clustering of bookmarks

import { getAllEmbeddings, saveClusterData } from './db.js';
import { cosineSimilarity } from './vector.js';

/**
 * Main entry point for clustering
 */
export async function startClustering() {
  const settings = await new Promise(resolve => {
    chrome.storage.sync.get(['clusteringEnabled', 'clusteringStrength'], resolve);
  });

  if (!settings.clusteringEnabled) {
    console.log("Clustering: Disabled in settings.");
    return;
  }

  console.log("Clustering: Starting process...");
  
  // 1. Fetch all embeddings
  const bookmarks = await getAllEmbeddings();
  if (bookmarks.length < 2) {
     console.log("Clustering: Not enough bookmarks to cluster.");
     return;
  }

  // 2. Prepare data (only nodes with valid embeddings)
  const data = bookmarks.filter(b => b.embedding && b.embedding.length > 0);
  if (data.length === 0) return;

  // 3. Map strength (1-100) to DBSCAN parameters
  // eps: distance threshold (1 - similarity)
  // broad (1) -> eps 0.6 (similarity 0.4)
  // specific (100) -> eps 0.2 (similarity 0.8)
  const strength = settings.clusteringStrength || 50;
  const eps = 0.6 - (strength / 100) * 0.4; 
  const minPts = 2; // Minimum 2 bookmarks to form a cluster

  // 4. Run DBSCAN
  const clusters = dbscan(data, eps, minPts);
  
  // 5. Save results
  await saveClusterData(clusters);
  
  console.log(`Clustering: Complete. Found ${clusters.length} clusters.`);
  chrome.runtime.sendMessage({ action: 'clusteringComplete', count: clusters.length }).catch(() => {});
}

/**
 * DBSCAN Algorithm
 * @param {Array} data - Array of bookmark objects with embeddings
 * @param {number} eps - Epsilon (distance threshold)
 * @param {number} minPts - Minimum points
 */
function dbscan(data, eps, minPts) {
  const n = data.length;
  const visited = new Set();
  const clusters = [];
  const noise = new Set();

  for (let i = 0; i < n; i++) {
    if (visited.has(i)) continue;
    visited.add(i);

    const neighbors = getNeighbors(i, data, eps);
    if (neighbors.length < minPts) {
      noise.add(i);
    } else {
      const cluster = [];
      expandCluster(i, neighbors, cluster, visited, data, eps, minPts);
      clusters.push(cluster);
    }
  }

  // Format clusters for storage: [{ name: "Topic X", ids: [...] }]
  return clusters.map((clusterIndices, idx) => {
    const clusterBookmarks = clusterIndices.map(i => data[i]);
    // Generate a simple name based on the first bookmark or dominant tags
    const name = generateClusterName(clusterBookmarks);
    return {
      id: `cluster_${idx}_${Date.now()}`,
      name,
      bookmarkIds: clusterBookmarks.map(b => b.id)
    };
  });
}

function expandCluster(pIdx, neighbors, cluster, visited, data, eps, minPts) {
  cluster.push(pIdx);
  
  for (let i = 0; i < neighbors.length; i++) {
    const nIdx = neighbors[i];
    if (!visited.has(nIdx)) {
      visited.add(nIdx);
      const nNeighbors = getNeighbors(nIdx, data, eps);
      if (nNeighbors.length >= minPts) {
        neighbors.push(...nNeighbors.filter(idx => !neighbors.includes(idx)));
      }
    }
    
    // If nIdx is not in any cluster yet, add it
    // (A bit simplified here as we don't track cluster assignments per point explicitly in this recursive-style loop)
    if (!isPointInAnyCluster(nIdx, cluster)) {
       cluster.push(nIdx);
    }
  }
}

function getNeighbors(pIdx, data, eps) {
  const neighbors = [];
  const pVec = data[pIdx].embedding;
  for (let i = 0; i < data.length; i++) {
    const dist = 1 - cosineSimilarity(pVec, data[i].embedding);
    if (dist <= eps) {
      neighbors.push(i);
    }
  }
  return neighbors;
}

function isPointInAnyCluster(idx, currentCluster) {
  return currentCluster.includes(idx);
}

/**
 * Basic heuristic to name a cluster
 */
function generateClusterName(bookmarks) {
  // Try to find the most common tag if present
  const tagCounts = {};
  bookmarks.forEach(bm => {
    if (bm.suggestedTags) {
      bm.suggestedTags.forEach(t => {
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      });
    }
  });

  const topTags = Object.entries(tagCounts).sort((a,b) => b[1] - a[1]);
  if (topTags.length > 0) {
    return topTags[0][0].charAt(0).toUpperCase() + topTags[0][0].slice(1);
  }

  // Fallback: Use the title of the first bookmark, truncated
  const firstTitle = bookmarks[0].title || "Untitled Topic";
  return firstTitle.length > 30 ? firstTitle.substring(0, 27) + "..." : firstTitle;
}
