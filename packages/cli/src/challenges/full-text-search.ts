import type { Challenge, SearchResponse, ElasticBackend, EsqlResponse } from '../types';
import { validateEsqlChallenge } from './esql-helpers';

export const fullTextSearchChallenges: Challenge[] = [
  // --- BEGINNER ---
  {
    id: 'fts-1-basic-match',
    domain: 'full-text-search',
    difficulty: 'beginner',
    title: 'Find the Articles',
    description: `You have an index of blog articles. Write a query to find all articles that mention "elasticsearch" in the title or body field. Return them sorted by relevance.`,
    hints: [
      'Use a multi_match query to search across multiple fields',
      'The fields are "title" and "body"',
    ],
    esqlHints: [
      'Use MATCH or QSTR to search across text fields',
      'The fields are "title" and "body"',
    ],
    indexName: 'eq-articles',
    mapping: {
      properties: {
        title: { type: 'text', analyzer: 'standard' },
        body: { type: 'text', analyzer: 'standard' },
        author: { type: 'keyword' },
        published_date: { type: 'date' },
        tags: { type: 'keyword' },
      },
    },
    seedData: [
      { _id: '1', _index: 'eq-articles', _source: { title: 'Getting Started with Elasticsearch', body: 'Elasticsearch is a distributed search engine built on Apache Lucene. It provides full-text search capabilities.', author: 'alice', published_date: '2024-01-15', tags: ['elasticsearch', 'tutorial'] } },
      { _id: '2', _index: 'eq-articles', _source: { title: 'Introduction to Kibana', body: 'Kibana is a visualization tool that works with Elasticsearch to display your data.', author: 'bob', published_date: '2024-02-01', tags: ['kibana', 'visualization'] } },
      { _id: '3', _index: 'eq-articles', _source: { title: 'Advanced Elasticsearch Queries', body: 'Learn about bool queries, function score, and other advanced Elasticsearch query DSL features.', author: 'alice', published_date: '2024-03-10', tags: ['elasticsearch', 'advanced'] } },
      { _id: '4', _index: 'eq-articles', _source: { title: 'Docker for Beginners', body: 'Learn how to containerize your applications using Docker and docker-compose.', author: 'charlie', published_date: '2024-01-20', tags: ['docker', 'devops'] } },
      { _id: '5', _index: 'eq-articles', _source: { title: 'Logstash Pipeline Design', body: 'Logstash is a data processing pipeline that ingests data and sends it to Elasticsearch.', author: 'bob', published_date: '2024-04-05', tags: ['logstash', 'pipeline'] } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      const hitIds = response.hits.hits.map((h) => h._id);
      const expectedIds = ['1', '2', '3', '5'];
      const found = expectedIds.filter((id) => hitIds.includes(id));
      const falsePositives = hitIds.filter((id) => !expectedIds.includes(id));
      const correct = found.length === expectedIds.length && falsePositives.length === 0;
      const score = Math.floor((found.length / expectedIds.length) * 80) - falsePositives.length * 10;
      return {
        correct,
        score: Math.max(0, score),
        maxScore: 100,
        feedback: correct
          ? 'All elasticsearch-related articles found with no false positives.'
          : `Found ${found.length}/${expectedIds.length} relevant articles. ${falsePositives.length} false positive(s).`,
      };
    },
    validateEsql: async (response: EsqlResponse, query: string) => {
      return validateEsqlChallenge(response, query, {
        requiredPatterns: [
          { pattern: /\bFROM\b/i, points: 30, label: 'FROM' },
          { pattern: /elasticsearch/i, points: 40, label: 'search term' },
        ],
        expectedRowCount: 4,
        rowCountTolerance: 1,
      });
    },
    maxScore: 100,
    timeLimitMs: 30000,
  },
  {
    id: 'fts-2-simple-term',
    domain: 'full-text-search',
    difficulty: 'beginner',
    title: 'Exact Category Match',
    description: `Find all articles written by the author "alice". The author field is a keyword field, so use an exact match query.`,
    hints: [
      'Use a term query for exact matching on keyword fields',
      'term queries are not analyzed - the value must match exactly',
    ],
    esqlHints: [
      'Use WHERE with == for exact matching on keyword fields',
      'The value must match exactly — keyword fields are not analyzed',
    ],
    indexName: 'eq-articles',
    mapping: {
      properties: {
        title: { type: 'text' },
        body: { type: 'text' },
        author: { type: 'keyword' },
        published_date: { type: 'date' },
        tags: { type: 'keyword' },
      },
    },
    seedData: [
      { _id: '1', _index: 'eq-articles', _source: { title: 'Getting Started with Elasticsearch', body: 'A guide to ES.', author: 'alice', published_date: '2024-01-15', tags: ['elasticsearch'] } },
      { _id: '2', _index: 'eq-articles', _source: { title: 'Kibana Tips', body: 'Using Kibana.', author: 'bob', published_date: '2024-02-01', tags: ['kibana'] } },
      { _id: '3', _index: 'eq-articles', _source: { title: 'Advanced Queries', body: 'Bool queries.', author: 'alice', published_date: '2024-03-10', tags: ['elasticsearch'] } },
      { _id: '4', _index: 'eq-articles', _source: { title: 'Docker Guide', body: 'Containers.', author: 'charlie', published_date: '2024-01-20', tags: ['docker'] } },
      { _id: '5', _index: 'eq-articles', _source: { title: 'Search Patterns', body: 'Patterns in ES.', author: 'alice', published_date: '2024-04-05', tags: ['elasticsearch'] } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      const hitIds = response.hits.hits.map((h) => h._id);
      const expectedIds = ['1', '3', '5'];
      const found = expectedIds.filter((id) => hitIds.includes(id));
      const falsePositives = hitIds.filter((id) => !expectedIds.includes(id));
      const correct = found.length === expectedIds.length && falsePositives.length === 0;
      const score = Math.floor((found.length / expectedIds.length) * 85) - falsePositives.length * 15;
      return { correct, score: Math.max(0, score), maxScore: 100, feedback: correct ? 'Found all articles by alice.' : `Found ${found.length}/${expectedIds.length}. ${falsePositives.length} false positives.` };
    },
    validateEsql: async (response: EsqlResponse, query: string) => {
      return validateEsqlChallenge(response, query, {
        requiredPatterns: [
          { pattern: /\bFROM\b/i, points: 30, label: 'FROM' },
          { pattern: /\bWHERE\b/i, points: 30, label: 'WHERE' },
          { pattern: /author\b.*==?\s*"alice"/i, points: 30, label: 'author filter' },
        ],
        expectedRowCount: 3,
      });
    },
    maxScore: 100,
    timeLimitMs: 30000,
  },
  {
    id: 'fts-3-match-with-operator',
    domain: 'full-text-search',
    difficulty: 'beginner',
    title: 'Match All Terms',
    description: `Find articles where the body contains BOTH the words "search" AND "engine". Use a match query with the "and" operator on the "body" field.`,
    hints: [
      'Use a match query with operator: "and"',
      'This ensures all terms must be present',
    ],
    esqlHints: [
      'Use MATCH with {"operator": "AND"} to require all terms',
      'This ensures both words must be present in the field',
    ],
    indexName: 'eq-articles',
    mapping: {
      properties: {
        title: { type: 'text' },
        body: { type: 'text' },
        author: { type: 'keyword' },
      },
    },
    seedData: [
      { _id: '1', _index: 'eq-articles', _source: { title: 'ES Intro', body: 'Elasticsearch is a powerful search engine for full-text queries.', author: 'alice' } },
      { _id: '2', _index: 'eq-articles', _source: { title: 'Redis', body: 'Redis is an in-memory data store, not a search tool.', author: 'bob' } },
      { _id: '3', _index: 'eq-articles', _source: { title: 'Solr Guide', body: 'Apache Solr is another search engine built on Lucene.', author: 'charlie' } },
      { _id: '4', _index: 'eq-articles', _source: { title: 'Databases', body: 'SQL databases use query engines internally.', author: 'dave' } },
      { _id: '5', _index: 'eq-articles', _source: { title: 'Lucene', body: 'Lucene is the core engine behind many search platforms.', author: 'eve' } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      const hitIds = response.hits.hits.map((h) => h._id);
      const expectedIds = ['1', '3', '5']; // body contains both "search" and "engine"
      const found = expectedIds.filter((id) => hitIds.includes(id));
      const falsePositives = hitIds.filter((id) => !expectedIds.includes(id));
      const correct = found.length === expectedIds.length && falsePositives.length === 0;
      const score = Math.floor((found.length / expectedIds.length) * 85) - falsePositives.length * 15;
      return { correct, score: Math.max(0, score), maxScore: 100, feedback: correct ? 'Found all articles containing both "search" and "engine".' : `Found ${found.length}/${expectedIds.length}. ${falsePositives.length} false positives.` };
    },
    validateEsql: async (response: EsqlResponse, query: string) => {
      return validateEsqlChallenge(response, query, {
        requiredPatterns: [
          { pattern: /\bFROM\b/i, points: 20, label: 'FROM' },
          { pattern: /search/i, points: 20, label: 'search term' },
          { pattern: /engine/i, points: 20, label: 'engine term' },
        ],
        expectedRowCount: 3,
        rowCountTolerance: 1,
      });
    },
    maxScore: 100,
    timeLimitMs: 30000,
  },

  // --- INTERMEDIATE ---
  {
    id: 'fts-4-bool-query',
    domain: 'full-text-search',
    difficulty: 'intermediate',
    title: 'Filtered Search',
    description: `Search for articles that:
- MUST contain "elasticsearch" in the title or body
- MUST be authored by "alice"
- SHOULD have the tag "tutorial" (for relevance boosting)

Return matching documents.`,
    hints: [
      'Use a bool query with must, should, and filter clauses',
      'Use a term query to filter by exact keyword fields like author and tags',
    ],
    esqlHints: [
      'Combine conditions with AND in WHERE for required filters',
      'Use == for exact matching on keyword fields like author',
    ],
    indexName: 'eq-articles',
    mapping: {
      properties: {
        title: { type: 'text', analyzer: 'standard' },
        body: { type: 'text', analyzer: 'standard' },
        author: { type: 'keyword' },
        published_date: { type: 'date' },
        tags: { type: 'keyword' },
      },
    },
    seedData: [
      { _id: '1', _index: 'eq-articles', _source: { title: 'Getting Started with Elasticsearch', body: 'Elasticsearch is a distributed search engine built on Apache Lucene.', author: 'alice', published_date: '2024-01-15', tags: ['elasticsearch', 'tutorial'] } },
      { _id: '2', _index: 'eq-articles', _source: { title: 'Introduction to Kibana', body: 'Kibana works with Elasticsearch.', author: 'bob', published_date: '2024-02-01', tags: ['kibana'] } },
      { _id: '3', _index: 'eq-articles', _source: { title: 'Advanced Elasticsearch Queries', body: 'Learn about bool queries and advanced Elasticsearch features.', author: 'alice', published_date: '2024-03-10', tags: ['elasticsearch', 'advanced'] } },
      { _id: '4', _index: 'eq-articles', _source: { title: 'Docker for Beginners', body: 'Containerize your applications.', author: 'alice', published_date: '2024-01-20', tags: ['docker'] } },
      { _id: '5', _index: 'eq-articles', _source: { title: 'Logstash Pipeline Design', body: 'Logstash sends data to Elasticsearch.', author: 'bob', published_date: '2024-04-05', tags: ['logstash'] } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      const hitIds = response.hits.hits.map((h) => h._id);
      const expectedIds = ['1', '3'];
      const found = expectedIds.filter((id) => hitIds.includes(id));
      const falsePositives = hitIds.filter((id) => !expectedIds.includes(id));
      const correct = found.length === expectedIds.length && falsePositives.length === 0;
      const hasRelevanceBoost = hitIds.indexOf('1') < hitIds.indexOf('3');
      const bonusScore = hasRelevanceBoost ? 20 : 0;
      const baseScore = Math.floor((found.length / expectedIds.length) * 80) - falsePositives.length * 15;
      return {
        correct,
        score: Math.max(0, Math.min(100, baseScore + bonusScore)),
        maxScore: 100,
        feedback: correct
          ? `Correct! Found Alice's Elasticsearch articles.${hasRelevanceBoost ? ' Bonus: tutorial-tagged article ranked first.' : ''}`
          : `Found ${found.length}/${expectedIds.length} expected articles. ${falsePositives.length} false positive(s).`,
      };
    },
    validateEsql: async (response: EsqlResponse, query: string) => {
      return validateEsqlChallenge(response, query, {
        requiredPatterns: [
          { pattern: /\bFROM\b/i, points: 15, label: 'FROM' },
          { pattern: /\bWHERE\b/i, points: 20, label: 'WHERE' },
          { pattern: /alice/i, points: 20, label: 'alice filter' },
          { pattern: /elasticsearch/i, points: 20, label: 'elasticsearch search' },
        ],
        expectedRowCount: 2,
      });
    },
    maxScore: 100,
    timeLimitMs: 45000,
  },
  {
    id: 'fts-5-must-not',
    domain: 'full-text-search',
    difficulty: 'intermediate',
    title: 'Exclusion Query',
    description: `Find all articles that mention "data" in the body but are NOT in the "devops" category (tags field). Use a bool query with must and must_not.`,
    hints: [
      'Use bool.must for the match on body',
      'Use bool.must_not with a term query on tags',
    ],
    esqlHints: [
      'Use WHERE with MATCH or LIKE for text search on body',
      'Use AND NOT or != to exclude specific tag values',
    ],
    indexName: 'eq-articles',
    mapping: {
      properties: {
        title: { type: 'text' },
        body: { type: 'text' },
        tags: { type: 'keyword' },
      },
    },
    seedData: [
      { _id: '1', _index: 'eq-articles', _source: { title: 'Data Pipelines', body: 'Build efficient data pipelines with Logstash.', tags: ['data-engineering'] } },
      { _id: '2', _index: 'eq-articles', _source: { title: 'CI/CD with Data', body: 'Continuous integration for data services.', tags: ['devops'] } },
      { _id: '3', _index: 'eq-articles', _source: { title: 'Elasticsearch Data', body: 'Store and search your data with Elasticsearch.', tags: ['search'] } },
      { _id: '4', _index: 'eq-articles', _source: { title: 'Kubernetes', body: 'Container orchestration for microservices.', tags: ['devops'] } },
      { _id: '5', _index: 'eq-articles', _source: { title: 'Analytics', body: 'Analyze your data with aggregations.', tags: ['analytics'] } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      const hitIds = response.hits.hits.map((h) => h._id);
      const expectedIds = ['1', '3', '5']; // has "data" in body, NOT devops
      const found = expectedIds.filter((id) => hitIds.includes(id));
      const falsePositives = hitIds.filter((id) => !expectedIds.includes(id));
      const correct = found.length === expectedIds.length && falsePositives.length === 0;
      const score = Math.floor((found.length / expectedIds.length) * 85) - falsePositives.length * 15;
      return { correct, score: Math.max(0, score), maxScore: 100, feedback: correct ? 'Correct! Found data articles excluding devops.' : `Found ${found.length}/${expectedIds.length}. ${falsePositives.length} false positives.` };
    },
    validateEsql: async (response: EsqlResponse, query: string) => {
      return validateEsqlChallenge(response, query, {
        requiredPatterns: [
          { pattern: /\bFROM\b/i, points: 15, label: 'FROM' },
          { pattern: /\bWHERE\b/i, points: 20, label: 'WHERE' },
          { pattern: /data/i, points: 15, label: 'data search' },
          { pattern: /devops/i, points: 15, label: 'devops exclusion' },
          { pattern: /\bNOT\b|!=|<>/i, points: 20, label: 'NOT/exclusion' },
        ],
        expectedRowCount: 3,
      });
    },
    maxScore: 100,
    timeLimitMs: 45000,
  },
  {
    id: 'fts-6-multi-match-boosting',
    domain: 'full-text-search',
    difficulty: 'intermediate',
    title: 'Field Boosting',
    description: `Search for "security best practices" across title (boosted 3x) and body fields. The title field should be weighted higher. Return the top 3 results.

Use multi_match with fields: ["title^3", "body"].`,
    hints: [
      'Use multi_match with field boosting: title^3',
      'Set size: 3 to limit results',
    ],
    esqlHints: [
      'Use MATCH or QSTR with field boosting for relevance ranking',
      'Use LIMIT 3 to return only the top results',
    ],
    indexName: 'eq-articles',
    mapping: {
      properties: {
        title: { type: 'text' },
        body: { type: 'text' },
        category: { type: 'keyword' },
      },
    },
    seedData: [
      { _id: '1', _index: 'eq-articles', _source: { title: 'Security Best Practices for Elasticsearch', body: 'Learn how to secure your cluster.', category: 'security' } },
      { _id: '2', _index: 'eq-articles', _source: { title: 'Cluster Management', body: 'Security best practices include enabling TLS and authentication.', category: 'ops' } },
      { _id: '3', _index: 'eq-articles', _source: { title: 'Network Security Guide', body: 'Best practices for securing your network infrastructure.', category: 'security' } },
      { _id: '4', _index: 'eq-articles', _source: { title: 'Docker Tips', body: 'Some tips for running containers safely.', category: 'devops' } },
      { _id: '5', _index: 'eq-articles', _source: { title: 'Best Practices for Indexing', body: 'Optimize your indexing security and performance.', category: 'performance' } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      const hits = response.hits.hits;
      let score = 0;
      if (hits.length <= 3) score += 20;
      // Doc 1 has best title match, should rank first
      if (hits.length > 0 && hits[0]._id === '1') score += 40;
      // Docs 2, 3, 5 all mention security/best/practices
      const relevantIds = ['1', '2', '3', '5'];
      const found = hits.filter((h) => relevantIds.includes(h._id));
      score += found.length * 10;
      const correct = hits.length <= 3 && hits.length > 0 && hits[0]._id === '1';
      return { correct, score: Math.min(100, score), maxScore: 100, feedback: correct ? 'Correct! Title-boosted results rank the best title match first.' : `Doc 1 should rank first (best title match). Got: ${hits.map((h) => h._id).join(', ')}` };
    },
    validateEsql: async (response: EsqlResponse, query: string) => {
      return validateEsqlChallenge(response, query, {
        requiredPatterns: [
          { pattern: /\bFROM\b/i, points: 20, label: 'FROM' },
          { pattern: /security/i, points: 20, label: 'security term' },
          { pattern: /best\s*practices/i, points: 20, label: 'best practices term' },
          { pattern: /\bLIMIT\s+3\b/i, points: 20, label: 'LIMIT 3' },
        ],
        expectedRowCount: 3,
        rowCountTolerance: 1,
      });
    },
    maxScore: 100,
    timeLimitMs: 45000,
  },

  // --- ADVANCED ---
  {
    id: 'fts-7-phrase-and-range',
    domain: 'full-text-search',
    difficulty: 'advanced',
    title: 'Precise Phrase Search with Date Range',
    description: `Find articles that:
- Contain the exact phrase "distributed search" in the body
- Were published between 2024-01-01 and 2024-03-01 (inclusive)

Use a bool query combining a match_phrase and range query.`,
    hints: [
      'Use match_phrase for exact phrase matching in the body field',
      'Use a range query with gte and lte on published_date',
      'Combine them with a bool must clause',
    ],
    esqlHints: [
      'Use MATCH_PHRASE for exact phrase matching on the body field',
      'Use WHERE with >= and <= on published_date for the date range',
      'Combine text search and date filter with AND in WHERE',
    ],
    indexName: 'eq-articles',
    mapping: {
      properties: {
        title: { type: 'text' },
        body: { type: 'text' },
        author: { type: 'keyword' },
        published_date: { type: 'date' },
      },
    },
    seedData: [
      { _id: '1', _index: 'eq-articles', _source: { title: 'Getting Started with Elasticsearch', body: 'Elasticsearch is a distributed search engine built on Lucene.', author: 'alice', published_date: '2024-01-15' } },
      { _id: '2', _index: 'eq-articles', _source: { title: 'Distributed Systems', body: 'A distributed search architecture requires careful planning.', author: 'bob', published_date: '2024-02-20' } },
      { _id: '3', _index: 'eq-articles', _source: { title: 'Advanced Queries', body: 'Learn about distributed search patterns and best practices.', author: 'alice', published_date: '2024-04-10' } },
      { _id: '4', _index: 'eq-articles', _source: { title: 'MongoDB Guide', body: 'MongoDB is a document database, not a distributed search tool.', author: 'charlie', published_date: '2024-02-28' } },
      { _id: '5', _index: 'eq-articles', _source: { title: 'Redis Caching', body: 'Redis provides fast in-memory data storage.', author: 'dave', published_date: '2024-01-05' } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      const hitIds = response.hits.hits.map((h) => h._id);
      const expectedIds = ['1', '2', '4'];
      const found = expectedIds.filter((id) => hitIds.includes(id));
      const falsePositives = hitIds.filter((id) => !expectedIds.includes(id));
      const correct = found.length === expectedIds.length && falsePositives.length === 0;
      const score = Math.floor((found.length / expectedIds.length) * 85) - falsePositives.length * 15;
      return { correct, score: Math.max(0, Math.min(100, score)), maxScore: 100, feedback: correct ? 'Found all articles with "distributed search" within the date range.' : `Found ${found.length}/${expectedIds.length}. ${falsePositives.length} false positives. match_phrase requires words to appear together.` };
    },
    validateEsql: async (response: EsqlResponse, query: string) => {
      return validateEsqlChallenge(response, query, {
        requiredPatterns: [
          { pattern: /\bFROM\b/i, points: 15, label: 'FROM' },
          { pattern: /\bWHERE\b/i, points: 20, label: 'WHERE' },
          { pattern: /distributed\s+search/i, points: 25, label: 'search terms' },
          { pattern: /2024/i, points: 15, label: 'date filter' },
        ],
        expectedRowCount: 3,
        rowCountTolerance: 1,
      });
    },
    maxScore: 100,
    timeLimitMs: 45000,
  },
  {
    id: 'fts-8-wildcard-exists',
    domain: 'full-text-search',
    difficulty: 'advanced',
    title: 'Wildcard and Exists Queries',
    description: `Find all products where:
- The "sku" field matches the pattern "ELEC-*" (starts with ELEC-)
- The "description" field exists (is not missing/null)

Use a bool query with wildcard and exists clauses.`,
    hints: [
      'Use a wildcard query on the sku field with value "ELEC-*"',
      'Use an exists query to check that description is present',
    ],
    esqlHints: [
      'Use LIKE or STARTS_WITH on the sku field to match the prefix pattern',
      'Use IS NOT NULL to check that the description field exists',
    ],
    indexName: 'eq-products',
    mapping: {
      properties: {
        name: { type: 'text' },
        sku: { type: 'keyword' },
        description: { type: 'text' },
        price: { type: 'float' },
      },
    },
    seedData: [
      { _id: '1', _index: 'eq-products', _source: { name: 'Laptop', sku: 'ELEC-001', description: 'A powerful laptop.', price: 999 } },
      { _id: '2', _index: 'eq-products', _source: { name: 'Desk', sku: 'FURN-001', description: 'A standing desk.', price: 499 } },
      { _id: '3', _index: 'eq-products', _source: { name: 'Mouse', sku: 'ELEC-002', price: 29 } },
      { _id: '4', _index: 'eq-products', _source: { name: 'Monitor', sku: 'ELEC-003', description: 'A 4K monitor.', price: 399 } },
      { _id: '5', _index: 'eq-products', _source: { name: 'Chair', sku: 'FURN-002', description: 'Ergonomic chair.', price: 599 } },
      { _id: '6', _index: 'eq-products', _source: { name: 'Keyboard', sku: 'ELEC-004', description: 'Mechanical keyboard.', price: 89 } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      const hitIds = response.hits.hits.map((h) => h._id);
      const expectedIds = ['1', '4', '6']; // ELEC-* with description
      const found = expectedIds.filter((id) => hitIds.includes(id));
      const falsePositives = hitIds.filter((id) => !expectedIds.includes(id));
      const correct = found.length === expectedIds.length && falsePositives.length === 0;
      const score = Math.floor((found.length / expectedIds.length) * 85) - falsePositives.length * 15;
      return { correct, score: Math.max(0, score), maxScore: 100, feedback: correct ? 'Found all ELEC-* products with descriptions.' : `Found ${found.length}/${expectedIds.length}. ${falsePositives.length} false positives. Doc 3 (Mouse) has no description.` };
    },
    validateEsql: async (response: EsqlResponse, query: string) => {
      return validateEsqlChallenge(response, query, {
        requiredPatterns: [
          { pattern: /\bFROM\b/i, points: 15, label: 'FROM' },
          { pattern: /\bWHERE\b/i, points: 20, label: 'WHERE' },
          { pattern: /ELEC/i, points: 20, label: 'ELEC prefix' },
          { pattern: /\b(LIKE|STARTS_WITH|RLIKE)\b|description\s+IS\s+NOT\s+NULL/i, points: 20, label: 'wildcard/exists' },
        ],
        expectedRowCount: 3,
      });
    },
    maxScore: 100,
    timeLimitMs: 45000,
  },

  // --- EXPERT ---
  {
    id: 'fts-9-complex-bool',
    domain: 'full-text-search',
    difficulty: 'expert',
    title: 'Complex Multi-Condition Search',
    description: `Build a complex search for job listings. Find jobs that:
- MUST match "engineer" in the "title" field
- MUST have "remote" as true (boolean field)
- MUST NOT have salary_max below 100000
- SHOULD match "python" in the "skills" field (boost relevance)
- SHOULD match "elasticsearch" in the "skills" field (boost relevance)
- Filter to only "engineering" department`,
    hints: [
      'Use a bool query with must, must_not, should, and filter',
      'Use term for boolean and keyword fields, range for salary_max',
      'must_not with range: salary_max lt 100000 excludes low-salary jobs',
    ],
    esqlHints: [
      'Combine required conditions with AND in WHERE (text match, boolean, range, keyword)',
      'For optional relevance boosting, use QSTR with Lucene syntax (+field:required field:optional^boost)',
      'salary_max >= 100000 excludes low-salary jobs',
    ],
    indexName: 'eq-jobs',
    mapping: {
      properties: {
        title: { type: 'text' },
        department: { type: 'keyword' },
        skills: { type: 'text' },
        salary_max: { type: 'integer' },
        remote: { type: 'boolean' },
        location: { type: 'keyword' },
      },
    },
    seedData: [
      { _id: '1', _index: 'eq-jobs', _source: { title: 'Senior Software Engineer', department: 'engineering', skills: 'python elasticsearch java', salary_max: 180000, remote: true, location: 'US' } },
      { _id: '2', _index: 'eq-jobs', _source: { title: 'Data Engineer', department: 'engineering', skills: 'python spark sql', salary_max: 150000, remote: true, location: 'US' } },
      { _id: '3', _index: 'eq-jobs', _source: { title: 'DevOps Engineer', department: 'engineering', skills: 'kubernetes docker terraform', salary_max: 160000, remote: false, location: 'UK' } },
      { _id: '4', _index: 'eq-jobs', _source: { title: 'Junior Engineer', department: 'engineering', skills: 'python javascript', salary_max: 80000, remote: true, location: 'US' } },
      { _id: '5', _index: 'eq-jobs', _source: { title: 'Product Manager', department: 'product', skills: 'agile roadmap', salary_max: 170000, remote: true, location: 'US' } },
      { _id: '6', _index: 'eq-jobs', _source: { title: 'Search Engineer', department: 'engineering', skills: 'elasticsearch lucene python', salary_max: 175000, remote: true, location: 'EU' } },
      { _id: '7', _index: 'eq-jobs', _source: { title: 'ML Engineer', department: 'engineering', skills: 'python tensorflow pytorch', salary_max: 200000, remote: true, location: 'US' } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      const hitIds = response.hits.hits.map((h) => h._id);
      // engineer in title + remote=true + salary_max>=100000 + engineering dept: 1, 2, 6, 7
      const expectedIds = ['1', '2', '6', '7'];
      const found = expectedIds.filter((id) => hitIds.includes(id));
      const falsePositives = hitIds.filter((id) => !expectedIds.includes(id));
      const correctContent = found.length === expectedIds.length && falsePositives.length === 0;

      let score = Math.floor((found.length / expectedIds.length) * 70) - falsePositives.length * 10;
      // Bonus: docs with python+elasticsearch should rank higher (1, 6)
      if (hitIds.length >= 2) {
        const topTwo = hitIds.slice(0, 2);
        if (topTwo.includes('1') && topTwo.includes('6')) score += 30;
        else if (topTwo.includes('1') || topTwo.includes('6')) score += 15;
      }

      return { correct: correctContent, score: Math.max(0, Math.min(100, score)), maxScore: 100, feedback: correctContent ? 'Complex bool query returned correct results.' : `Found ${found.length}/${expectedIds.length}. ${falsePositives.length} false positives. Check: remote=true, salary>=100k, dept=engineering, title has "engineer".` };
    },
    validateEsql: async (response: EsqlResponse, query: string) => {
      return validateEsqlChallenge(response, query, {
        requiredPatterns: [
          { pattern: /\bFROM\b/i, points: 10, label: 'FROM' },
          { pattern: /\bWHERE\b/i, points: 15, label: 'WHERE' },
          { pattern: /engineer/i, points: 15, label: 'engineer filter' },
          { pattern: /remote/i, points: 15, label: 'remote filter' },
          { pattern: /100000|100_000/i, points: 15, label: 'salary filter' },
          { pattern: /engineering/i, points: 15, label: 'department filter' },
        ],
        expectedRowCount: 4,
        rowCountTolerance: 1,
      });
    },
    maxScore: 100,
    timeLimitMs: 60000,
  },

  // --- MORE ADVANCED/EXPERT ---
  {
    id: 'fts-10-fuzzy',
    domain: 'full-text-search',
    difficulty: 'intermediate',
    title: 'Fuzzy Search for Typo Tolerance',
    description: `Users often misspell search terms. Find products matching the misspelled term "headhpones" (intended: "headphones") using a fuzzy query on the "name" field with fuzziness of 2.`,
    hints: ['Use a fuzzy query on the name field', 'Set fuzziness: 2 to allow 2 character edits'],
    esqlHints: [
      'Use MATCH with {"fuzziness": "AUTO"} or QSTR with fuzzy syntax (~) for typo tolerance',
      'Fuzzy matching allows character edits to find close matches',
    ],
    indexName: 'eq-products',
    mapping: { properties: { name: { type: 'text' }, category: { type: 'keyword' }, price: { type: 'float' } } },
    seedData: [
      { _id: '1', _index: 'eq-products', _source: { name: 'Wireless Headphones', category: 'audio', price: 149 } },
      { _id: '2', _index: 'eq-products', _source: { name: 'Bluetooth Speaker', category: 'audio', price: 79 } },
      { _id: '3', _index: 'eq-products', _source: { name: 'Noise Cancelling Headphones', category: 'audio', price: 299 } },
      { _id: '4', _index: 'eq-products', _source: { name: 'USB Microphone', category: 'audio', price: 129 } },
      { _id: '5', _index: 'eq-products', _source: { name: 'Headphone Stand', category: 'accessories', price: 25 } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      const hitIds = response.hits.hits.map((h) => h._id);
      // "headhpones" fuzzy should match "headphones" in docs 1, 3, 5
      const expectedIds = ['1', '3', '5'];
      const found = expectedIds.filter((id) => hitIds.includes(id));
      const correct = found.length >= 2; // At least 2 of the 3 headphone docs
      const score = Math.floor((found.length / expectedIds.length) * 100);
      return { correct, score: Math.min(100, score), maxScore: 100, feedback: correct ? `Fuzzy search found ${found.length} headphone products despite typo.` : `Expected headphone products. Fuzzy query should match "headhpones" -> "headphones".` };
    },
    validateEsql: async (response: EsqlResponse, query: string) => {
      return validateEsqlChallenge(response, query, {
        requiredPatterns: [
          { pattern: /\bFROM\b/i, points: 30, label: 'FROM' },
          { pattern: /headphones|headhpones/i, points: 40, label: 'search term' },
        ],
        expectedRowCount: 2,
        rowCountTolerance: 2,
      });
    },
    maxScore: 100,
    timeLimitMs: 30000,
  },
  {
    id: 'fts-11-dis-max',
    domain: 'full-text-search',
    difficulty: 'advanced',
    title: 'Best-Field Matching with dis_max',
    description: `Search for "quick brown fox" across title and body fields. Use a dis_max query so the BEST single field match determines the score (not the sum of all fields). Set tie_breaker to 0.3.

dis_max is better than bool when one field has a strong match and the other is weak - it prevents diluting the score.`,
    hints: ['Use dis_max with a queries array', 'Each query is a match on one field', 'tie_breaker: 0.3 gives partial credit to other matches'],
    indexName: 'eq-articles',
    mapping: { properties: { title: { type: 'text' }, body: { type: 'text' }, author: { type: 'keyword' } } },
    seedData: [
      { _id: '1', _index: 'eq-articles', _source: { title: 'The Quick Brown Fox', body: 'A story about animals in the forest.', author: 'alice' } },
      { _id: '2', _index: 'eq-articles', _source: { title: 'Forest Animals', body: 'The quick brown fox jumps over the lazy dog.', author: 'bob' } },
      { _id: '3', _index: 'eq-articles', _source: { title: 'Quick Recipes', body: 'Brown sugar and fox nuts are healthy snacks.', author: 'charlie' } },
      { _id: '4', _index: 'eq-articles', _source: { title: 'Python Programming', body: 'Learn about data structures and algorithms.', author: 'dave' } },
      { _id: '5', _index: 'eq-articles', _source: { title: 'Fox News Analysis', body: 'A quick brown overview of media trends.', author: 'eve' } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      const hitIds = response.hits.hits.map((h) => h._id);
      const expectedIds = ['1', '2', '3', '5'];
      const found = expectedIds.filter((id) => hitIds.includes(id));
      let score = Math.floor((found.length / expectedIds.length) * 70);
      // Doc 1 should rank highest (title is exact match)
      if (hitIds[0] === '1') score += 30;
      const correct = found.length >= 3 && hitIds[0] === '1';
      return { correct, score: Math.min(100, score), maxScore: 100, feedback: correct ? 'dis_max correctly ranks the best title match first.' : `Found ${found.length}/${expectedIds.length}. Doc 1 should rank first (exact title match).` };
    },
    maxScore: 100,
    timeLimitMs: 45000,
    esqlIncompatible: true,
  },
  {
    id: 'fts-12-boosting',
    domain: 'full-text-search',
    difficulty: 'advanced',
    title: 'Demote Without Excluding',
    description: `Search for "python" articles but DEMOTE (not exclude) articles tagged "beginner". Use a boosting query with:
- positive: match "python" in title or body
- negative: term "beginner" in tags
- negative_boost: 0.2

This keeps beginner articles in results but ranks them lower.`,
    hints: ['boosting query has positive, negative, and negative_boost', 'Unlike must_not, boosting keeps the docs but reduces their score'],
    indexName: 'eq-articles',
    mapping: { properties: { title: { type: 'text' }, body: { type: 'text' }, tags: { type: 'keyword' } } },
    seedData: [
      { _id: '1', _index: 'eq-articles', _source: { title: 'Advanced Python Patterns', body: 'Metaclasses and decorators in Python.', tags: ['python', 'advanced'] } },
      { _id: '2', _index: 'eq-articles', _source: { title: 'Python for Beginners', body: 'Learn Python from scratch.', tags: ['python', 'beginner'] } },
      { _id: '3', _index: 'eq-articles', _source: { title: 'Python Data Science', body: 'Using Python for data analysis.', tags: ['python', 'data'] } },
      { _id: '4', _index: 'eq-articles', _source: { title: 'JavaScript Basics', body: 'Intro to JavaScript.', tags: ['javascript', 'beginner'] } },
      { _id: '5', _index: 'eq-articles', _source: { title: 'Python Web Frameworks', body: 'Django and Flask in Python.', tags: ['python', 'web'] } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      const hitIds = response.hits.hits.map((h) => h._id);
      const pythonDocs = ['1', '2', '3', '5'];
      const found = pythonDocs.filter((id) => hitIds.includes(id));
      let score = 0;
      // All python docs should be present (boosting doesn't exclude)
      if (found.length === 4) score += 50;
      else score += Math.floor((found.length / 4) * 30);
      // Doc 2 (beginner) should NOT be in top 2 (it's demoted)
      if (hitIds.length >= 3) {
        const top2 = hitIds.slice(0, 2);
        if (!top2.includes('2')) score += 30;
      }
      // Doc 2 should still be present (not excluded)
      if (hitIds.includes('2')) score += 20;
      const correct = found.length === 4 && hitIds.includes('2') && hitIds.indexOf('2') >= 2;
      return { correct, score: Math.min(100, score), maxScore: 100, feedback: correct ? 'Boosting query keeps beginner doc but ranks it lower.' : `All python docs should appear. Doc 2 (beginner) should be demoted, not excluded. Got: [${hitIds.join(',')}]` };
    },
    maxScore: 100,
    timeLimitMs: 45000,
    esqlIncompatible: true,
  },
  {
    id: 'fts-13-nested',
    domain: 'full-text-search',
    difficulty: 'expert',
    title: 'Nested Object Query',
    description: `Products have nested "reviews" objects. Find products where a SINGLE review has rating >= 4 AND mentions "excellent" in the text.

Without a nested query, Elasticsearch would cross-match across different reviews (e.g., one review with rating 5 and another mentioning "excellent"). The nested query ensures both conditions match the SAME review.

Use:
{
  "query": {
    "nested": {
      "path": "reviews",
      "query": {
        "bool": {
          "must": [
            { "range": { "reviews.rating": { "gte": 4 } } },
            { "match": { "reviews.text": "excellent" } }
          ]
        }
      }
    }
  }
}`,
    hints: ['Use nested query with path "reviews"', 'Inner query is a bool with range + match', 'Field paths inside nested must include the path prefix: reviews.rating, reviews.text'],
    indexName: 'eq-products',
    mapping: { properties: { name: { type: 'text' }, reviews: { type: 'nested', properties: { rating: { type: 'integer' }, text: { type: 'text' }, reviewer: { type: 'keyword' } } } } },
    seedData: [
      { _id: '1', _index: 'eq-products', _source: { name: 'Laptop Pro', reviews: [{ rating: 5, text: 'Excellent performance and battery life!', reviewer: 'alice' }, { rating: 3, text: 'Screen could be better.', reviewer: 'bob' }] } },
      { _id: '2', _index: 'eq-products', _source: { name: 'Budget Mouse', reviews: [{ rating: 2, text: 'Excellent design but broke quickly.', reviewer: 'charlie' }, { rating: 5, text: 'Great value for money.', reviewer: 'dave' }] } },
      { _id: '3', _index: 'eq-products', _source: { name: 'Mechanical Keyboard', reviews: [{ rating: 5, text: 'Excellent build quality, very satisfying.', reviewer: 'eve' }, { rating: 4, text: 'Excellent typing experience.', reviewer: 'frank' }] } },
      { _id: '4', _index: 'eq-products', _source: { name: 'USB Hub', reviews: [{ rating: 4, text: 'Works fine, nothing special.', reviewer: 'grace' }] } },
      { _id: '5', _index: 'eq-products', _source: { name: 'Webcam', reviews: [{ rating: 1, text: 'Terrible quality.', reviewer: 'hank' }, { rating: 5, text: 'Excellent after firmware update.', reviewer: 'iris' }] } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      const hitIds = response.hits.hits.map((h) => h._id);
      // Single review with rating>=4 AND "excellent": 1 (alice: 5+"excellent"), 3 (eve: 5+"excellent", frank: 4+"excellent"), 5 (iris: 5+"excellent")
      // Doc 2: "excellent" review has rating 2, high-rating review doesn't say "excellent" -> cross-match trap
      const expectedIds = ['1', '3', '5'];
      const found = expectedIds.filter((id) => hitIds.includes(id));
      const falsePositives = hitIds.filter((id) => !expectedIds.includes(id));
      let score = Math.floor((found.length / expectedIds.length) * 70);
      // Penalize if doc 2 is included (cross-match error = not using nested)
      if (!hitIds.includes('2')) score += 30;
      else score -= 20;
      const correct = found.length === expectedIds.length && !hitIds.includes('2');
      return { correct, score: Math.max(0, Math.min(100, score)), maxScore: 100, feedback: correct ? 'Nested query correctly avoids cross-matching across reviews.' : `Expected [1,3,5]. Doc 2 is a trap: "excellent" is in a low-rating review. ${hitIds.includes('2') ? 'Doc 2 included = not using nested query.' : ''}` };
    },
    maxScore: 100,
    timeLimitMs: 60000,
    esqlIncompatible: true,
  },
  {
    id: 'fts-14-function-score',
    domain: 'full-text-search',
    difficulty: 'expert',
    title: 'Custom Relevance with function_score',
    description: `Search for "laptop" but boost results by their "rating" field. Use function_score with:
- query: match "laptop" in title or body
- functions: field_value_factor on "rating" with modifier "log1p" and factor 2
- boost_mode: "multiply"

This makes higher-rated laptops rank higher in results.`,
    hints: ['function_score wraps a query and applies scoring functions', 'field_value_factor multiplies the score by a field value', 'log1p prevents zero-rated items from getting score 0'],
    indexName: 'eq-products',
    mapping: { properties: { title: { type: 'text' }, body: { type: 'text' }, rating: { type: 'float' }, price: { type: 'float' }, category: { type: 'keyword' } } },
    seedData: [
      { _id: '1', _index: 'eq-products', _source: { title: 'Budget Laptop', body: 'An affordable laptop for everyday tasks.', rating: 3.2, price: 399, category: 'electronics' } },
      { _id: '2', _index: 'eq-products', _source: { title: 'Pro Laptop Ultra', body: 'High-performance laptop for professionals.', rating: 4.8, price: 1999, category: 'electronics' } },
      { _id: '3', _index: 'eq-products', _source: { title: 'Student Laptop', body: 'A laptop perfect for students.', rating: 4.1, price: 599, category: 'electronics' } },
      { _id: '4', _index: 'eq-products', _source: { title: 'Gaming Desktop', body: 'Powerful desktop for gaming.', rating: 4.9, price: 2499, category: 'electronics' } },
      { _id: '5', _index: 'eq-products', _source: { title: 'Laptop Stand', body: 'Aluminum stand for your laptop.', rating: 4.5, price: 49, category: 'accessories' } },
      { _id: '6', _index: 'eq-products', _source: { title: 'Refurbished Laptop', body: 'Pre-owned laptop, fully tested.', rating: 2.1, price: 249, category: 'electronics' } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      const hitIds = response.hits.hits.map((h) => h._id);
      const laptopDocs = ['1', '2', '3', '5', '6'];
      const found = laptopDocs.filter((id) => hitIds.includes(id));
      let score = 0;
      if (found.length >= 4) score += 40;
      // Doc 2 (rating 4.8) should rank above doc 1 (rating 3.2) and doc 6 (rating 2.1)
      if (hitIds.length >= 2 && hitIds.indexOf('2') < hitIds.indexOf('1')) score += 20;
      if (hitIds.length >= 2 && hitIds.indexOf('2') < hitIds.indexOf('6')) score += 20;
      // Doc 4 (gaming desktop) should NOT appear (doesn't mention laptop)
      if (!hitIds.includes('4')) score += 20;
      const correct = found.length >= 4 && hitIds[0] === '2' && !hitIds.includes('4');
      return { correct, score: Math.min(100, score), maxScore: 100, feedback: correct ? 'function_score correctly boosts higher-rated laptops.' : `Laptop docs should appear with high-rated ones first. Doc 2 (rating 4.8) should rank #1. Got: [${hitIds.join(',')}]` };
    },
    maxScore: 100,
    timeLimitMs: 60000,
    esqlIncompatible: true,
  },
];
