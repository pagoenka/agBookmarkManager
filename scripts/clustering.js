// clustering.js
// DBSCAN with automatic eps detection (k-distance elbow) and large-cluster splitting

import { getAllEmbeddings, saveClusterData } from './db.js';
import { cosineSimilarity } from './vector.js';

// ---------------------------------------------------------------------------
// Known domain → topic name overrides.  null = too generic, skip.
// ---------------------------------------------------------------------------
const DOMAIN_TOPICS = {
  'kubernetes.io':         'Kubernetes',
  'k8s.io':                'Kubernetes',
  'helm.sh':               'Kubernetes / Helm',
  'docs.docker.com':       'Docker',
  'hub.docker.com':        'Docker',
  'developer.mozilla.org': 'Web Development',
  'web.dev':               'Web Development',
  'css-tricks.com':        'CSS / Web Design',
  'react.dev':             'React',
  'reactjs.org':           'React',
  'vuejs.org':             'Vue.js',
  'angular.io':            'Angular',
  'svelte.dev':            'Svelte',
  'nodejs.org':            'Node.js',
  'docs.python.org':       'Python',
  'python.org':            'Python',
  'rust-lang.org':         'Rust',
  'doc.rust-lang.org':     'Rust',
  'golang.org':            'Go',
  'go.dev':                'Go',
  'terraform.io':          'Terraform',
  'aws.amazon.com':        'AWS',
  'cloud.google.com':      'Google Cloud',
  'learn.microsoft.com':   'Azure',
  'docs.microsoft.com':    'Azure',
  'postgresql.org':        'PostgreSQL',
  'mongodb.com':           'MongoDB',
  'redis.io':              'Redis',
  'arxiv.org':             'Research Papers',
  'openai.com':            'OpenAI / AI',
  'huggingface.co':        'Machine Learning',
  'pytorch.org':           'PyTorch',
  'tensorflow.org':        'TensorFlow',
  // Too generic to use as a cluster name — skip
  'github.com':            null,
  'stackoverflow.com':     null,
  'medium.com':            null,
  'dev.to':                null,
  'youtube.com':           null,
  'twitter.com':           null,
  'x.com':                 null,
  'reddit.com':            null,
  'wikipedia.org':         null,
};

const TITLE_STOPWORDS = new Set([
  'a','an','the','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','should','could','may','might','shall','can',
  'from','to','in','on','at','by','for','with','about','of','or','and','but',
  'not','it','this','that','these','those','how','what','why','when','where',
  'who','which','more','using','use','your','my','our','their','you','we','i',
  'me','him','her','us','them','its','new','top','best','getting','started',
  'guide','tutorial','part','series','intro','introduction','overview',
  'learn','learning','understanding','building','build','create','creating',
  'vs','vs.','–','—','-','&', 'just','also','into','than','then','so',
]);

