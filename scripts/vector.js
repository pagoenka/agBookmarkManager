// vector.js
// Utility for semantic search calculations

import { getAllEmbeddings } from './db.js';
import { generateEmbedding } from './llm.js';

/**
 * Calculates cosine similarity between two vectors
 * @param {number[]} a 
 * @param {number[]} b 
 * @returns {number}
 */
export function cosineSimilarity(a, b) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Perform a semantic search query
 * @param {string} query 
 * @param {number} topK 
 * @returns {Promise<Array<{id: string, title: string, url: string, score: number}>>}
 */
export async function semanticSearch(query, topK = 10) {
  // 1. Generate embedding for query
  // Since query is just string, we mock bookmark format for the llm.js abstraction
  const queryResult = await generateEmbedding({ id: 'query', title: query, url: '' });
  if (!queryResult || !queryResult.embedding) {
     throw new Error("Could not generate embedding for query");
  }
  const queryVector = queryResult.embedding;

  // 2. Load all stored embeddings from DB
  const bookmarksDb = await getAllEmbeddings();

  // 3. Compute similarities
  const results = [];
  for (const bm of bookmarksDb) {
    if (bm.embedding && bm.embedding.length === queryVector.length) {
       const score = cosineSimilarity(queryVector, bm.embedding);
       results.push({
         id: bm.id,
         title: bm.title,
         url: bm.url,
         score
       });
    }
  }

  // 4. Sort by highest score
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, topK);
}
