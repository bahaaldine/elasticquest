import type { Challenge, SearchResponse, ElasticBackend } from '../types';

function makeVector(seed: number, dims: number): number[] {
  const vec: number[] = [];
  let s = seed;
  for (let i = 0; i < dims; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    vec.push((s / 0x7fffffff) * 2 - 1);
  }
  const mag = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  return vec.map((v) => Math.round((v / mag) * 10000) / 10000);
}

const techVec = makeVector(42, 8);
const productVec = makeVector(99, 8);
const billingVec = makeVector(7, 8);
const generalVec = makeVector(200, 8);

export const vectorSearchChallenges: Challenge[] = [
  {
    id: 'vec-1-knn-basic',
    domain: 'vector-search',
    difficulty: 'beginner',
    title: 'Basic kNN Search',
    description: `The "eq-kb" index has documents with 8-dimensional embedding vectors. Find the 3 most similar documents to the query vector:
${JSON.stringify(techVec)}

Use the top-level knn parameter:
{
  "knn": { "field": "embedding", "query_vector": [...], "k": 3, "num_candidates": 10 }
}`,
    hints: ['Use knn at the top level (not inside query)', 'field: "embedding", k: 3'],
    indexName: 'eq-kb',
    mapping: { properties: { title: { type: 'text' }, content: { type: 'text' }, category: { type: 'keyword' }, embedding: { type: 'dense_vector', dims: 8, similarity: 'cosine' } } },
    seedData: [
      { _id: '1', _index: 'eq-kb', _source: { title: 'Password Reset', content: 'Reset your password.', category: 'tech-support', embedding: techVec } },
      { _id: '2', _index: 'eq-kb', _source: { title: 'Connection Issues', content: 'Troubleshoot connections.', category: 'tech-support', embedding: techVec.map((v) => v + 0.05) } },
      { _id: '3', _index: 'eq-kb', _source: { title: 'Pricing', content: 'Our pricing tiers.', category: 'product', embedding: productVec } },
      { _id: '4', _index: 'eq-kb', _source: { title: 'Billing', content: 'Billing cycle info.', category: 'billing', embedding: billingVec } },
      { _id: '5', _index: 'eq-kb', _source: { title: 'API Limits', content: 'Rate limits per tier.', category: 'tech-support', embedding: techVec.map((v) => v + 0.1) } },
      { _id: '6', _index: 'eq-kb', _source: { title: 'FAQ', content: 'Frequently asked questions.', category: 'general', embedding: generalVec } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      const hitIds = response.hits.hits.map((h) => h._id);
      const expectedIds = ['1', '2', '5'];
      const found = expectedIds.filter((id) => hitIds.includes(id));
      let score = 0;
      if (hitIds.length === 3) score += 20;
      score += Math.floor((found.length / expectedIds.length) * 60);
      if (hitIds[0] === '1') score += 10;
      if (found.length === 3) score += 10;
      const correct = found.length === expectedIds.length && hitIds.length === 3;
      return { correct, score: Math.min(100, score), maxScore: 100, feedback: correct ? 'Found the 3 most similar tech-support articles.' : `Found ${found.length}/${expectedIds.length}. Expected tech-support docs (1, 2, 5).` };
    },
    maxScore: 100,
    timeLimitMs: 45000,
  },

  {
    id: 'vec-2-knn-with-filter',
    domain: 'vector-search',
    difficulty: 'intermediate',
    title: 'kNN with Category Filter',
    description: `Find the 2 most similar documents to the query vector, but ONLY from the "tech-support" category. Use knn with a filter:
{
  "knn": {
    "field": "embedding",
    "query_vector": ${JSON.stringify(generalVec)},
    "k": 2,
    "num_candidates": 10,
    "filter": { "term": { "category": "tech-support" } }
  }
}

This pre-filters candidates before computing similarity.`,
    hints: ['Add a filter inside the knn parameter', 'This restricts kNN candidates to a subset'],
    indexName: 'eq-kb',
    mapping: { properties: { title: { type: 'text' }, content: { type: 'text' }, category: { type: 'keyword' }, embedding: { type: 'dense_vector', dims: 8, similarity: 'cosine' } } },
    seedData: [
      { _id: '1', _index: 'eq-kb', _source: { title: 'Password Reset', content: 'Reset your password.', category: 'tech-support', embedding: techVec } },
      { _id: '2', _index: 'eq-kb', _source: { title: 'Connection Issues', content: 'Troubleshoot.', category: 'tech-support', embedding: techVec.map((v) => v + 0.05) } },
      { _id: '3', _index: 'eq-kb', _source: { title: 'Pricing', content: 'Pricing info.', category: 'product', embedding: productVec } },
      { _id: '4', _index: 'eq-kb', _source: { title: 'FAQ', content: 'General FAQ.', category: 'general', embedding: generalVec } },
      { _id: '5', _index: 'eq-kb', _source: { title: 'API Limits', content: 'Rate limits.', category: 'tech-support', embedding: techVec.map((v) => v + 0.1) } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      const hitIds = response.hits.hits.map((h) => h._id);
      // Only tech-support docs: 1, 2, 5. k=2 so closest 2 to generalVec among those.
      let score = 0;
      if (hitIds.length === 2) score += 30;
      const allTechSupport = hitIds.every((id) => ['1', '2', '5'].includes(id));
      if (allTechSupport) score += 50;
      if (hitIds.length === 2 && allTechSupport) score += 20;
      const correct = hitIds.length === 2 && allTechSupport;
      return { correct, score: Math.min(100, score), maxScore: 100, feedback: correct ? 'kNN with filter returned 2 tech-support docs.' : `Expected 2 tech-support docs. Got ${hitIds.length} docs: [${hitIds.join(',')}].` };
    },
    maxScore: 100,
    timeLimitMs: 45000,
  },

  {
    id: 'vec-3-hybrid',
    domain: 'vector-search',
    difficulty: 'advanced',
    title: 'Hybrid Text + Vector Search',
    description: `Combine kNN with text search. Find documents that are:
1. Semantically similar to: ${JSON.stringify(techVec)} (knn, k=3)
2. AND contain "password" in the "content" field (query.bool.must.match)

Use both "knn" and "query" at the top level.`,
    hints: ['Include both knn and query at top level', 'ES combines scores from both'],
    indexName: 'eq-kb',
    mapping: { properties: { title: { type: 'text' }, content: { type: 'text' }, category: { type: 'keyword' }, embedding: { type: 'dense_vector', dims: 8, similarity: 'cosine' } } },
    seedData: [
      { _id: '1', _index: 'eq-kb', _source: { title: 'Password Reset', content: 'Follow these steps to reset your account password securely.', category: 'tech-support', embedding: techVec } },
      { _id: '2', _index: 'eq-kb', _source: { title: 'Connection Issues', content: 'Troubleshoot connection problems.', category: 'tech-support', embedding: techVec.map((v) => v + 0.05) } },
      { _id: '3', _index: 'eq-kb', _source: { title: 'Password Security', content: 'Use a strong password with 12+ characters.', category: 'security', embedding: productVec } },
      { _id: '4', _index: 'eq-kb', _source: { title: 'Billing', content: 'Your billing cycle.', category: 'billing', embedding: billingVec } },
      { _id: '5', _index: 'eq-kb', _source: { title: 'API Auth', content: 'Use API keys instead of password-based auth.', category: 'tech-support', embedding: techVec.map((v) => v + 0.1) } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      const hitIds = response.hits.hits.map((h) => h._id);
      let score = 0;
      if (hitIds.includes('1')) score += 40;
      if (hitIds[0] === '1') score += 20;
      if (hitIds.includes('5')) score += 20;
      if (hitIds.includes('3')) score += 10;
      const unrelated = hitIds.filter((id) => !['1', '3', '5'].includes(id));
      score -= unrelated.length * 10;
      const correct = hitIds.includes('1') && score >= 70;
      return { correct, score: Math.max(0, Math.min(100, score)), maxScore: 100, feedback: correct ? 'Hybrid search correctly combined vector similarity with text.' : `Score: ${Math.max(0, score)}/100. Doc 1 (password + matching vector) should appear.` };
    },
    maxScore: 100,
    timeLimitMs: 60000,
  },

  {
    id: 'vec-4-semantic-category',
    domain: 'vector-search',
    difficulty: 'expert',
    title: 'Semantic Search with Aggregation',
    description: `Perform kNN search to find the 5 most similar documents to:
${JSON.stringify(techVec)}

Then aggregate the results by "category" (terms agg named "categories") to see which categories the similar documents belong to.`,
    hints: ['Use knn at top level with k=5', 'Add aggs block with terms on category'],
    indexName: 'eq-kb',
    mapping: { properties: { title: { type: 'text' }, content: { type: 'text' }, category: { type: 'keyword' }, embedding: { type: 'dense_vector', dims: 8, similarity: 'cosine' } } },
    seedData: [
      { _id: '1', _index: 'eq-kb', _source: { title: 'Password Reset', content: 'Reset password.', category: 'tech-support', embedding: techVec } },
      { _id: '2', _index: 'eq-kb', _source: { title: 'Connection Fix', content: 'Fix connections.', category: 'tech-support', embedding: techVec.map((v) => v + 0.05) } },
      { _id: '3', _index: 'eq-kb', _source: { title: 'API Limits', content: 'Rate limits.', category: 'tech-support', embedding: techVec.map((v) => v + 0.1) } },
      { _id: '4', _index: 'eq-kb', _source: { title: 'Pricing', content: 'Pricing tiers.', category: 'product', embedding: productVec } },
      { _id: '5', _index: 'eq-kb', _source: { title: 'Billing', content: 'Billing info.', category: 'billing', embedding: billingVec } },
      { _id: '6', _index: 'eq-kb', _source: { title: 'FAQ', content: 'General FAQ.', category: 'general', embedding: generalVec } },
      { _id: '7', _index: 'eq-kb', _source: { title: 'Setup Guide', content: 'Setup guide.', category: 'tech-support', embedding: techVec.map((v) => v + 0.15) } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      let score = 0;
      if (response.hits.hits.length === 5) score += 20;
      const catAgg = response.aggregations?.categories;
      if (!catAgg?.buckets) return { correct: false, score, maxScore: 100, feedback: 'Missing "categories" aggregation on kNN results.' };
      score += 30;
      // Most results should be tech-support
      const techBucket = catAgg.buckets.find((b) => b.key === 'tech-support');
      if (techBucket && techBucket.doc_count >= 3) score += 30;
      if (catAgg.buckets.length >= 1) score += 20;
      const correct = score >= 80;
      return { correct, score: Math.min(100, score), maxScore: 100, feedback: correct ? 'kNN + aggregation shows tech-support dominates similar docs.' : `Score: ${score}/100. Combine knn with aggs.` };
    },
    maxScore: 100,
    timeLimitMs: 60000,
  },
];