// Max fraction of total bookmarks a single cluster may contain before we try
// to split it further.  0.35 = a cluster holding >35% of everything is "too big".
const MAX_CLUSTER_RATIO = 0.35;
// How much to tighten eps on each recursive split attempt
const SPLIT_TIGHTEN = 0.75;
// Maximum recursion depth for splitting
const MAX_SPLIT_DEPTH = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────
export async function startClustering() {
  const settings = await new Promise(resolve =>
    chrome.storage.sync.get(['clusteringEnabled', 'clusteringStrength'], resolve)
  );

  if (!settings.clusteringEnabled) {
    console.log('Clustering: Disabled in settings.');
    return;
  }

  console.log('Clustering: Starting process…');

  const allEmbeddings = await getAllEmbeddings();
  if (allEmbeddings.length < 2) {
    console.log('Clustering: Not enough bookmarks.');
    return;
  }

  const data = allEmbeddings.filter(b => b.embedding && b.embedding.length > 0);
  if (data.length === 0) return;

  // ── Auto-detect eps from the data ─────────────────────────────────────────
  const minPts = 2;
  const autoEps = computeAutoEps(data, minPts);

  // User strength (1–100) fine-tunes around the auto value.
  // strength=50 → no adjustment; strength=100 → 20% tighter; strength=1 → 20% looser
  const strength   = settings.clusteringStrength || 50;
  const adjustment = 1 - ((strength - 50) / 50) * 0.20; // range [0.80 … 1.20]
  const eps        = Math.max(0.05, Math.min(0.65, autoEps * adjustment));

  console.log(`Clustering: autoEps=${autoEps.toFixed(3)}, adjusted eps=${eps.toFixed(3)}`);

  // ── Run DBSCAN + split large clusters ─────────────────────────────────────
  const rawClusters  = dbscan(data, eps, minPts);
  const finalClusters = splitOversized(rawClusters, data, eps, minPts, data.length, 0);

  // ── Name & save ───────────────────────────────────────────────────────────
  const named = finalClusters.map((indices, idx) => {
    const clusterBookmarks = indices.map(i => data[i]);
    return {
      id:          `cluster_${idx}_${Date.now()}`,
      name:        generateClusterName(clusterBookmarks, data),
      bookmarkIds: clusterBookmarks.map(b => b.id),
    };
  });

  await saveClusterData(named);
  console.log(`Clustering: Complete. ${named.length} clusters.`);
  chrome.runtime.sendMessage({ action: 'clusteringComplete', count: named.length }).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto eps: k-distance elbow method
//
// For every point, find the distance to its minPts-th nearest neighbor.
// Sort these distances and look for the largest "jump" — the value just before
// that jump is the natural eps for this dataset.
// ─────────────────────────────────────────────────────────────────────────────
function computeAutoEps(data, minPts) {
  const n = data.length;
  const kDists = [];

  for (let i = 0; i < n; i++) {
    const distances = [];
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        distances.push(1 - cosineSimilarity(data[i].embedding, data[j].embedding));
      }
    }
    distances.sort((a, b) => a - b);
    kDists.push(distances[Math.min(minPts - 1, distances.length - 1)]);
  }

  kDists.sort((a, b) => a - b);

  // Find the index with the biggest jump (the elbow)
  let maxJump    = -1;
  let elbowIdx   = Math.floor(n * 0.6); // sensible fallback
  for (let i = 1; i < kDists.length; i++) {
    const jump = kDists[i] - kDists[i - 1];
    if (jump > maxJump) {
      maxJump  = jump;
      elbowIdx = i;
    }
  }

  // Use the value just BEFORE the big jump (right side of dense region)
  return kDists[Math.max(0, elbowIdx - 1)];
}

// ─────────────────────────────────────────────────────────────────────────────
// DBSCAN — returns array of index-arrays (one per cluster, noise discarded)
// ─────────────────────────────────────────────────────────────────────────────
function dbscan(data, eps, minPts) {
  const n       = data.length;
  const visited = new Set();
  const clusters = [];
  const noise   = new Set();

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

  return clusters;
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
    if (!cluster.includes(nIdx)) cluster.push(nIdx);
  }
}

function getNeighbors(pIdx, data, eps) {
  const neighbors = [];
  const pVec = data[pIdx].embedding;
  for (let i = 0; i < data.length; i++) {
    if (1 - cosineSimilarity(pVec, data[i].embedding) <= eps) neighbors.push(i);
  }
  return neighbors;
}

