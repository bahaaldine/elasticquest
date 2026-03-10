import type { Challenge, SearchResponse, ElasticBackend } from '../types';

export const observabilityChallenges: Challenge[] = [
  {
    id: 'obs-1-log-filtering',
    domain: 'observability',
    difficulty: 'beginner',
    title: 'Filter Error Logs',
    description: `Find all ERROR-level logs. The "level" field is a keyword. Simply filter to level "ERROR".`,
    hints: ['Use a term query on the "level" keyword field'],
    indexName: 'eq-logs',
    mapping: { properties: { '@timestamp': { type: 'date' }, level: { type: 'keyword' }, service: { type: 'keyword' }, message: { type: 'text' }, status_code: { type: 'integer' } } },
    seedData: [
      { _id: '1', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:00:00Z', level: 'ERROR', service: 'api', message: 'Connection timeout', status_code: 504 } },
      { _id: '2', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:01:00Z', level: 'INFO', service: 'api', message: 'Request completed', status_code: 200 } },
      { _id: '3', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:02:00Z', level: 'ERROR', service: 'auth', message: 'Auth failed', status_code: 401 } },
      { _id: '4', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:03:00Z', level: 'WARN', service: 'api', message: 'Slow query', status_code: 200 } },
      { _id: '5', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:04:00Z', level: 'ERROR', service: 'payment', message: 'Payment declined', status_code: 402 } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      const hitIds = response.hits.hits.map((h) => h._id);
      const expectedIds = ['1', '3', '5'];
      const found = expectedIds.filter((id) => hitIds.includes(id));
      const falsePositives = hitIds.filter((id) => !expectedIds.includes(id));
      const correct = found.length === expectedIds.length && falsePositives.length === 0;
      const score = Math.floor((found.length / expectedIds.length) * 85) - falsePositives.length * 15;
      return { correct, score: Math.max(0, score), maxScore: 100, feedback: correct ? 'Found all 3 ERROR logs.' : `Found ${found.length}/${expectedIds.length}. ${falsePositives.length} false positives.` };
    },
    maxScore: 100,
    timeLimitMs: 30000,
  },

  {
    id: 'obs-2-service-errors',
    domain: 'observability',
    difficulty: 'intermediate',
    title: 'Service-Specific Error Investigation',
    description: `Find all ERROR logs from "payment-service" in a time window. Use:
- Filter: level = "ERROR"
- Filter: service = "payment-service"
- Range: @timestamp between "2024-03-09T00:00:00Z" and "2024-03-10T00:00:00Z"
- Sort by @timestamp descending (newest first)`,
    hints: ['Bool query with filter clauses', 'sort: [{"@timestamp": "desc"}]'],
    indexName: 'eq-logs',
    mapping: { properties: { '@timestamp': { type: 'date' }, level: { type: 'keyword' }, service: { type: 'keyword' }, message: { type: 'text' }, trace_id: { type: 'keyword' }, status_code: { type: 'integer' } } },
    seedData: [
      { _id: '1', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:30:00Z', level: 'ERROR', service: 'payment-service', message: 'Payment processing failed: timeout', trace_id: 'abc-123', status_code: 504 } },
      { _id: '2', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:31:00Z', level: 'ERROR', service: 'payment-service', message: 'Payment declined', trace_id: 'abc-124', status_code: 402 } },
      { _id: '3', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:30:30Z', level: 'WARN', service: 'payment-service', message: 'Retry attempt 2', trace_id: 'abc-123', status_code: 0 } },
      { _id: '4', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T11:00:00Z', level: 'ERROR', service: 'auth-service', message: 'Token expired', trace_id: 'def-456', status_code: 401 } },
      { _id: '5', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T14:00:00Z', level: 'ERROR', service: 'payment-service', message: 'DB pool exhausted', trace_id: 'ghi-789', status_code: 500 } },
      { _id: '6', _index: 'eq-logs', _source: { '@timestamp': '2024-03-08T10:00:00Z', level: 'ERROR', service: 'payment-service', message: 'Old error outside window', trace_id: 'old-001', status_code: 500 } },
      { _id: '7', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T09:00:00Z', level: 'INFO', service: 'payment-service', message: 'Service started', trace_id: 'start-01', status_code: 200 } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      const hitIds = response.hits.hits.map((h) => h._id);
      const expectedIds = ['1', '2', '5'];
      const found = expectedIds.filter((id) => hitIds.includes(id));
      const falsePositives = hitIds.filter((id) => !expectedIds.includes(id));
      const correctContent = found.length === expectedIds.length && falsePositives.length === 0;
      const expectedOrder = ['5', '2', '1'];
      const correctOrder = hitIds.length >= 3 && expectedOrder.every((id, i) => hitIds[i] === id);
      let score = 0;
      if (correctContent) score += 70; else score += Math.floor((found.length / expectedIds.length) * 50);
      if (correctOrder) score += 30;
      return { correct: correctContent && correctOrder, score: Math.max(0, Math.min(100, score)), maxScore: 100, feedback: correctContent && correctOrder ? 'Found 3 errors from payment-service, sorted newest first.' : `Content: ${found.length}/${expectedIds.length}, ${falsePositives.length} FP. Order: ${correctOrder ? 'ok' : 'should be desc'}.` };
    },
    maxScore: 100,
    timeLimitMs: 45000,
  },

  {
    id: 'obs-3-error-rate',
    domain: 'observability',
    difficulty: 'advanced',
    title: 'Error Rate by Service',
    description: `Analyze error distribution: group by "service" (terms, named "by_service"), then by "level" (terms, named "by_level"). Size 0.`,
    hints: ['Nest terms on "level" inside terms on "service"'],
    indexName: 'eq-logs',
    mapping: { properties: { '@timestamp': { type: 'date' }, level: { type: 'keyword' }, service: { type: 'keyword' }, message: { type: 'text' }, status_code: { type: 'integer' } } },
    seedData: [
      { _id: '1', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:00:00Z', level: 'ERROR', service: 'payment-service', message: 'Fail', status_code: 500 } },
      { _id: '2', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:01:00Z', level: 'ERROR', service: 'payment-service', message: 'Timeout', status_code: 504 } },
      { _id: '3', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:02:00Z', level: 'INFO', service: 'payment-service', message: 'OK', status_code: 200 } },
      { _id: '4', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:00:00Z', level: 'ERROR', service: 'auth-service', message: 'Auth fail', status_code: 401 } },
      { _id: '5', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:01:00Z', level: 'INFO', service: 'auth-service', message: 'Login', status_code: 200 } },
      { _id: '6', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:02:00Z', level: 'INFO', service: 'auth-service', message: 'Token refresh', status_code: 200 } },
      { _id: '7', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:00:00Z', level: 'WARN', service: 'api-gateway', message: 'Rate limit', status_code: 200 } },
      { _id: '8', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:01:00Z', level: 'INFO', service: 'api-gateway', message: 'Routed', status_code: 200 } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      let score = 0;
      if (response.hits.hits.length === 0) score += 10;
      const byService = response.aggregations?.by_service;
      if (!byService?.buckets) return { correct: false, score, maxScore: 100, feedback: 'Missing "by_service" aggregation.' };
      if (byService.buckets.length === 3) score += 20; else score += 10;
      const paymentBucket = byService.buckets.find((b) => b.key === 'payment-service');
      if (paymentBucket) {
        score += 10;
        if (paymentBucket.doc_count === 3) score += 10;
        const byLevel = paymentBucket.by_level as { buckets?: Array<{ key: string; doc_count: number }> } | undefined;
        if (byLevel?.buckets) {
          score += 20;
          if (byLevel.buckets.find((b) => b.key === 'ERROR')?.doc_count === 2) score += 15;
          if (byLevel.buckets.find((b) => b.key === 'INFO')?.doc_count === 1) score += 15;
        }
      }
      const correct = score >= 90;
      return { correct, score: Math.min(100, score), maxScore: 100, feedback: correct ? 'Nested service/level aggregation correct.' : `Score: ${score}/100. Build: by_service -> by_level.` };
    },
    maxScore: 100,
    timeLimitMs: 60000,
  },

  {
    id: 'obs-4-status-code-range',
    domain: 'observability',
    difficulty: 'intermediate',
    title: 'HTTP Status Code Analysis',
    description: `Find all logs with HTTP status codes in the 5xx range (500-599). These indicate server errors. Sort by @timestamp descending.`,
    hints: ['Use range query on status_code: gte 500, lt 600'],
    indexName: 'eq-logs',
    mapping: { properties: { '@timestamp': { type: 'date' }, level: { type: 'keyword' }, service: { type: 'keyword' }, message: { type: 'text' }, status_code: { type: 'integer' } } },
    seedData: [
      { _id: '1', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:00:00Z', level: 'ERROR', service: 'api', message: 'Internal error', status_code: 500 } },
      { _id: '2', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:01:00Z', level: 'INFO', service: 'api', message: 'OK', status_code: 200 } },
      { _id: '3', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:02:00Z', level: 'ERROR', service: 'api', message: 'Bad gateway', status_code: 502 } },
      { _id: '4', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:03:00Z', level: 'ERROR', service: 'auth', message: 'Unauthorized', status_code: 401 } },
      { _id: '5', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:04:00Z', level: 'ERROR', service: 'api', message: 'Gateway timeout', status_code: 504 } },
      { _id: '6', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:05:00Z', level: 'WARN', service: 'api', message: 'Rate limited', status_code: 429 } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      const hitIds = response.hits.hits.map((h) => h._id);
      const expectedIds = ['1', '3', '5'];
      const found = expectedIds.filter((id) => hitIds.includes(id));
      const falsePositives = hitIds.filter((id) => !expectedIds.includes(id));
      const correct = found.length === expectedIds.length && falsePositives.length === 0;
      const score = Math.floor((found.length / expectedIds.length) * 85) - falsePositives.length * 15;
      return { correct, score: Math.max(0, score), maxScore: 100, feedback: correct ? 'Found all 5xx errors.' : `Found ${found.length}/${expectedIds.length}. ${falsePositives.length} FP. Range: 500 <= status_code < 600.` };
    },
    maxScore: 100,
    timeLimitMs: 30000,
  },

  {
    id: 'obs-5-log-text-search',
    domain: 'observability',
    difficulty: 'advanced',
    title: 'Log Message Pattern Search',
    description: `Find all ERROR logs where the message contains "timeout" OR "connection" (any service). Use a bool query with:
- filter: level = "ERROR"
- must: match the message field with "timeout connection" (default OR operator)`,
    hints: ['match query defaults to OR operator', 'Combine with bool filter for level'],
    indexName: 'eq-logs',
    mapping: { properties: { '@timestamp': { type: 'date' }, level: { type: 'keyword' }, service: { type: 'keyword' }, message: { type: 'text' }, status_code: { type: 'integer' } } },
    seedData: [
      { _id: '1', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:00:00Z', level: 'ERROR', service: 'api', message: 'Connection timeout to database', status_code: 504 } },
      { _id: '2', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:01:00Z', level: 'ERROR', service: 'api', message: 'Authentication failed', status_code: 401 } },
      { _id: '3', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:02:00Z', level: 'WARN', service: 'api', message: 'Connection pool low', status_code: 200 } },
      { _id: '4', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:03:00Z', level: 'ERROR', service: 'payment', message: 'Gateway connection refused', status_code: 502 } },
      { _id: '5', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:04:00Z', level: 'ERROR', service: 'payment', message: 'Request timeout after 30s', status_code: 504 } },
      { _id: '6', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:05:00Z', level: 'INFO', service: 'api', message: 'Connection established', status_code: 200 } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      const hitIds = response.hits.hits.map((h) => h._id);
      const expectedIds = ['1', '4', '5']; // ERROR + (timeout OR connection)
      const found = expectedIds.filter((id) => hitIds.includes(id));
      const falsePositives = hitIds.filter((id) => !expectedIds.includes(id));
      const correct = found.length === expectedIds.length && falsePositives.length === 0;
      const score = Math.floor((found.length / expectedIds.length) * 85) - falsePositives.length * 15;
      return { correct, score: Math.max(0, score), maxScore: 100, feedback: correct ? 'Found all ERROR logs mentioning timeout or connection.' : `Found ${found.length}/${expectedIds.length}. ${falsePositives.length} FP.` };
    },
    maxScore: 100,
    timeLimitMs: 45000,
  },
];
