/**
 * Extended Observability scenarios — aligned to LLM observability,
 * SLO management, and service health skills.
 *
 * Scenarios:
 * 1. observability-llm-obs: ES|QL over LLM trace data (~300 docs)
 * 2. observability-manage-slos: API call to create an SLO
 * 3. observability-service-health: ES|QL over APM transaction data (~500 docs)
 */

import type {
  Scenario,
  EsqlResponse,
  Document,
  IndexMapping,
} from '../types';

// ---------------------------------------------------------------------------
// Seeded PRNG
// ---------------------------------------------------------------------------

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// ---------------------------------------------------------------------------
// LLM trace data generator (~300 docs)
// ---------------------------------------------------------------------------

const LLM_MODELS = [
  'gpt-4o', 'gpt-4o-mini', 'claude-sonnet-4',
  'claude-haiku', 'llama-3-70b', 'mistral-large',
];

const LLM_OPERATIONS = [
  'chat.completion', 'embedding', 'function_call',
  'tool_use', 'summarization', 'classification',
];

const LLM_SERVICES = [
  'rag-pipeline', 'chat-api', 'support-bot',
  'content-generator', 'search-enhancer',
];

const LLM_ERROR_MESSAGES = [
  'rate_limit_exceeded: Too many requests',
  'context_length_exceeded: Maximum context length is 128000 tokens',
  'timeout: Request timed out after 60s',
  'invalid_api_key: Incorrect API key provided',
  'server_error: Internal server error from provider',
];

export const llmTraceMapping: IndexMapping = {
  properties: {
    '@timestamp': { type: 'date' },
    'service.name': { type: 'keyword' },
    'llm.model': { type: 'keyword' },
    'llm.operation': { type: 'keyword' },
    'llm.provider': { type: 'keyword' },
    'llm.input_tokens': { type: 'integer' },
    'llm.output_tokens': { type: 'integer' },
    'llm.total_tokens': { type: 'integer' },
    'event.duration_ms': { type: 'long' },
    'event.outcome': { type: 'keyword' },
    'error.message': { type: 'text' },
    'trace.id': { type: 'keyword' },
  },
};

export function generateLlmTraces(count = 300, seed = 42): Document[] {
  const rng = seededRng(seed);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const docs: Document[] = [];

  const baseTime = new Date('2024-08-10T09:00:00Z').getTime();
  const durationMs = 8 * 60 * 60 * 1000; // 8 hours

  for (let i = 0; i < count; i++) {
    const offsetMs = Math.floor(rng() * durationMs);
    const ts = new Date(baseTime + offsetMs).toISOString();
    const model = pick(LLM_MODELS);
    const operation = pick(LLM_OPERATIONS);
    const service = pick(LLM_SERVICES);

    // Determine provider from model name
    let provider: string;
    if (model.startsWith('gpt')) provider = 'openai';
    else if (model.startsWith('claude')) provider = 'anthropic';
    else if (model.startsWith('llama')) provider = 'meta';
    else provider = 'mistral';

    // Token counts vary by model and operation
    const isEmbedding = operation === 'embedding';
    const inputTokens = isEmbedding
      ? 50 + Math.floor(rng() * 500)
      : 200 + Math.floor(rng() * 4000);
    const outputTokens = isEmbedding
      ? 0
      : 50 + Math.floor(rng() * 2000);
    const totalTokens = inputTokens + outputTokens;

    // Duration: larger models are slower
    const modelMultiplier = model.includes('4o') || model.includes('sonnet')
      ? 2.0
      : model.includes('70b') || model.includes('large')
        ? 1.5
        : 1.0;
    const baseDurationMs = isEmbedding
      ? 50 + Math.floor(rng() * 200)
      : 500 + Math.floor(rng() * 5000);
    const durationMsVal = Math.floor(baseDurationMs * modelMultiplier);

    // ~8% error rate
    const isError = rng() < 0.08;
    const outcome = isError ? 'failure' : 'success';
    const errorMessage = isError ? pick(LLM_ERROR_MESSAGES) : undefined;

    const doc: Record<string, unknown> = {
      '@timestamp': ts,
      'service.name': service,
      'llm.model': model,
      'llm.operation': operation,
      'llm.provider': provider,
      'llm.input_tokens': inputTokens,
      'llm.output_tokens': outputTokens,
      'llm.total_tokens': totalTokens,
      'event.duration_ms': durationMsVal,
      'event.outcome': outcome,
      'trace.id': `trace-${Math.floor(rng() * 999999).toString(16).padStart(6, '0')}`,
    };

    if (errorMessage) {
      doc['error.message'] = errorMessage;
    }

    docs.push({
      _id: `llm-${i + 1}`,
      _index: 'eq-llm-traces',
      _source: doc,
    });
  }

  docs.sort((a, b) =>
    (a._source['@timestamp'] as string).localeCompare(
      b._source['@timestamp'] as string,
    ),
  );

  return docs;
}

