import type { Challenge, SearchResponse, ElasticBackend } from '../types';

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
    maxScore: 100,
    timeLimitMs: 60000,
  },
];
