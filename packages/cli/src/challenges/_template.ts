/**
 * Challenge Template — Copy this file to create a new challenge.
 *
 * 1. Copy this file to packages/cli/src/challenges/<domain>/<id>.ts
 *    (or directly to packages/cli/src/challenges/<id>.ts)
 *
 * 2. Fix imports based on file location:
 *    - If in a subdirectory: import from '../../types' and '../helpers'
 *    - If in challenges root: imports below are already correct
 *
 * 3. Register it in packages/cli/src/challenges/index.ts:
 *    import { challenge as myChallenge } from './<domain>/<id>';
 *    // Add to individualChallenges array
 *
 * 4. Run: npm test -w packages/cli
 */
import type { Challenge, SearchResponse, ElasticBackend } from '../types';
import { scoreHits } from './helpers';

export const challenge: Challenge = {
  // Unique ID: <domain-prefix>-<number>-<short-name>
  // Examples: fts-15-synonym, aggs-11-composite, sec-6-lateral-movement
  id: 'CHANGE-ME',

  // Domain: full-text-search | ingest-indexing | aggregations | observability | vector-search | security
  domain: 'full-text-search',

  // Difficulty: beginner | intermediate | advanced | expert
  difficulty: 'intermediate',

  // Human-readable title (shown to the model)
  title: 'My Challenge Title',

  // Full description of what the model should do.
  // Be specific about expected behavior. The model sees this text.
  description: `Describe the challenge here. Include:
- What data is in the index
- What the query should find
- Any specific requirements (sort order, size, etc.)`,

  // Hints to help the model (shown alongside description)
  hints: [
    'First hint about which query type to use',
    'Second hint about specific parameters',
  ],

  // Index name (must start with "eq-")
  indexName: 'eq-my-index',

  // Elasticsearch mapping for the index
  mapping: {
    properties: {
      title: { type: 'text' },
      category: { type: 'keyword' },
      price: { type: 'float' },
    },
  },

  // Seed documents (5-8 docs is ideal)
  // Include documents that SHOULD match and ones that SHOULDN'T (to test precision)
  seedData: [
    { _id: '1', _index: 'eq-my-index', _source: { title: 'First Item', category: 'A', price: 10 } },
    { _id: '2', _index: 'eq-my-index', _source: { title: 'Second Item', category: 'B', price: 20 } },
    { _id: '3', _index: 'eq-my-index', _source: { title: 'Third Item', category: 'A', price: 30 } },
  ],

  // Validation function: receives the search response and returns a score.
  // Use helpers from '../helpers' to simplify scoring.
  validate: async (
    response: SearchResponse,
    _backend: ElasticBackend,
  ): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
    // Example: check that docs 1 and 3 are returned (category A)
    return scoreHits(response, ['1', '3']);
  },

  maxScore: 100,
  timeLimitMs: 30000, // 30s for beginner/intermediate, 45-60s for advanced/expert
};
