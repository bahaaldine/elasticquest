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

  // --- EXPANDED ---
  {
    id: 'obs-6-latency-percentiles',
    domain: 'observability',
    difficulty: 'advanced',
    title: 'Service Latency Percentiles',
    description: `APM transaction data contains service response times. Compute latency percentiles per service:
1. Group by "service.name" (terms agg named "by_service")
2. For each service, compute p50, p95, p99 of "duration_ms" (percentiles agg named "latency_pcts" with percents [50, 95, 99])
3. Size 0 (no hits needed)`,
    hints: ['Nest a percentiles agg inside a terms agg', 'percents: [50, 95, 99]'],
    indexName: 'eq-apm',
    mapping: { properties: { '@timestamp': { type: 'date' }, 'service.name': { type: 'keyword' }, duration_ms: { type: 'integer' }, status: { type: 'keyword' }, endpoint: { type: 'keyword' } } },
    seedData: [
      { _id: '1', _index: 'eq-apm', _source: { '@timestamp': '2024-03-09T10:00:00Z', 'service.name': 'api-gateway', duration_ms: 12, status: 'ok', endpoint: '/health' } },
      { _id: '2', _index: 'eq-apm', _source: { '@timestamp': '2024-03-09T10:00:01Z', 'service.name': 'api-gateway', duration_ms: 45, status: 'ok', endpoint: '/api/users' } },
      { _id: '3', _index: 'eq-apm', _source: { '@timestamp': '2024-03-09T10:00:02Z', 'service.name': 'api-gateway', duration_ms: 230, status: 'ok', endpoint: '/api/search' } },
      { _id: '4', _index: 'eq-apm', _source: { '@timestamp': '2024-03-09T10:00:03Z', 'service.name': 'api-gateway', duration_ms: 1200, status: 'error', endpoint: '/api/orders' } },
      { _id: '5', _index: 'eq-apm', _source: { '@timestamp': '2024-03-09T10:00:00Z', 'service.name': 'payment-service', duration_ms: 89, status: 'ok', endpoint: '/charge' } },
      { _id: '6', _index: 'eq-apm', _source: { '@timestamp': '2024-03-09T10:00:01Z', 'service.name': 'payment-service', duration_ms: 150, status: 'ok', endpoint: '/charge' } },
      { _id: '7', _index: 'eq-apm', _source: { '@timestamp': '2024-03-09T10:00:02Z', 'service.name': 'payment-service', duration_ms: 3500, status: 'error', endpoint: '/charge' } },
      { _id: '8', _index: 'eq-apm', _source: { '@timestamp': '2024-03-09T10:00:03Z', 'service.name': 'user-service', duration_ms: 25, status: 'ok', endpoint: '/profile' } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      let score = 0;
      if (response.hits.hits.length === 0) score += 10;
      const byService = response.aggregations?.by_service;
      if (!byService?.buckets) return { correct: false, score, maxScore: 100, feedback: 'Missing "by_service" terms aggregation.' };
      score += 20;
      if (byService.buckets.length >= 2) score += 10;
      // Check that buckets have latency_pcts sub-agg
      let hasPcts = true;
      for (const bucket of byService.buckets) {
        if (!bucket.latency_pcts) { hasPcts = false; break; }
      }
      if (hasPcts) score += 30;
      // Check api-gateway percentiles exist
      const gwBucket = byService.buckets.find((b) => b.key === 'api-gateway');
      if (gwBucket?.latency_pcts) {
        const pcts = gwBucket.latency_pcts as { values?: Record<string, unknown> };
        if (pcts.values) {
          score += 10;
          if (pcts.values['50'] !== undefined) score += 10;
          if (pcts.values['95'] !== undefined) score += 5;
          if (pcts.values['99'] !== undefined) score += 5;
        }
      }
      const correct = score >= 90;
      return { correct, score: Math.min(100, score), maxScore: 100, feedback: correct ? 'Latency percentiles per service computed correctly.' : `Score: ${score}/100. Need: by_service -> latency_pcts (percentiles with percents [50,95,99]).` };
    },
    maxScore: 100,
    timeLimitMs: 60000,
  },
  {
    id: 'obs-7-error-spike',
    domain: 'observability',
    difficulty: 'intermediate',
    title: 'Error Spike Detection',
    description: `Detect when error spikes occurred. Using the "eq-logs" index:
1. Filter to only ERROR-level logs
2. Create a date_histogram on "@timestamp" with fixed_interval "1h" (named "errors_over_time")
3. Size 0

The resulting buckets show how many errors occurred each hour — the tallest bucket is your incident window.`,
    hints: ['Use a bool filter for level=ERROR, then date_histogram in aggs', 'fixed_interval: "1h"'],
    indexName: 'eq-logs',
    mapping: { properties: { '@timestamp': { type: 'date' }, level: { type: 'keyword' }, service: { type: 'keyword' }, message: { type: 'text' } } },
    seedData: [
      { _id: '1', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T08:15:00Z', level: 'ERROR', service: 'api', message: 'Timeout' } },
      { _id: '2', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T09:00:00Z', level: 'INFO', service: 'api', message: 'Request OK' } },
      { _id: '3', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:05:00Z', level: 'ERROR', service: 'api', message: 'Connection refused' } },
      { _id: '4', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:10:00Z', level: 'ERROR', service: 'payment', message: 'Payment failed' } },
      { _id: '5', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:20:00Z', level: 'ERROR', service: 'api', message: 'DB pool exhausted' } },
      { _id: '6', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:45:00Z', level: 'ERROR', service: 'auth', message: 'Token expired' } },
      { _id: '7', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T11:00:00Z', level: 'ERROR', service: 'api', message: 'Slow query' } },
      { _id: '8', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T14:00:00Z', level: 'INFO', service: 'api', message: 'All clear' } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      let score = 0;
      if (response.hits.hits.length === 0) score += 15;
      // Should only have ERROR docs in the agg (6 errors total, not 8)
      if (response.hits.total.value <= 6) score += 15;
      const agg = response.aggregations?.errors_over_time;
      if (!agg?.buckets) return { correct: false, score, maxScore: 100, feedback: 'Missing "errors_over_time" date_histogram aggregation.' };
      score += 30;
      // Should have multiple hourly buckets
      if (agg.buckets.length >= 2) score += 20;
      // The 10:00 hour should have the most errors (4: docs 3,4,5,6)
      const maxBucket = agg.buckets.reduce((max, b) => b.doc_count > max.doc_count ? b : max, agg.buckets[0]);
      if (maxBucket && maxBucket.doc_count >= 3) score += 20;
      const correct = score >= 80;
      return { correct, score: Math.min(100, score), maxScore: 100, feedback: correct ? `Error spike detected: ${maxBucket?.doc_count} errors in peak hour.` : `Score: ${score}/100. Filter to ERROR first, then date_histogram with fixed_interval "1h".` };
    },
    maxScore: 100,
    timeLimitMs: 45000,
  },
  {
    id: 'obs-8-multi-service',
    domain: 'observability',
    difficulty: 'advanced',
    title: 'Cross-Service Trace Errors',
    description: `Find distributed trace failures that span multiple services. In the "eq-traces" index:
1. Filter to status = "error"
2. Group by "trace_id" (terms agg named "failing_traces")
3. For each trace, compute the cardinality of "service.name" (cardinality agg named "service_count")
4. Size 0

Traces with service_count > 1 indicate failures that cascaded across services.`,
    hints: ['Bool filter on status=error', 'terms on trace_id -> cardinality on service.name'],
    indexName: 'eq-traces',
    mapping: { properties: { '@timestamp': { type: 'date' }, trace_id: { type: 'keyword' }, 'service.name': { type: 'keyword' }, span_name: { type: 'keyword' }, duration_ms: { type: 'integer' }, status: { type: 'keyword' } } },
    seedData: [
      { _id: '1', _index: 'eq-traces', _source: { '@timestamp': '2024-03-09T10:00:00Z', trace_id: 'trace-001', 'service.name': 'api-gateway', span_name: 'HTTP GET /orders', duration_ms: 1500, status: 'error' } },
      { _id: '2', _index: 'eq-traces', _source: { '@timestamp': '2024-03-09T10:00:01Z', trace_id: 'trace-001', 'service.name': 'order-service', span_name: 'getOrder', duration_ms: 1200, status: 'error' } },
      { _id: '3', _index: 'eq-traces', _source: { '@timestamp': '2024-03-09T10:00:02Z', trace_id: 'trace-001', 'service.name': 'payment-service', span_name: 'chargeCard', duration_ms: 800, status: 'error' } },
      { _id: '4', _index: 'eq-traces', _source: { '@timestamp': '2024-03-09T10:01:00Z', trace_id: 'trace-002', 'service.name': 'api-gateway', span_name: 'HTTP GET /users', duration_ms: 50, status: 'ok' } },
      { _id: '5', _index: 'eq-traces', _source: { '@timestamp': '2024-03-09T10:01:01Z', trace_id: 'trace-002', 'service.name': 'user-service', span_name: 'getUser', duration_ms: 30, status: 'ok' } },
      { _id: '6', _index: 'eq-traces', _source: { '@timestamp': '2024-03-09T10:02:00Z', trace_id: 'trace-003', 'service.name': 'auth-service', span_name: 'validateToken', duration_ms: 5000, status: 'error' } },
      { _id: '7', _index: 'eq-traces', _source: { '@timestamp': '2024-03-09T10:03:00Z', trace_id: 'trace-004', 'service.name': 'api-gateway', span_name: 'HTTP POST /search', duration_ms: 200, status: 'error' } },
      { _id: '8', _index: 'eq-traces', _source: { '@timestamp': '2024-03-09T10:03:01Z', trace_id: 'trace-004', 'service.name': 'search-service', span_name: 'search', duration_ms: 150, status: 'error' } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      let score = 0;
      if (response.hits.hits.length === 0) score += 10;
      const agg = response.aggregations?.failing_traces;
      if (!agg?.buckets) return { correct: false, score, maxScore: 100, feedback: 'Missing "failing_traces" terms aggregation on trace_id.' };
      score += 20;
      // Should have 3 failing traces (001, 003, 004) — trace-002 is ok
      if (agg.buckets.length === 3) score += 20;
      else if (agg.buckets.length >= 2) score += 10;
      // Check service_count sub-agg exists
      let hasServiceCount = true;
      for (const b of agg.buckets) { if (!b.service_count) { hasServiceCount = false; break; } }
      if (hasServiceCount) score += 25;
      // trace-001 should have service_count = 3
      const t001 = agg.buckets.find((b) => b.key === 'trace-001');
      if (t001?.service_count) {
        const sc = t001.service_count as { value?: number };
        if (sc.value === 3) score += 25;
        else if (sc.value !== undefined && sc.value >= 2) score += 15;
      }
      const correct = score >= 90;
      return { correct, score: Math.min(100, score), maxScore: 100, feedback: correct ? 'Cross-service trace failures identified correctly.' : `Score: ${score}/100. Filter status=error, then terms on trace_id -> cardinality on service.name.` };
    },
    maxScore: 100,
    timeLimitMs: 60000,
  },
  {
    id: 'obs-9-top-errors',
    domain: 'observability',
    difficulty: 'intermediate',
    title: 'Top Error Messages',
    description: `Find the most common error messages in your logs. From "eq-logs":
1. Filter to level = "ERROR"
2. Use a terms aggregation named "top_errors" on "message.keyword" to find the most frequent error messages
3. Size 0`,
    hints: ['Filter with bool.filter term level=ERROR', 'Use terms agg on message.keyword (not message — keyword gives exact strings)'],
    indexName: 'eq-logs',
    mapping: { properties: { '@timestamp': { type: 'date' }, level: { type: 'keyword' }, service: { type: 'keyword' }, message: { type: 'text', fields: { keyword: { type: 'keyword' } } } } },
    seedData: [
      { _id: '1', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:00:00Z', level: 'ERROR', service: 'api', message: 'Connection timeout' } },
      { _id: '2', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:01:00Z', level: 'ERROR', service: 'api', message: 'Connection timeout' } },
      { _id: '3', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:02:00Z', level: 'ERROR', service: 'payment', message: 'Payment declined' } },
      { _id: '4', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:03:00Z', level: 'ERROR', service: 'api', message: 'Connection timeout' } },
      { _id: '5', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:04:00Z', level: 'INFO', service: 'api', message: 'Request completed' } },
      { _id: '6', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:05:00Z', level: 'ERROR', service: 'auth', message: 'Token expired' } },
      { _id: '7', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:06:00Z', level: 'ERROR', service: 'payment', message: 'Payment declined' } },
      { _id: '8', _index: 'eq-logs', _source: { '@timestamp': '2024-03-09T10:07:00Z', level: 'WARN', service: 'api', message: 'Slow query detected' } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      let score = 0;
      if (response.hits.hits.length === 0) score += 15;
      const agg = response.aggregations?.top_errors;
      if (!agg?.buckets) return { correct: false, score, maxScore: 100, feedback: 'Missing "top_errors" terms aggregation.' };
      score += 25;
      // Should have 3 unique error messages (Connection timeout x3, Payment declined x2, Token expired x1)
      if (agg.buckets.length === 3) score += 20;
      // "Connection timeout" should be the top bucket with count 3
      if (agg.buckets.length > 0 && String(agg.buckets[0].key).includes('Connection timeout') && agg.buckets[0].doc_count === 3) score += 25;
      else if (agg.buckets.length > 0 && agg.buckets[0].doc_count === 3) score += 15;
      // Should NOT include INFO or WARN messages
      const hasNonError = agg.buckets.some((b) => String(b.key).includes('completed') || String(b.key).includes('Slow'));
      if (!hasNonError) score += 15;
      const correct = score >= 85;
      return { correct, score: Math.min(100, score), maxScore: 100, feedback: correct ? `Top error: "${agg.buckets[0]?.key}" (${agg.buckets[0]?.doc_count}x).` : `Score: ${score}/100. Filter to ERROR first, then terms on message.keyword.` };
    },
    maxScore: 100,
    timeLimitMs: 45000,
  },
  {
    id: 'obs-10-uptime',
    domain: 'observability',
    difficulty: 'expert',
    title: 'SLO Uptime Calculation',
    description: `Calculate the success rate per service for SLO monitoring. From "eq-apm":
1. Group by "service.name" (terms agg named "by_service")
2. Inside each service, use a filters aggregation named "outcomes" with:
   - "success": range on status_code gte:200 lt:300
   - "failure": range on status_code gte:500 lt:600
3. Size 0

This shows what percentage of requests per service are successful (2xx) vs server errors (5xx).`,
    hints: ['terms on service.name -> filters agg with named filters', 'Each filter is a range query on status_code', 'Named filters use an object, not array'],
    indexName: 'eq-apm',
    mapping: { properties: { '@timestamp': { type: 'date' }, 'service.name': { type: 'keyword' }, endpoint: { type: 'keyword' }, status_code: { type: 'integer' }, duration_ms: { type: 'integer' } } },
    seedData: [
      { _id: '1', _index: 'eq-apm', _source: { '@timestamp': '2024-03-09T10:00:00Z', 'service.name': 'api-gateway', endpoint: '/users', status_code: 200, duration_ms: 45 } },
      { _id: '2', _index: 'eq-apm', _source: { '@timestamp': '2024-03-09T10:00:01Z', 'service.name': 'api-gateway', endpoint: '/orders', status_code: 200, duration_ms: 120 } },
      { _id: '3', _index: 'eq-apm', _source: { '@timestamp': '2024-03-09T10:00:02Z', 'service.name': 'api-gateway', endpoint: '/search', status_code: 500, duration_ms: 5000 } },
      { _id: '4', _index: 'eq-apm', _source: { '@timestamp': '2024-03-09T10:00:03Z', 'service.name': 'api-gateway', endpoint: '/health', status_code: 200, duration_ms: 5 } },
      { _id: '5', _index: 'eq-apm', _source: { '@timestamp': '2024-03-09T10:00:00Z', 'service.name': 'payment-service', endpoint: '/charge', status_code: 200, duration_ms: 89 } },
      { _id: '6', _index: 'eq-apm', _source: { '@timestamp': '2024-03-09T10:00:01Z', 'service.name': 'payment-service', endpoint: '/charge', status_code: 502, duration_ms: 3000 } },
      { _id: '7', _index: 'eq-apm', _source: { '@timestamp': '2024-03-09T10:00:02Z', 'service.name': 'payment-service', endpoint: '/refund', status_code: 201, duration_ms: 150 } },
      { _id: '8', _index: 'eq-apm', _source: { '@timestamp': '2024-03-09T10:00:03Z', 'service.name': 'payment-service', endpoint: '/charge', status_code: 500, duration_ms: 4500 } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      let score = 0;
      if (response.hits.hits.length === 0) score += 10;
      const byService = response.aggregations?.by_service;
      if (!byService?.buckets) return { correct: false, score, maxScore: 100, feedback: 'Missing "by_service" terms aggregation.' };
      score += 15;
      if (byService.buckets.length === 2) score += 10;
      // Check api-gateway has outcomes sub-agg
      const gwBucket = byService.buckets.find((b) => b.key === 'api-gateway');
      if (!gwBucket) return { correct: false, score: score + 5, maxScore: 100, feedback: 'Missing api-gateway bucket.' };
      const outcomes = gwBucket.outcomes as { buckets?: Array<{ key: string; doc_count: number }> } | undefined;
      if (!outcomes?.buckets) return { correct: false, score: score + 10, maxScore: 100, feedback: 'Missing "outcomes" filters sub-aggregation in api-gateway bucket.' };
      score += 25;
      const successBucket = outcomes.buckets.find((b) => b.key === 'success');
      const failureBucket = outcomes.buckets.find((b) => b.key === 'failure');
      // api-gateway: 3 success (200), 1 failure (500)
      if (successBucket?.doc_count === 3) score += 20;
      if (failureBucket?.doc_count === 1) score += 20;
      const correct = score >= 90;
      return { correct, score: Math.min(100, score), maxScore: 100, feedback: correct ? `SLO: api-gateway ${successBucket?.doc_count}/${(successBucket?.doc_count ?? 0) + (failureBucket?.doc_count ?? 0)} success. payment-service check nested outcomes.` : `Score: ${score}/100. Need: by_service -> outcomes (filters with "success" 2xx range and "failure" 5xx range).` };
    },
    maxScore: 100,
    timeLimitMs: 60000,
  },
];