// ─────────────────────────────────────────────────────────────────────────────
// Recursive oversized cluster splitting
//
// If a cluster holds > MAX_CLUSTER_RATIO of all bookmarks, re-run DBSCAN on
// just that cluster's points with a tighter eps.  Repeat up to MAX_SPLIT_DEPTH.
// ─────────────────────────────────────────────────────────────────────────────
function splitOversized(clusters, data, eps, minPts, totalCount, depth) {
  if (depth >= MAX_SPLIT_DEPTH) return clusters;

  const result = [];
  for (const indices of clusters) {
    if (indices.length / totalCount <= MAX_CLUSTER_RATIO) {
      result.push(indices);
      continue;
    }

    // Build a sub-dataset from just these points and re-run DBSCAN tighter
    const subData   = indices.map(i => data[i]);
    const tighterEps = eps * SPLIT_TIGHTEN;
    const subClusters = dbscan(subData, tighterEps, minPts);

    if (subClusters.length <= 1) {
      // Cannot split further — keep as-is
      result.push(indices);
      continue;
    }

    // Map sub-indices back to original global indices
    const remapped = subClusters.map(subIdxs => subIdxs.map(si => indices[si]));
    console.log(`Clustering: Split cluster of ${indices.length} into ${remapped.length} at depth ${depth + 1}`);

    // Recurse to check if sub-clusters also need splitting
    const recurse = splitOversized(remapped, data, tighterEps, minPts, totalCount, depth + 1);
    result.push(...recurse);
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3-Tier cluster naming
//   1. Domain recognition  (strongest — very specific)
//   2. TF-IDF tag scoring  (tags distinctive to this cluster vs global)
//   3. Title keyword TF-IDF (meaningful words in titles, unique to cluster)
// ─────────────────────────────────────────────────────────────────────────────
function generateClusterName(clusterBookmarks, allBookmarks) {
  const clusterSize    = clusterBookmarks.length;
  const totalBookmarks = allBookmarks.length || 1;

  // ── Tier 1: Domain recognition ──
  const domainCounts = {};
  clusterBookmarks.forEach(bm => {
    try {
      const host   = new URL(bm.url).hostname.replace(/^www\./, '');
      const mapped = DOMAIN_TOPICS[host];
      if (mapped) domainCounts[mapped] = (domainCounts[mapped] || 0) + 1;
    } catch { /* skip invalid urls */ }
  });

  const topDomain = Object.entries(domainCounts).sort((a, b) => b[1] - a[1])[0];
  // Require ≥70% from the same known domain — strong majority, not a plurality
  if (topDomain && topDomain[1] >= Math.max(1, Math.ceil(clusterSize * 0.70))) {
    return topDomain[0];
  }

  // ── Tier 2: Distinctive tag scoring (TF-IDF) ──
  const globalTagFreq  = freqMap(allBookmarks,     bm => bm.suggestedTags || []);
  const clusterTagFreq = freqMap(clusterBookmarks, bm => bm.suggestedTags || []);

  const tagScores = Object.entries(clusterTagFreq).map(([tag, localCount]) => {
    const tf          = localCount / clusterSize;
    const globalRatio = (globalTagFreq[tag] || 0) / totalBookmarks;
    return { tag, score: tf / (globalRatio + 0.05) };
  }).sort((a, b) => b.score - a.score);

  if (tagScores.length > 0) return capitalize(tagScores[0].tag);

  // ── Tier 3: Title keyword TF-IDF ──
  const globalWordFreq  = freqMap(allBookmarks,     bm => tokenize(bm.title));
  const clusterWordFreq = freqMap(clusterBookmarks, bm => tokenize(bm.title));

  const wordScores = Object.entries(clusterWordFreq).map(([word, localCount]) => {
    const tf          = localCount / clusterSize;
    const globalRatio = (globalWordFreq[word] || 0) / totalBookmarks;
    return { word, score: tf / (globalRatio + 0.05) };
  }).sort((a, b) => b.score - a.score);

  if (wordScores.length > 0) {
    const [top, second] = wordScores;
    if (second && second.score > top.score * 0.65) {
      return `${capitalize(top.word)} & ${capitalize(second.word)}`;
    }
    return capitalize(top.word);
  }

  // ── Fallback ──
  const firstTitle = clusterBookmarks[0].title || 'Untitled Topic';
  return firstTitle.length > 30 ? firstTitle.substring(0, 27) + '…' : firstTitle;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build a frequency map from an array of objects given a token extractor fn */
function freqMap(items, extractFn) {
  const map = {};
  items.forEach(item => {
    extractFn(item).forEach(token => { map[token] = (map[token] || 0) + 1; });
  });
  return map;
}

function tokenize(title = '') {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map(w => w.replace(/^-+|-+$/g, ''))
    .filter(w => w.length > 2 && !TITLE_STOPWORDS.has(w));
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}
