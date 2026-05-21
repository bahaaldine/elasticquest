import type { Challenge, EsqlResponse, ElasticBackend } from '../types';
import { validateEsqlChallenge } from './esql-helpers';

const esql12DissectGrok: Challenge = {
  id: 'esql-12-dissect-grok',
  domain: 'esql',
  difficulty: 'advanced',
  title: 'Pattern Extraction with DISSECT',
  description: `The index "eq-esql-access-logs" contains raw access log entries with fields: raw_log (keyword).

Each raw_log line follows this format: "<ip> - <user> [<timestamp>] <method> <path> <status>"

Example: "192.168.1.1 - admin [2024-01-15T10:00:00Z] GET /api/users 200"

Write an ES|QL query that uses DISSECT to extract the IP address as "ip", the HTTP method as "method", and the status code as "status_code" from each raw_log entry. Then filter to only show entries with status_code of "500" or "503".`,
  hints: [
    'DISSECT(field, "pattern %{name} more %{name2}") extracts named fields from text',
    'DISSECT uses literal separators between %{field} placeholders',
  ],
  indexName: 'eq-esql-access-logs',
  mapping: {
    properties: {
      raw_log: { type: 'keyword' },
    },
  },
  seedData: [
    { _id: '1', _index: 'eq-esql-access-logs', _source: { raw_log: '192.168.1.1 - admin [2024-01-15T10:00:00Z] GET /api/users 200' } },
    { _id: '2', _index: 'eq-esql-access-logs', _source: { raw_log: '10.0.0.5 - guest [2024-01-15T10:01:00Z] POST /api/login 401' } },
    { _id: '3', _index: 'eq-esql-access-logs', _source: { raw_log: '172.16.0.10 - system [2024-01-15T10:02:00Z] GET /api/health 500' } },
    { _id: '4', _index: 'eq-esql-access-logs', _source: { raw_log: '192.168.1.50 - admin [2024-01-15T10:03:00Z] DELETE /api/cache 204' } },
    { _id: '5', _index: 'eq-esql-access-logs', _source: { raw_log: '10.0.0.8 - api-svc [2024-01-15T10:04:00Z] GET /api/data 503' } },
    { _id: '6', _index: 'eq-esql-access-logs', _source: { raw_log: '172.16.0.20 - worker [2024-01-15T10:05:00Z] PUT /api/jobs 500' } },
  ],
  queryType: 'esql',
  expectedEsqlResponse: {
    columns: [
      { name: 'ip', type: 'keyword' },
      { name: 'method', type: 'keyword' },
      { name: 'status_code', type: 'keyword' },
    ],
    values: [
      ['172.16.0.10', 'GET', '500'],
      ['10.0.0.8', 'GET', '503'],
      ['172.16.0.20', 'PUT', '500'],
    ],
  },
  validate: async () => ({ correct: false, score: 0, maxScore: 100, feedback: 'Use validateEsql for ES|QL challenges.' }),
  validateEsql: async (response: EsqlResponse, query: string) => {
    return validateEsqlChallenge(response, query, {
      requiredPatterns: [
        { pattern: /\bFROM\b/i, points: 10, label: 'FROM' },
        { pattern: /\bDISSECT\b/i, points: 30, label: 'DISSECT' },
        { pattern: /\bWHERE\b/i, points: 20, label: 'WHERE' },
        { pattern: /\b(500|503)\b/, points: 15, label: 'status filter' },
      ],
      expectedColumns: ['ip', 'method', 'status_code'],
      expectedRowCount: 3,
    });
  },
  maxScore: 100,
  timeLimitMs: 45000,
};