export function getLlmTraceFacts(docs: Document[]): {
  totalCount: number;
  errorCount: number;
  modelNames: string[];
  avgDurationMs: number;
} {
  let errorCount = 0;
  let totalDuration = 0;
  const models = new Set<string>();

  for (const doc of docs) {
    if (doc._source['event.outcome'] === 'failure') errorCount++;
    totalDuration += doc._source['event.duration_ms'] as number;
    models.add(doc._source['llm.model'] as string);
  }

  return {
    totalCount: docs.length,
    errorCount,
    modelNames: [...models].sort(),
    avgDurationMs: Math.round(totalDuration / docs.length),
  };
}

// ---------------------------------------------------------------------------
// APM transaction data generator (~500 docs)
// ---------------------------------------------------------------------------

const APM_SERVICES = [
  'frontend-web', 'api-gateway', 'order-service',
  'payment-service', 'inventory-service', 'notification-service',
  'auth-service', 'search-service',
];

const APM_TRANSACTION_TYPES = ['request', 'worker', 'scheduled'];
const APM_ENDPOINTS = [
  'GET /api/products', 'POST /api/orders', 'GET /api/users/:id',
  'POST /api/payments', 'GET /api/search', 'POST /api/auth/login',
  'GET /api/inventory/:sku', 'POST /api/notifications',
  'GET /api/health', 'PUT /api/users/:id',
];

export const apmTransactionMapping: IndexMapping = {
  properties: {
    '@timestamp': { type: 'date' },
    'service.name': { type: 'keyword' },
    'transaction.name': { type: 'keyword' },
    'transaction.type': { type: 'keyword' },
    'transaction.duration.us': { type: 'long' },
    'transaction.result': { type: 'keyword' },
    'http.response.status_code': { type: 'integer' },
    'event.outcome': { type: 'keyword' },
    'host.name': { type: 'keyword' },
    'trace.id': { type: 'keyword' },
  },
};

export function generateApmTransactions(count = 500, seed = 42): Document[] {
  const rng = seededRng(seed);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const docs: Document[] = [];

  const baseTime = new Date('2024-08-12T10:00:00Z').getTime();
  const durationMs = 2 * 60 * 60 * 1000; // 2 hours

  for (let i = 0; i < count; i++) {
    const offsetMs = Math.floor(rng() * durationMs);
    const ts = new Date(baseTime + offsetMs).toISOString();
    const service = pick(APM_SERVICES);
    const txName = pick(APM_ENDPOINTS);
    const txType = pick(APM_TRANSACTION_TYPES);

    // payment-service is experiencing issues (~20% errors)
    const isPaymentIssue =
      service === 'payment-service' && rng() < 0.20;
    // other services have ~3% error rate
    const isOtherError =
      service !== 'payment-service' && rng() < 0.03;
    const isError = isPaymentIssue || isOtherError;

    // Duration in microseconds: errors tend to be slower (timeouts)
    let durationUs: number;
    if (isError) {
      durationUs = 5_000_000 + Math.floor(rng() * 25_000_000); // 5-30 sec
    } else {
      // Normal: 10ms to 2s
      durationUs = 10_000 + Math.floor(rng() * 1_990_000);
    }

    const statusCode = isError
      ? pick([500, 502, 503, 504])
      : pick([200, 200, 200, 201, 204]);

    const outcome = isError ? 'failure' : 'success';
    const result = isError ? 'HTTP 5xx' : 'HTTP 2xx';
    const hostIdx = Math.floor(rng() * 3) + 1;

    docs.push({
      _id: `apm-${i + 1}`,
      _index: 'eq-apm-transactions',
      _source: {
        '@timestamp': ts,
        'service.name': service,
        'transaction.name': txName,
        'transaction.type': txType,
        'transaction.duration.us': durationUs,
        'transaction.result': result,
        'http.response.status_code': statusCode,
        'event.outcome': outcome,
        'host.name': `prod-${service.split('-')[0]}-0${hostIdx}`,
        'trace.id': `trace-${Math.floor(rng() * 999999).toString(16).padStart(6, '0')}`,
      },
    });
  }

  docs.sort((a, b) =>
    (a._source['@timestamp'] as string).localeCompare(
      b._source['@timestamp'] as string,
    ),
  );

  return docs;
}

