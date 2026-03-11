import type { Challenge, SearchResponse, ElasticBackend } from '../types';

/**
 * Multi-turn challenges: the model first explores the data (mapping + sample docs),
 * then writes the query. Tests real-world workflow where you don't know the schema upfront.
 */
export const multiTurnChallenges: Challenge[] = [
  {
    id: 'mt-1-discover-and-search',
    domain: 'full-text-search',
    difficulty: 'intermediate',
    title: 'Discover Schema, Then Search',
    description: `You've been given access to the "eq-mystery-articles" index but don't know its structure. After examining the mapping and sample documents, find all articles about "machine learning" that were published in 2024.`,
    hints: [
      'First examine the mapping to understand field names and types',
      'Look at sample documents to see what data looks like',
      'Then construct a bool query with match + range',
    ],
    indexName: 'eq-mystery-articles',
    mapping: {
      properties: {
        headline: { type: 'text' },
        content: { type: 'text' },
        topic: { type: 'keyword' },
        pub_date: { type: 'date' },
        author_name: { type: 'keyword' },
      },
    },
    seedData: [
      { _id: '1', _index: 'eq-mystery-articles', _source: { headline: 'Deep Learning Breakthroughs in 2024', content: 'Machine learning has seen massive advances in transformer architectures.', topic: 'ai', pub_date: '2024-06-15', author_name: 'Dr. Chen' } },
      { _id: '2', _index: 'eq-mystery-articles', _source: { headline: 'Machine Learning in Healthcare', content: 'New machine learning models are transforming medical diagnosis.', topic: 'ai', pub_date: '2024-03-20', author_name: 'Dr. Smith' } },
      { _id: '3', _index: 'eq-mystery-articles', _source: { headline: 'Kubernetes Best Practices', content: 'Container orchestration patterns for production systems.', topic: 'devops', pub_date: '2024-01-10', author_name: 'Jane Doe' } },
      { _id: '4', _index: 'eq-mystery-articles', _source: { headline: 'The Rise of Machine Learning', content: 'A retrospective on machine learning progress throughout the decade.', topic: 'ai', pub_date: '2023-12-01', author_name: 'Prof. Lee' } },
      { _id: '5', _index: 'eq-mystery-articles', _source: { headline: 'Neural Network Fundamentals', content: 'Understanding machine learning from first principles.', topic: 'ai', pub_date: '2024-09-05', author_name: 'Dr. Chen' } },
      { _id: '6', _index: 'eq-mystery-articles', _source: { headline: 'SQL vs NoSQL in 2024', content: 'Database comparison for modern applications.', topic: 'databases', pub_date: '2024-02-28', author_name: 'Bob Dev' } },
    ],
    multiTurn: true,
    discoveryPrompt: `You are an Elasticsearch expert. You've been given access to an index but don't know its structure yet. Examine the mapping and sample documents below to understand the data. Describe what fields are available, their types, and what kind of data this index contains. This will help you write a query in the next step.`,
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      const hitIds = response.hits.hits.map((h) => h._id);
      // "machine learning" in 2024: docs 1, 2, 5 (doc 4 is 2023)
      const expectedIds = ['1', '2', '5'];
      const found = expectedIds.filter((id) => hitIds.includes(id));
      const falsePositives = hitIds.filter((id) => !expectedIds.includes(id));
      let score = Math.floor((found.length / expectedIds.length) * 70);
      if (falsePositives.length === 0) score += 20;
      if (!hitIds.includes('4')) score += 10; // Doc 4 is 2023 — should be excluded
      const correct = found.length === expectedIds.length && falsePositives.length === 0;
      return { correct, score: Math.max(0, Math.min(100, score)), maxScore: 100, feedback: correct ? 'Correctly discovered schema and found ML articles from 2024.' : `Found ${found.length}/${expectedIds.length}. ${falsePositives.length} FP. Note: field names are headline/content/pub_date (not title/body/date).` };
    },
    maxScore: 100,
    timeLimitMs: 60000,
  },
  {
    id: 'mt-2-explore-and-aggregate',
    domain: 'aggregations',
    difficulty: 'advanced',
    title: 'Explore Data, Then Aggregate',
    description: `The "eq-mystery-sales" index contains sales data with an unknown schema. Explore the mapping and sample documents, then write a query to compute total revenue per region. Use a terms aggregation named "by_region" with a sum sub-aggregation named "total_revenue". Set size to 0.`,
    hints: [
      'Examine the mapping to find the region and revenue field names',
      'They might not be called "region" and "revenue" — check the actual field names',
      'Use terms agg on the region field, sum agg on the revenue field',
    ],
    indexName: 'eq-mystery-sales',
    mapping: {
      properties: {
        item_name: { type: 'text' },
        item_category: { type: 'keyword' },
        sale_amount: { type: 'float' },
        sales_region: { type: 'keyword' },
        sold_at: { type: 'date' },
      },
    },
    seedData: [
      { _id: '1', _index: 'eq-mystery-sales', _source: { item_name: 'Laptop Pro', item_category: 'electronics', sale_amount: 1299.99, sales_region: 'west', sold_at: '2024-01-15' } },
      { _id: '2', _index: 'eq-mystery-sales', _source: { item_name: 'Office Chair', item_category: 'furniture', sale_amount: 399.99, sales_region: 'east', sold_at: '2024-01-16' } },
      { _id: '3', _index: 'eq-mystery-sales', _source: { item_name: 'Headphones', item_category: 'electronics', sale_amount: 199.99, sales_region: 'west', sold_at: '2024-01-17' } },
      { _id: '4', _index: 'eq-mystery-sales', _source: { item_name: 'Standing Desk', item_category: 'furniture', sale_amount: 599.99, sales_region: 'north', sold_at: '2024-01-18' } },
      { _id: '5', _index: 'eq-mystery-sales', _source: { item_name: 'Webcam', item_category: 'electronics', sale_amount: 89.99, sales_region: 'east', sold_at: '2024-01-19' } },
      { _id: '6', _index: 'eq-mystery-sales', _source: { item_name: 'Desk Lamp', item_category: 'furniture', sale_amount: 49.99, sales_region: 'north', sold_at: '2024-01-20' } },
    ],
    multiTurn: true,
    discoveryPrompt: `You are an Elasticsearch expert. Examine the mapping and sample documents below. Identify the field names and types. Pay special attention to which field represents the sales region and which represents the revenue amount — they may not have obvious names.`,
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      let score = 0;
      if (response.hits.hits.length === 0) score += 10;
      const agg = response.aggregations?.by_region;
      if (!agg?.buckets) return { correct: false, score, maxScore: 100, feedback: 'Missing "by_region" aggregation. The region field is "sales_region" (not "region").' };
      score += 25;
      if (agg.buckets.length === 3) score += 15; // west, east, north
      let hasRevenue = true;
      for (const b of agg.buckets) { if (!b.total_revenue) { hasRevenue = false; break; } }
      if (hasRevenue) score += 25;
      // west: 1299.99 + 199.99 = 1499.98
      const westBucket = agg.buckets.find((b) => b.key === 'west');
      if (westBucket?.total_revenue) {
        const rev = westBucket.total_revenue as { value?: number };
        if (rev.value !== undefined && Math.abs(Number(rev.value) - 1499.98) < 1) score += 25;
      }
      const correct = score >= 90;
      return { correct, score: Math.min(100, score), maxScore: 100, feedback: correct ? 'Correctly discovered "sales_region" and "sale_amount" fields and aggregated.' : `Score: ${score}/100. Key discovery: region field is "sales_region", revenue is "sale_amount".` };
    },
    maxScore: 100,
    timeLimitMs: 60000,
  },
  {
    id: 'mt-3-unknown-logs',
    domain: 'observability',
    difficulty: 'advanced',
    title: 'Unknown Log Schema Investigation',
    description: `The "eq-mystery-logs" index contains application logs but the field names are non-standard. Explore the schema, then find all error-level entries from the last 24 hours. Sort by timestamp descending.

Hint: the field names may not follow ECS conventions.`,
    hints: [
      'Field names might be non-standard (e.g., "severity" instead of "level")',
      'Examine the mapping carefully to find timestamp, severity, and service fields',
      'Write a bool query with term filter + range on the timestamp field',
    ],
    indexName: 'eq-mystery-logs',
    mapping: {
      properties: {
        ts: { type: 'date' },
        severity: { type: 'keyword' },
        svc: { type: 'keyword' },
        msg: { type: 'text' },
        http_status: { type: 'integer' },
      },
    },
    seedData: [
      { _id: '1', _index: 'eq-mystery-logs', _source: { ts: '2024-03-09T10:00:00Z', severity: 'error', svc: 'api', msg: 'Connection pool exhausted', http_status: 500 } },
      { _id: '2', _index: 'eq-mystery-logs', _source: { ts: '2024-03-09T10:01:00Z', severity: 'info', svc: 'api', msg: 'Health check passed', http_status: 200 } },
      { _id: '3', _index: 'eq-mystery-logs', _source: { ts: '2024-03-09T14:00:00Z', severity: 'error', svc: 'payment', msg: 'Payment gateway timeout', http_status: 504 } },
      { _id: '4', _index: 'eq-mystery-logs', _source: { ts: '2024-03-08T10:00:00Z', severity: 'error', svc: 'api', msg: 'Old error outside window', http_status: 500 } },
      { _id: '5', _index: 'eq-mystery-logs', _source: { ts: '2024-03-09T16:00:00Z', severity: 'error', svc: 'auth', msg: 'Token validation failed', http_status: 401 } },
      { _id: '6', _index: 'eq-mystery-logs', _source: { ts: '2024-03-09T11:00:00Z', severity: 'warn', svc: 'api', msg: 'Slow query detected', http_status: 200 } },
      { _id: '7', _index: 'eq-mystery-logs', _source: { ts: '2024-03-09T09:00:00Z', severity: 'error', svc: 'api', msg: 'Database connection refused', http_status: 503 } },
    ],
    multiTurn: true,
    discoveryPrompt: `You are an Elasticsearch expert investigating an unfamiliar log index. The field names do NOT follow standard ECS conventions. Examine the mapping and sample documents to understand: what is the timestamp field called? What is the log level/severity field called? What values does it use? This will be critical for writing an accurate query.`,
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      const hitIds = response.hits.hits.map((h) => h._id);
      // severity=error + ts within 2024-03-09: docs 1, 3, 5, 7 (doc 4 is 2024-03-08)
      const expectedIds = ['1', '3', '5', '7'];
      const found = expectedIds.filter((id) => hitIds.includes(id));
      const falsePositives = hitIds.filter((id) => !expectedIds.includes(id));
      const correctContent = found.length === expectedIds.length && falsePositives.length === 0;
      // Check desc sort: 5 (16:00), 3 (14:00), 1 (10:00), 7 (09:00)
      const expectedOrder = ['5', '3', '1', '7'];
      const correctOrder = hitIds.length >= 4 && expectedOrder.every((id, i) => hitIds[i] === id);
      let score = 0;
      if (correctContent) score += 60; else score += Math.floor((found.length / expectedIds.length) * 40);
      if (correctOrder) score += 30;
      if (!hitIds.includes('4')) score += 10; // Excluded old error
      const correct = correctContent && correctOrder;
      return { correct, score: Math.max(0, Math.min(100, score)), maxScore: 100, feedback: correct ? 'Discovered non-standard fields (ts, severity, svc) and queried correctly.' : `Found ${found.length}/${expectedIds.length}. Key: timestamp is "ts", level is "severity" (lowercase "error"), not "@timestamp"/"level".` };
    },
    maxScore: 100,
    timeLimitMs: 60000,
  },
  {
    id: 'mt-4-investigate',
    domain: 'security',
    difficulty: 'expert',
    title: 'Security Investigation: Find the Anomaly',
    description: `The "eq-mystery-auth" index contains authentication events. Something suspicious happened. Explore the data to understand the schema, then find all authentication events from IP addresses that had more than 2 failed login attempts. Use a terms aggregation named "suspicious_ips" on the source IP field, filtered to failed events only, and only show IPs with at least 3 attempts (use min_doc_count: 3). Size 0.`,
    hints: [
      'First discover what fields exist and what they are called',
      'The IP field and action field may have non-obvious names',
      'Filter to failed logins first, then terms agg with min_doc_count: 3',
    ],
    indexName: 'eq-mystery-auth',
    mapping: {
      properties: {
        event_time: { type: 'date' },
        src_addr: { type: 'keyword' },
        dst_addr: { type: 'keyword' },
        user_id: { type: 'keyword' },
        outcome: { type: 'keyword' },
        method: { type: 'keyword' },
      },
    },
    seedData: [
      { _id: '1', _index: 'eq-mystery-auth', _source: { event_time: '2024-03-09T10:00:00Z', src_addr: '192.168.1.100', dst_addr: '10.0.0.1', user_id: 'admin', outcome: 'failure', method: 'password' } },
      { _id: '2', _index: 'eq-mystery-auth', _source: { event_time: '2024-03-09T10:00:05Z', src_addr: '192.168.1.100', dst_addr: '10.0.0.1', user_id: 'admin', outcome: 'failure', method: 'password' } },
      { _id: '3', _index: 'eq-mystery-auth', _source: { event_time: '2024-03-09T10:00:10Z', src_addr: '192.168.1.100', dst_addr: '10.0.0.1', user_id: 'admin', outcome: 'failure', method: 'password' } },
      { _id: '4', _index: 'eq-mystery-auth', _source: { event_time: '2024-03-09T10:00:15Z', src_addr: '192.168.1.100', dst_addr: '10.0.0.1', user_id: 'admin', outcome: 'success', method: 'password' } },
      { _id: '5', _index: 'eq-mystery-auth', _source: { event_time: '2024-03-09T10:01:00Z', src_addr: '10.0.0.50', dst_addr: '10.0.0.1', user_id: 'alice', outcome: 'success', method: 'sso' } },
      { _id: '6', _index: 'eq-mystery-auth', _source: { event_time: '2024-03-09T10:02:00Z', src_addr: '172.16.0.5', dst_addr: '10.0.0.1', user_id: 'root', outcome: 'failure', method: 'password' } },
      { _id: '7', _index: 'eq-mystery-auth', _source: { event_time: '2024-03-09T10:02:05Z', src_addr: '172.16.0.5', dst_addr: '10.0.0.1', user_id: 'root', outcome: 'failure', method: 'password' } },
      { _id: '8', _index: 'eq-mystery-auth', _source: { event_time: '2024-03-09T10:02:10Z', src_addr: '172.16.0.5', dst_addr: '10.0.0.1', user_id: 'root', outcome: 'failure', method: 'password' } },
    ],
    multiTurn: true,
    discoveryPrompt: `You are a security analyst investigating suspicious authentication activity. Examine the index mapping and sample documents to understand the schema. Identify: what is the source IP field? What indicates a failed login? What field names are used? This is a security investigation — pay attention to patterns in the data.`,
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      let score = 0;
      if (response.hits.hits.length === 0) score += 10;
      const agg = response.aggregations?.suspicious_ips;
      if (!agg?.buckets) return { correct: false, score, maxScore: 100, feedback: 'Missing "suspicious_ips" aggregation. The IP field is "src_addr" and failures have outcome "failure".' };
      score += 30;
      // Should find 2 IPs with 3+ failures: 192.168.1.100 (3 failures) and 172.16.0.5 (3 failures)
      if (agg.buckets.length === 2) score += 30;
      else if (agg.buckets.length === 1) score += 15;
      const ips = agg.buckets.map((b) => String(b.key));
      if (ips.includes('192.168.1.100')) score += 15;
      if (ips.includes('172.16.0.5')) score += 15;
      const correct = score >= 90;
      return { correct, score: Math.min(100, score), maxScore: 100, feedback: correct ? 'Investigation complete: found 2 suspicious IPs (192.168.1.100, 172.16.0.5) with 3+ failed attempts.' : `Score: ${score}/100. Key: field is "src_addr", failures have outcome="failure". Use min_doc_count:3.` };
    },
    maxScore: 100,
    timeLimitMs: 90000,
  },
];