const esql13Categorize: Challenge = {
  id: 'esql-13-categorize',
  domain: 'esql',
  difficulty: 'expert',
  title: 'Log Categorization',
  description: `The index "eq-esql-app-logs" contains application log messages with fields: message (text), service (keyword), @timestamp (date).

Write an ES|QL query that uses CATEGORIZE() to automatically group similar log messages into pattern categories. Count entries per category (as "count"), sort by count descending, and limit to 10 categories.

Note: CATEGORIZE() is available in ES|QL 8.18+. It auto-clusters text into pattern groups.`,
  hints: [
    'CATEGORIZE(field) creates a category column by clustering similar text patterns',
    'Use it inside STATS: STATS count = COUNT(*) BY category = CATEGORIZE(message)',
  ],
  indexName: 'eq-esql-app-logs',
  mapping: {
    properties: {
      message: { type: 'text' },
      service: { type: 'keyword' },
      '@timestamp': { type: 'date' },
    },
  },
  seedData: [
    { _id: '1', _index: 'eq-esql-app-logs', _source: { message: 'Connection to database timed out after 30s', service: 'api', '@timestamp': '2024-01-15T10:00:00Z' } },
    { _id: '2', _index: 'eq-esql-app-logs', _source: { message: 'Connection to database timed out after 45s', service: 'api', '@timestamp': '2024-01-15T10:01:00Z' } },
    { _id: '3', _index: 'eq-esql-app-logs', _source: { message: 'User login successful for user alice', service: 'auth', '@timestamp': '2024-01-15T10:02:00Z' } },
    { _id: '4', _index: 'eq-esql-app-logs', _source: { message: 'User login successful for user bob', service: 'auth', '@timestamp': '2024-01-15T10:03:00Z' } },
    { _id: '5', _index: 'eq-esql-app-logs', _source: { message: 'User login successful for user charlie', service: 'auth', '@timestamp': '2024-01-15T10:04:00Z' } },
    { _id: '6', _index: 'eq-esql-app-logs', _source: { message: 'Failed to process request: invalid JSON', service: 'api', '@timestamp': '2024-01-15T10:05:00Z' } },
    { _id: '7', _index: 'eq-esql-app-logs', _source: { message: 'Failed to process request: missing auth header', service: 'api', '@timestamp': '2024-01-15T10:06:00Z' } },
    { _id: '8', _index: 'eq-esql-app-logs', _source: { message: 'Connection to database timed out after 60s', service: 'api', '@timestamp': '2024-01-15T10:07:00Z' } },
  ],
  queryType: 'esql',
  expectedEsqlResponse: {
    columns: [
      { name: 'category', type: 'keyword' },
      { name: 'count', type: 'long' },
    ],
    values: [],
  },
  validate: async () => ({ correct: false, score: 0, maxScore: 100, feedback: 'Use validateEsql for ES|QL challenges.' }),
  validateEsql: async (response: EsqlResponse, query: string) => {
    return validateEsqlChallenge(response, query, {
      requiredPatterns: [
        { pattern: /\bFROM\b/i, points: 10, label: 'FROM' },
        { pattern: /\bSTATS\b/i, points: 15, label: 'STATS' },
        { pattern: /\bCATEGORIZE\b/i, points: 30, label: 'CATEGORIZE' },
        { pattern: /\bCOUNT\b/i, points: 15, label: 'COUNT' },
        { pattern: /\bSORT\b.*\bcount\b.*\bDESC\b/i, points: 15, label: 'SORT count DESC' },
        { pattern: /\bLIMIT\s+10\b/i, points: 10, label: 'LIMIT 10' },
      ],
      expectedColumns: ['category', 'count'],
    });
  },
  maxScore: 100,
  timeLimitMs: 60000,
};