export function getApmFacts(docs: Document[]): {
  totalCount: number;
  errorCount: number;
  serviceNames: string[];
  worstService: string;
  worstServiceErrorRate: number;
} {
  let errorCount = 0;
  const serviceErrors: Record<string, number> = {};
  const serviceTotals: Record<string, number> = {};

  for (const doc of docs) {
    const svc = doc._source['service.name'] as string;
    serviceTotals[svc] = (serviceTotals[svc] ?? 0) + 1;
    if (doc._source['event.outcome'] === 'failure') {
      errorCount++;
      serviceErrors[svc] = (serviceErrors[svc] ?? 0) + 1;
    }
  }

  let worstService = '';
  let worstRate = 0;
  for (const [svc, total] of Object.entries(serviceTotals)) {
    const rate = (serviceErrors[svc] ?? 0) / total;
    if (rate > worstRate) {
      worstService = svc;
      worstRate = rate;
    }
  }

  return {
    totalCount: docs.length,
    errorCount,
    serviceNames: Object.keys(serviceTotals).sort(),
    worstService,
    worstServiceErrorRate: Math.round(worstRate * 100),
  };
}

// ---------------------------------------------------------------------------
// Placeholder data for API-call scenarios
// ---------------------------------------------------------------------------

const placeholderDocs: Document[] = [
  { _id: 'p-1', _index: 'eq-placeholder', _source: { type: 'placeholder' } },
];
const placeholderMapping: IndexMapping = {
  properties: { type: { type: 'keyword' } },
};

// ---------------------------------------------------------------------------
// Generated data
// ---------------------------------------------------------------------------

const llmDocs = generateLlmTraces(300, 42);
const llmFacts = getLlmTraceFacts(llmDocs);

const apmDocs = generateApmTransactions(500, 42);
const apmFacts = getApmFacts(apmDocs);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esqlHasColumn(resp: EsqlResponse, name: string): boolean {
  return resp.columns.some((c) => c.name === name);
}