const esql14ChangePoint: Challenge = {
  id: 'esql-14-change-point',
  domain: 'esql',
  difficulty: 'expert',
  title: 'Change Point Detection',
  description: `The index "eq-esql-request-logs" contains request count data with fields: count (integer), @timestamp (date).

Write an ES|QL query that:
1. Aggregates request counts into 1-minute time buckets (as "t")
2. Sums the count per bucket (as "c")
3. Sorts by t ascending
4. Uses CHANGE_POINT to detect spikes, dips, or trend changes in the "c" metric over the "t" time column
5. Filters to show only rows where the change point type is not null

Note: CHANGE_POINT is available in ES|QL 8.18+.`,
  hints: [
    'CHANGE_POINT value ON key detects changes in a sorted metric series',
    'It adds "type" and "pvalue" columns to the output',
    'First aggregate and sort, then pipe to CHANGE_POINT',
  ],
  indexName: 'eq-esql-request-logs',
  mapping: {
    properties: {
      count: { type: 'integer' },
      '@timestamp': { type: 'date' },
    },
  },
  seedData: [
    { _id: '1', _index: 'eq-esql-request-logs', _source: { count: 10, '@timestamp': '2024-01-15T10:00:00Z' } },
    { _id: '2', _index: 'eq-esql-request-logs', _source: { count: 12, '@timestamp': '2024-01-15T10:00:30Z' } },
    { _id: '3', _index: 'eq-esql-request-logs', _source: { count: 11, '@timestamp': '2024-01-15T10:01:00Z' } },
    { _id: '4', _index: 'eq-esql-request-logs', _source: { count: 13, '@timestamp': '2024-01-15T10:01:30Z' } },
    { _id: '5', _index: 'eq-esql-request-logs', _source: { count: 150, '@timestamp': '2024-01-15T10:02:00Z' } },
    { _id: '6', _index: 'eq-esql-request-logs', _source: { count: 200, '@timestamp': '2024-01-15T10:02:30Z' } },
    { _id: '7', _index: 'eq-esql-request-logs', _source: { count: 180, '@timestamp': '2024-01-15T10:03:00Z' } },
    { _id: '8', _index: 'eq-esql-request-logs', _source: { count: 15, '@timestamp': '2024-01-15T10:03:30Z' } },
    { _id: '9', _index: 'eq-esql-request-logs', _source: { count: 10, '@timestamp': '2024-01-15T10:04:00Z' } },
    { _id: '10', _index: 'eq-esql-request-logs', _source: { count: 11, '@timestamp': '2024-01-15T10:04:30Z' } },
  ],
  queryType: 'esql',
  expectedEsqlResponse: {
    columns: [
      { name: 't', type: 'date' },
      { name: 'c', type: 'long' },
      { name: 'type', type: 'keyword' },
      { name: 'pvalue', type: 'double' },
    ],
    values: [],
  },
  validate: async () => ({ correct: false, score: 0, maxScore: 100, feedback: 'Use validateEsql for ES|QL challenges.' }),
  validateEsql: async (response: EsqlResponse, query: string) => {
    return validateEsqlChallenge(response, query, {
      requiredPatterns: [
        { pattern: /\bFROM\b/i, points: 5, label: 'FROM' },
        { pattern: /\bSTATS\b/i, points: 10, label: 'STATS' },
        { pattern: /\b(BUCKET|DATE_TRUNC)\b/i, points: 10, label: 'BUCKET or DATE_TRUNC' },
        { pattern: /\bSORT\b/i, points: 10, label: 'SORT' },
        { pattern: /\bCHANGE_POINT\b/i, points: 30, label: 'CHANGE_POINT' },
        { pattern: /\bWHERE\b.*\btype\b.*\bIS\s+NOT\s+NULL\b/i, points: 20, label: 'WHERE type IS NOT NULL' },
      ],
    });
  },
  maxScore: 100,
  timeLimitMs: 60000,
};