function esqlGetValues(resp: EsqlResponse, columnName: string): unknown[] {
  const idx = resp.columns.findIndex((c) => c.name === columnName);
  if (idx === -1) return [];
  return resp.values.map((row) => row[idx]);
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

export const observabilityExtendedScenarios: Scenario[] = [
  // 1. LLM Observability — ES|QL over LLM trace data
  {
    id: 'obs-ext-1-llm-traces',
    skillId: 'observability-llm-obs',
    domain: 'observability',
    difficulty: 'intermediate',
    title: 'LLM Observability: Model Performance Analysis',
    description:
      'Write an ES|QL query to analyze LLM trace data. For each model, compute:\n' +
      '- Total number of calls\n' +
      '- Average duration in milliseconds\n' +
      '- Total tokens consumed (sum of llm.total_tokens)\n' +
      '- Error count (where event.outcome == "failure")\n\n' +
      'Sort by total tokens descending to identify the most resource-intensive models.\n\n' +
      `The index contains ${llmFacts.totalCount} LLM trace documents across ` +
      `${llmFacts.modelNames.length} models with ${llmFacts.errorCount} errors.`,
    hints: [
      'Use FROM with the LLM traces index',
      'Use STATS with COUNT(*), AVG(), SUM() grouped BY llm.model',
      'To count errors, use SUM(CASE(event.outcome == "failure", 1, 0)) or a similar pattern',
      'SORT by total tokens descending',
    ],
    indexName: 'eq-llm-traces',
    seedData: llmDocs,
    mapping: llmTraceMapping,
    responseFormat: 'esql',
    maxScore: 100,
    timeLimitMs: 45000,
    skillPaths: ['observability/observability-llm-obs/SKILL.md'],
    validate: async (response) => {
      const resp = response as EsqlResponse;

      if (!resp.columns || !resp.values) {
        return {
          correct: false,
          score: 0,
          maxScore: 100,
          feedback: 'No ES|QL results returned.',
        };
      }

      let score = 0;
      const feedback: string[] = [];

      // Should have llm.model column
      if (esqlHasColumn(resp, 'llm.model')) {
        score += 15;
      } else {
        feedback.push('Missing llm.model column.');
      }

      // Should have a count column
      const hasCount = resp.columns.some((c) =>
        c.name.toLowerCase().includes('count') ||
        c.name.toLowerCase().includes('calls'),
      );
      if (hasCount) {
        score += 15;
      } else {
        feedback.push('Missing call count column.');
      }

      // Should have avg duration
      const hasAvgDuration = resp.columns.some(
        (c) =>
          (c.name.toLowerCase().includes('avg') &&
            c.name.toLowerCase().includes('duration')) ||
          c.name.toLowerCase().includes('latency'),
      );
      if (hasAvgDuration) {
        score += 15;
      } else {
        feedback.push('Missing average duration column.');
      }

      // Should have total tokens
      const hasTokens = resp.columns.some(
        (c) =>
          c.name.toLowerCase().includes('token') ||
          c.name.toLowerCase().includes('sum'),
      );
      if (hasTokens) {
        score += 15;
      } else {
        feedback.push('Missing total tokens column.');
      }

      // Should cover all models
      const models = new Set(esqlGetValues(resp, 'llm.model'));
      if (models.size >= llmFacts.modelNames.length) {
        score += 15;
      } else if (models.size >= 3) {
        score += 8;
        feedback.push(
          `Expected ${llmFacts.modelNames.length} models, found ${models.size}.`,
        );
      } else {
        feedback.push('Expected all models in the output.');
      }

      // Should have error count column (bonus)
      const hasErrors = resp.columns.some(
        (c) =>
          c.name.toLowerCase().includes('error') ||
          c.name.toLowerCase().includes('fail'),
      );
      if (hasErrors) {
        score += 10;
      } else {
        feedback.push('Including error counts per model would be valuable.');
      }

      // Sorted by total tokens descending
      const tokenIdx = resp.columns.findIndex(
        (c) =>
          c.name.toLowerCase().includes('token') ||
          c.name.toLowerCase().includes('sum'),
      );
      if (tokenIdx >= 0 && resp.values.length >= 2) {
        const vals = resp.values.map((r) => r[tokenIdx] as number);
        const sorted = vals.every(
          (v, i) => i === 0 || v <= vals[i - 1],
        );
        if (sorted) {
          score += 15;
        } else {
          feedback.push('Results not sorted by total tokens descending.');
        }
      }

      return {
        correct: score >= 70,
        score,
        maxScore: 100,
        feedback:
          score >= 70
            ? `Correct! LLM performance analysis across ${llmFacts.modelNames.length} models.`
            : feedback.join(' '),
      };
    },
  },

  // 2. Manage SLOs — API call to create an SLO
  {
    id: 'obs-ext-2-create-slo',
    skillId: 'observability-manage-slos',
    domain: 'observability',
    difficulty: 'intermediate',
    title: 'Create a Service Level Objective (SLO)',
    description:
      'Produce a JSON API call body for POST /api/slos to create an SLO with:\n' +
      '- Name: "checkout-availability"\n' +
      '- Description: "Checkout service availability SLO"\n' +
      '- SLI type: "sli.kql.custom" with:\n' +
      '  - good filter: "service.name: checkout-service AND http.response.status_code < 500"\n' +
      '  - total filter: "service.name: checkout-service"\n' +
      '  - index: "apm-*"\n' +
      '  - timestamp_field: "@timestamp"\n' +
      '- Objective: target 0.995 (99.5%)\n' +
      '- Time window: rolling, duration "30d"\n' +
      '- Budgeting method: "occurrences"\n' +
      '- Tags: ["checkout", "availability", "tier-1"]\n\n' +
      'Return ONLY the JSON body.',
    hints: [
      'The top-level fields include: name, description, indicator, time_window, budgeting_method, objective, tags',
      'The indicator has type "sli.kql.custom" with params containing good, total, index, timestamp_field',
      'time_window has type "rolling" and duration "30d"',
      'objective has target as a decimal (0.995)',
    ],
    indexName: 'eq-placeholder',
    seedData: placeholderDocs,
    mapping: placeholderMapping,
    responseFormat: 'api-call',
    maxScore: 100,
    timeLimitMs: 30000,
    skillPaths: ['observability/observability-manage-slos/SKILL.md'],
    validate: async (response) => {
      const raw = response as unknown as Record<string, unknown>;
      let body: Record<string, unknown>;

      try {
        body =
          typeof raw === 'object' && raw !== null
            ? (raw as Record<string, unknown>)
            : JSON.parse(String(raw));
      } catch {
        return {
          correct: false,
          score: 0,
          maxScore: 100,
          feedback: 'Response is not valid JSON.',
        };
      }

      let score = 0;
      const feedback: string[] = [];

      // name
      if (body.name === 'checkout-availability') {
        score += 10;
      } else {
        feedback.push(
          `Expected name "checkout-availability", got "${String(body.name)}".`,
        );
      }

      // description
      if (typeof body.description === 'string' && body.description.length > 0) {
        score += 5;
      } else {
        feedback.push('Missing description.');
      }

      // indicator
      const indicator = body.indicator as Record<string, unknown> | undefined;
      if (indicator && typeof indicator === 'object') {
        // type
        if (
          indicator.type === 'sli.kql.custom' ||
          String(indicator.type).includes('kql')
        ) {
          score += 10;
        } else {
          feedback.push('Indicator type should be "sli.kql.custom".');
        }

        // params
        const params = indicator.params as Record<string, unknown> | undefined;
        if (params && typeof params === 'object') {
          // good filter
          const good = params.good as string | Record<string, unknown> | undefined;
          const goodStr = typeof good === 'string' ? good : JSON.stringify(good ?? '');
          if (
            goodStr.includes('checkout-service') &&
            (goodStr.includes('status_code') || goodStr.includes('500'))
          ) {
            score += 10;
          } else {
            feedback.push('Good filter should reference checkout-service and status codes.');
          }

          // total filter
          const total = params.total as string | Record<string, unknown> | undefined;
          const totalStr = typeof total === 'string' ? total : JSON.stringify(total ?? '');
          if (totalStr.includes('checkout-service')) {
            score += 10;
          } else {
            feedback.push('Total filter should reference checkout-service.');
          }

          // index
          if (
            params.index === 'apm-*' ||
            (typeof params.index === 'string' && params.index.includes('apm'))
          ) {
            score += 5;
          } else {
            feedback.push('Index should be "apm-*".');
          }

          // timestamp_field
          if (params.timestamp_field === '@timestamp') {
            score += 5;
          }
        } else {
          feedback.push('Missing indicator.params.');
        }
      } else {
        feedback.push('Missing indicator object.');
      }

      // objective
      const objective = body.objective as Record<string, unknown> | undefined;
      if (objective && typeof objective === 'object') {
        const target = objective.target as number | undefined;
        if (target === 0.995 || target === 99.5) {
          score += 15;
        } else {
          feedback.push(
            `Objective target should be 0.995 (99.5%), got ${String(target)}.`,
          );
        }
      } else if (typeof body.objective === 'number') {
        // Some models put objective as a direct number
        if (body.objective === 0.995) score += 15;
        else feedback.push('Objective target should be 0.995.');
      } else {
        feedback.push('Missing objective.');
      }

      // time_window
      const tw = body.time_window as Record<string, unknown> | undefined;
      if (tw && typeof tw === 'object') {
        const twStr = JSON.stringify(tw);
        if (twStr.includes('rolling') && twStr.includes('30d')) {
          score += 10;
        } else {
          feedback.push('time_window should be rolling with duration "30d".');
        }
      } else {
        feedback.push('Missing time_window.');
      }

      // budgeting_method
      if (body.budgeting_method === 'occurrences') {
        score += 10;
      } else {
        feedback.push(
          `budgeting_method should be "occurrences", got "${String(body.budgeting_method)}".`,
        );
      }

      // tags
      const tags = body.tags as string[] | undefined;
      if (Array.isArray(tags) && tags.length >= 2) {
        score += 10;
        if (tags.includes('checkout') && tags.includes('availability')) {
          // already counted above
        }
      } else {
        feedback.push('Missing or incomplete tags array.');
      }

      return {
        correct: score >= 70,
        score,
        maxScore: 100,
        feedback:
          score >= 70
            ? 'Correct! SLO body with KQL indicator, rolling window, and occurrences budgeting.'
            : feedback.join(' '),
      };
    },
  },

  // 3. Service Health — ES|QL over APM transactions
  {
    id: 'obs-ext-3-service-health',
    skillId: 'observability-service-health',
    domain: 'observability',
    difficulty: 'advanced',
    title: 'Service Health Assessment via APM Data',
    description:
      'Write an ES|QL query to assess service health across all services. For each service compute:\n' +
      '- Total request count\n' +
      '- Error count (event.outcome == "failure")\n' +
      '- Error rate as a percentage\n' +
      '- Average latency in milliseconds (transaction.duration.us is in microseconds)\n' +
      '- P95 latency in milliseconds (use PERCENTILE function)\n\n' +
      'Sort by error rate descending to surface the unhealthiest services first.\n\n' +
      `The index contains ${apmFacts.totalCount} APM transactions across ` +
      `${apmFacts.serviceNames.length} services. One service has a significantly ` +
      'higher error rate than the others.',
    hints: [
      'Use STATS grouped BY service.name',
      'COUNT(*) for total, SUM(CASE(event.outcome == "failure", 1, 0)) for errors',
      'Divide error count by total count and multiply by 100 for error rate',
      'Use PERCENTILE(transaction.duration.us, 95) for P95',
      'Divide microseconds by 1000 for milliseconds using EVAL',
    ],
    indexName: 'eq-apm-transactions',
    seedData: apmDocs,
    mapping: apmTransactionMapping,
    responseFormat: 'esql',
    maxScore: 100,
    timeLimitMs: 60000,
    skillPaths: ['observability/observability-service-health/SKILL.md'],
    validate: async (response) => {
      const resp = response as EsqlResponse;

      if (!resp.columns || !resp.values) {
        return {
          correct: false,
          score: 0,
          maxScore: 100,
          feedback: 'No ES|QL results returned.',
        };
      }

      let score = 0;
      const feedback: string[] = [];

      // Should have service.name column
      if (esqlHasColumn(resp, 'service.name')) {
        score += 10;
      } else {
        feedback.push('Missing service.name column.');
      }

      // Should have a total/count column
      const hasCount = resp.columns.some(
        (c) =>
          c.name.toLowerCase().includes('count') ||
          c.name.toLowerCase().includes('total') ||
          c.name.toLowerCase().includes('request'),
      );
      if (hasCount) {
        score += 10;
      } else {
        feedback.push('Missing request count column.');
      }

      // Should have error count or error rate
      const hasErrorMetric = resp.columns.some(
        (c) =>
          c.name.toLowerCase().includes('error') ||
          c.name.toLowerCase().includes('fail'),
      );
      if (hasErrorMetric) {
        score += 15;
      } else {
        feedback.push('Missing error count or error rate column.');
      }

      // Should have avg latency
      const hasAvgLatency = resp.columns.some(
        (c) =>
          (c.name.toLowerCase().includes('avg') &&
            (c.name.toLowerCase().includes('duration') ||
              c.name.toLowerCase().includes('latency'))) ||
          c.name.toLowerCase().includes('mean'),
      );
      if (hasAvgLatency) {
        score += 10;
      } else {
        feedback.push('Missing average latency column.');
      }

      // Should have p95 latency (percentile)
      const hasP95 = resp.columns.some(
        (c) =>
          c.name.toLowerCase().includes('p95') ||
          c.name.toLowerCase().includes('percentile') ||
          c.name.toLowerCase().includes('95'),
      );
      if (hasP95) {
        score += 15;
      } else {
        feedback.push('Missing P95 latency column.');
      }

      // Should cover all services
      const services = new Set(esqlGetValues(resp, 'service.name'));
      if (services.size >= apmFacts.serviceNames.length) {
        score += 10;
      } else if (services.size >= 4) {
        score += 5;
        feedback.push(
          `Expected ${apmFacts.serviceNames.length} services, found ${services.size}.`,
        );
      } else {
        feedback.push('Expected all services in the output.');
      }

      // payment-service should be the worst (highest error rate) —
      // it should appear first if sorted by error rate desc
      const svcIdx = resp.columns.findIndex(
        (c) => c.name === 'service.name',
      );
      if (svcIdx >= 0 && resp.values.length > 0) {
        if (resp.values[0][svcIdx] === apmFacts.worstService) {
          score += 20;
        } else if (
          esqlGetValues(resp, 'service.name').includes(apmFacts.worstService)
        ) {
          score += 8;
          feedback.push(
            `${apmFacts.worstService} should be the top result (highest error rate).`,
          );
        } else {
          feedback.push(
            `Expected ${apmFacts.worstService} in results (it has ~${apmFacts.worstServiceErrorRate}% error rate).`,
          );
        }
      }

      // Results should be sorted (descending by error rate)
      if (resp.values.length >= 2) {
        score += 10;
      }

      return {
        correct: score >= 70,
        score,
        maxScore: 100,
        feedback:
          score >= 70
            ? `Correct! Service health assessment — ${apmFacts.worstService} identified ` +
              `with ~${apmFacts.worstServiceErrorRate}% error rate.`
            : feedback.join(' '),
      };
    },
  },
];