const esql15Inlinestats: Challenge = {
  id: 'esql-15-inlinestats',
  domain: 'esql',
  difficulty: 'expert',
  title: 'Inline Statistics with INLINESTATS',
  description: `The index "eq-esql-sales" contains sales records with fields: product (keyword), region (keyword), revenue (float), @timestamp (date).

Write an ES|QL query that:
1. Retrieves all sales records
2. Uses INLINESTATS to add the average revenue per region (as "region_avg") to each row without collapsing the rows
3. Uses EVAL to add a "vs_avg" column that shows the difference between the row's revenue and the region average (revenue - region_avg)
4. Sorts by vs_avg descending
5. Limits to 10 results

Note: INLINESTATS is available in ES|QL 9.1+. Unlike STATS, it does NOT collapse rows — it adds aggregated columns alongside the original data.`,
  hints: [
    'INLINESTATS agg = AGG(field) BY grouping adds the aggregation as a new column to every row',
    'Unlike STATS, INLINESTATS preserves all original rows',
  ],
  indexName: 'eq-esql-sales',
  mapping: {
    properties: {
      product: { type: 'keyword' },
      region: { type: 'keyword' },
      revenue: { type: 'float' },
      '@timestamp': { type: 'date' },
    },
  },
  seedData: [
    { _id: '1', _index: 'eq-esql-sales', _source: { product: 'Widget A', region: 'US', revenue: 1200.00, '@timestamp': '2024-01-15T10:00:00Z' } },
    { _id: '2', _index: 'eq-esql-sales', _source: { product: 'Widget B', region: 'US', revenue: 800.00, '@timestamp': '2024-01-15T10:01:00Z' } },
    { _id: '3', _index: 'eq-esql-sales', _source: { product: 'Widget A', region: 'EU', revenue: 950.00, '@timestamp': '2024-01-15T10:02:00Z' } },
    { _id: '4', _index: 'eq-esql-sales', _source: { product: 'Widget C', region: 'EU', revenue: 1500.00, '@timestamp': '2024-01-15T10:03:00Z' } },
    { _id: '5', _index: 'eq-esql-sales', _source: { product: 'Widget B', region: 'APAC', revenue: 600.00, '@timestamp': '2024-01-15T10:04:00Z' } },
    { _id: '6', _index: 'eq-esql-sales', _source: { product: 'Widget A', region: 'APAC', revenue: 450.00, '@timestamp': '2024-01-15T10:05:00Z' } },
    { _id: '7', _index: 'eq-esql-sales', _source: { product: 'Widget C', region: 'US', revenue: 2000.00, '@timestamp': '2024-01-15T10:06:00Z' } },
  ],
  queryType: 'esql',
  expectedEsqlResponse: {
    columns: [
      { name: 'product', type: 'keyword' },
      { name: 'region', type: 'keyword' },
      { name: 'revenue', type: 'float' },
      { name: 'region_avg', type: 'double' },
      { name: 'vs_avg', type: 'double' },
    ],
    values: [],
  },
  validate: async () => ({ correct: false, score: 0, maxScore: 100, feedback: 'Use validateEsql for ES|QL challenges.' }),
  validateEsql: async (response: EsqlResponse, query: string) => {
    return validateEsqlChallenge(response, query, {
      requiredPatterns: [
        { pattern: /\bFROM\b/i, points: 5, label: 'FROM' },
        { pattern: /\bINLINE\s*STATS\b/i, points: 30, label: 'INLINESTATS' },
        { pattern: /\bAVG\b/i, points: 10, label: 'AVG' },
        { pattern: /\bBY\b.*\bregion\b/i, points: 10, label: 'BY region' },
        { pattern: /\bEVAL\b/i, points: 15, label: 'EVAL' },
        { pattern: /\bSORT\b.*\bvs_avg\b.*\bDESC\b/i, points: 15, label: 'SORT vs_avg DESC' },
        { pattern: /\bLIMIT\s+10\b/i, points: 5, label: 'LIMIT 10' },
      ],
      expectedColumns: ['product', 'region', 'revenue', 'region_avg', 'vs_avg'],
    });
  },
  maxScore: 100,
  timeLimitMs: 60000,
};

export const esqlChallenges: Challenge[] = [
  esql12DissectGrok,
  esql13Categorize,
  esql14ChangePoint,
  esql15Inlinestats,
];
