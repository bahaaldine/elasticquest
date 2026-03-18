import type { Challenge, ValidationResult } from '../../types';

// ---------------------------------------------------------------------------
// Helper: validate a SQL string via pattern-matching checks
// ---------------------------------------------------------------------------

interface ValidateSqlOptions {
  /** Strings that MUST appear (case-insensitive) */
  mustContain?: string[];
  /** Groups where at least ONE string in each group must appear */
  mustContainAny?: string[][];
  /** Strings that must NOT appear (case-insensitive) */
  mustNotContain?: string[];
  /** RegExps that must match */
  mustMatch?: RegExp[];
  /** The expected table name (must appear in the query) */
  tableName?: string;
}

function validateSql(sql: string, opts: ValidateSqlOptions): ValidationResult {
  const checks: { label: string; pass: boolean }[] = [];
  const lower = sql.toLowerCase();

  if (opts.tableName) {
    checks.push({
      label: `References table "${opts.tableName}"`,
      pass: lower.includes(opts.tableName.toLowerCase()),
    });
  }

  if (opts.mustContain) {
    for (const token of opts.mustContain) {
      checks.push({
        label: `Contains "${token}"`,
        pass: lower.includes(token.toLowerCase()),
      });
    }
  }

  if (opts.mustContainAny) {
    for (const group of opts.mustContainAny) {
      const found = group.some((t) => lower.includes(t.toLowerCase()));
      checks.push({
        label: `Contains one of [${group.join(' | ')}]`,
        pass: found,
      });
    }
  }

  if (opts.mustNotContain) {
    for (const token of opts.mustNotContain) {
      checks.push({
        label: `Does not contain "${token}"`,
        pass: !lower.includes(token.toLowerCase()),
      });
    }
  }

  if (opts.mustMatch) {
    for (const re of opts.mustMatch) {
      checks.push({
        label: `Matches ${re.toString()}`,
        pass: re.test(sql),
      });
    }
  }

  const total = checks.length;
  const passed = checks.filter((c) => c.pass).length;
  const pointsPer = total > 0 ? 100 / total : 0;
  const score = Math.round(passed * pointsPer);
  const failed = checks.filter((c) => !c.pass);
  const feedback = failed.length === 0
    ? 'All structural checks passed.'
    : `Failed: ${failed.map((f) => f.label).join('; ')}`;

  return {
    correct: passed === total,
    score,
    maxScore: 100,
    feedback,
  };
}

// ---------------------------------------------------------------------------
// validateQuery — entry point used by the benchmark runner for SQL challenges
// ---------------------------------------------------------------------------

function validateQuery(sql: string, opts: ValidateSqlOptions): ValidationResult {
  if (!sql || typeof sql !== 'string' || sql.trim().length === 0) {
    return { correct: false, score: 0, maxScore: 100, feedback: 'No SQL query provided.' };
  }
  return validateSql(sql, opts);
}

// ---------------------------------------------------------------------------
// 10 PostgreSQL challenges — the same AI/LLM use-cases Elasticsearch handles
// natively. Each challenge asks the model to achieve the equivalent result in
// PostgreSQL, highlighting where PG falls short.
// ---------------------------------------------------------------------------

export const postgresqlChallenges: Challenge[] = [
  // -----------------------------------------------------------------------
  // pg-1  Semantic / Vector Search  (intermediate)
  // -----------------------------------------------------------------------
  {
    id: 'pg-1-semantic-search',
    domain: 'vector-search' as Challenge['domain'],
    difficulty: 'intermediate',
    title: 'Semantic Search with pgvector',
    description: `In Elasticsearch, semantic (vector) search is built-in via the dense_vector field type and the top-level knn parameter — no extensions required.

In PostgreSQL you need the pgvector extension. Given the following schema:

  CREATE EXTENSION IF NOT EXISTS vector;
  CREATE TABLE documents (
    id       SERIAL PRIMARY KEY,
    title    TEXT,
    content  TEXT,
    embedding vector(384),
    category TEXT,
    created_at TIMESTAMP
  );

Write a SQL query that finds the 5 most similar documents to a given query vector (use a placeholder $1 of type vector(384)). Use the <-> cosine distance operator, ORDER BY distance ascending, LIMIT 5.

Respond with ONLY the SQL query. No markdown, no explanation.`,
    hints: [
      'Use ORDER BY embedding <-> $1 to sort by cosine distance',
      'LIMIT 5 for top-5 results',
      'pgvector uses <-> for cosine distance by default',
    ],
    indexName: 'eq-pg-documents',
    seedData: [],
    mapping: { properties: {} },
    validate: async (): Promise<ValidationResult> =>
      ({ correct: false, score: 0, maxScore: 100, feedback: '' }),
    maxScore: 100,
    timeLimitMs: 30000,
    datastore: 'postgresql',
  } as Challenge & { datastore: string },

  // -----------------------------------------------------------------------
  // pg-2  Hybrid Search  (advanced)
  // -----------------------------------------------------------------------
  {
    id: 'pg-2-hybrid-search',
    domain: 'full-text-search' as Challenge['domain'],
    difficulty: 'advanced',
    title: 'Hybrid Full-Text + Vector Search',
    description: `Elasticsearch performs hybrid search natively: supply both a "query" (BM25) and "knn" (vector) block at the top level and ES automatically combines the scores with reciprocal rank fusion.

PostgreSQL has NO native hybrid search operator. You must manually combine ts_rank (full-text) with pgvector distance into a single score.

Schema (same as pg-1):

  CREATE EXTENSION IF NOT EXISTS vector;
  CREATE TABLE documents (
    id       SERIAL PRIMARY KEY,
    title    TEXT,
    content  TEXT,
    embedding vector(384),
    category TEXT,
    created_at TIMESTAMP
  );

Write a single SQL query that:
1. Filters to rows where to_tsvector('english', content) @@ plainto_tsquery('english', 'machine learning')
2. Computes a combined score: (ts_rank(to_tsvector('english', content), plainto_tsquery('english', 'machine learning'))) + (1.0 / (1.0 + (embedding <-> $1))) — i.e. BM25 rank plus a normalised vector similarity
3. Orders by that combined score DESC
4. Returns the top 10 rows (id, title, the combined score aliased as "score")

Respond with ONLY the SQL query. No markdown, no explanation.`,
    hints: [
      'Use a CTE or sub-select to compute both scores',
      'ts_rank returns a float relevance score',
      '1/(1+distance) normalises the vector distance to [0,1]',
      'ORDER BY score DESC LIMIT 10',
    ],
    indexName: 'eq-pg-documents',
    seedData: [],
    mapping: { properties: {} },
    validate: async (): Promise<ValidationResult> =>
      ({ correct: false, score: 0, maxScore: 100, feedback: '' }),
    maxScore: 100,
    timeLimitMs: 45000,
    datastore: 'postgresql',
  } as Challenge & { datastore: string },

  // -----------------------------------------------------------------------
  // pg-3  RAG with Metadata Filters  (intermediate)
  // -----------------------------------------------------------------------
  {
    id: 'pg-3-rag-filtered',
    domain: 'vector-search' as Challenge['domain'],
    difficulty: 'intermediate',
    title: 'Filtered Vector Search for RAG',
    description: `Elasticsearch's knn parameter accepts a "filter" block that is applied BEFORE vector search, allowing efficient pre-filtered ANN in a single integrated operation.

In PostgreSQL with pgvector, you must combine a WHERE clause with ORDER BY ... <-> in the same query. The planner cannot always use the HNSW index when arbitrary filters are present, which may force a sequential scan on large tables.

Schema (same as pg-1):

  CREATE EXTENSION IF NOT EXISTS vector;
  CREATE TABLE documents (
    id       SERIAL PRIMARY KEY,
    title    TEXT,
    content  TEXT,
    embedding vector(384),
    category TEXT,
    created_at TIMESTAMP
  );

Write a SQL query that:
1. Filters to category = 'technical' AND created_at > '2024-01-01'
2. Orders by cosine distance to the query vector $1 (use <->)
3. Returns the top 5 results (id, title, content)

Respond with ONLY the SQL query. No markdown, no explanation.`,
    hints: [
      'WHERE category = \'technical\' AND created_at > \'2024-01-01\'',
      'ORDER BY embedding <-> $1 LIMIT 5',
      'pgvector HNSW index may not be used when combined with WHERE filters',
    ],
    indexName: 'eq-pg-documents',
    seedData: [],
    mapping: { properties: {} },
    validate: async (): Promise<ValidationResult> =>
      ({ correct: false, score: 0, maxScore: 100, feedback: '' }),
    maxScore: 100,
    timeLimitMs: 30000,
    datastore: 'postgresql',
  } as Challenge & { datastore: string },

  // -----------------------------------------------------------------------
  // pg-4  Relevance Tuning / Boosting  (advanced)
  // -----------------------------------------------------------------------
  {
    id: 'pg-4-relevance-tuning',
    domain: 'full-text-search' as Challenge['domain'],
    difficulty: 'advanced',
    title: 'Full-Text Relevance Tuning',
    description: `Elasticsearch offers function_score, boosting queries, and per-field boosts to fine-tune relevance. For example you can boost title matches 3x over body matches and add a recency decay — all in a single declarative JSON query.

PostgreSQL's ts_rank supports weight categories (A/B/C/D) assigned via setweight, but there is no equivalent to function_score, decay functions, or field-level boosting in a single query.

Schema:

  CREATE TABLE articles (
    id         SERIAL PRIMARY KEY,
    title      TEXT,
    body       TEXT,
    published  TIMESTAMP,
    popularity INTEGER
  );

Write a SQL query that:
1. Builds a combined tsvector: setweight(to_tsvector('english', title), 'A') || setweight(to_tsvector('english', body), 'B')
2. Matches against plainto_tsquery('english', 'artificial intelligence')
3. Ranks using ts_rank with weights '{0.1, 0.2, 0.4, 1.0}' (D, C, B, A)
4. Multiplies the rank by a recency factor: EXTRACT(EPOCH FROM published) / EXTRACT(EPOCH FROM NOW()) to boost newer articles
5. Orders by the final boosted score DESC, LIMIT 10
6. Returns id, title, and the boosted score aliased as "score"

Respond with ONLY the SQL query. No markdown, no explanation.`,
    hints: [
      'setweight assigns A/B/C/D weight categories',
      'ts_rank(array, tsvector, tsquery) accepts a weights array',
      'There is no native decay function — you must compute it manually',
    ],
    indexName: 'eq-pg-articles',
    seedData: [],
    mapping: { properties: {} },
    validate: async (): Promise<ValidationResult> =>
      ({ correct: false, score: 0, maxScore: 100, feedback: '' }),
    maxScore: 100,
    timeLimitMs: 45000,
    datastore: 'postgresql',
  } as Challenge & { datastore: string },

  // -----------------------------------------------------------------------
  // pg-5  Log Analysis  (intermediate)
  // -----------------------------------------------------------------------
  {
    id: 'pg-5-log-analysis',
    domain: 'observability' as Challenge['domain'],
    difficulty: 'intermediate',
    title: 'Log Analysis Query',
    description: `Elasticsearch is purpose-built for log analytics: it indexes log lines automatically, supports ILM for retention, and queries billions of log events with inverted indices.

PostgreSQL can store and query logs with standard SQL, though it lacks native ILM, automatic schema detection, or specialized log query DSL.

Schema:

  CREATE TABLE logs (
    id        SERIAL PRIMARY KEY,
    timestamp TIMESTAMP NOT NULL,
    level     TEXT NOT NULL,
    service   TEXT NOT NULL,
    message   TEXT,
    trace_id  TEXT,
    host      TEXT
  );

Write a SQL query that:
1. Filters to level = 'ERROR' AND service = 'api-gateway'
2. Filters to timestamp BETWEEN '2024-06-01' AND '2024-06-30'
3. Orders by timestamp DESC
4. Returns the first 50 rows (id, timestamp, message, trace_id)

Respond with ONLY the SQL query. No markdown, no explanation.`,
    hints: [
      'Standard WHERE clause with AND conditions',
      'Use BETWEEN for the date range',
      'ORDER BY timestamp DESC LIMIT 50',
    ],
    indexName: 'eq-pg-logs',
    seedData: [],
    mapping: { properties: {} },
    validate: async (): Promise<ValidationResult> =>
      ({ correct: false, score: 0, maxScore: 100, feedback: '' }),
    maxScore: 100,
    timeLimitMs: 30000,
    datastore: 'postgresql',
  } as Challenge & { datastore: string },

  // -----------------------------------------------------------------------
  // pg-6  Multi-Dimensional Aggregation  (intermediate)
  // -----------------------------------------------------------------------
  {
    id: 'pg-6-aggregation',
    domain: 'aggregations' as Challenge['domain'],
    difficulty: 'intermediate',
    title: 'Multi-Dimensional Aggregation',
    description: `Elasticsearch supports deeply nested aggregations declaratively: a single JSON body can nest terms -> terms -> stats without any joins or sub-queries. ES also has specialized aggs like date_histogram and significant_terms that have no direct SQL equivalent.

PostgreSQL uses standard SQL GROUP BY for the same task — more verbose when nesting, but straightforward for flat groupings.

Schema:

  CREATE TABLE sales (
    id       SERIAL PRIMARY KEY,
    region   TEXT NOT NULL,
    category TEXT NOT NULL,
    amount   NUMERIC(10,2) NOT NULL,
    quantity INTEGER NOT NULL,
    sold_at  TIMESTAMP NOT NULL
  );

Write a SQL query that:
1. Groups by region AND category
2. Computes SUM(amount) aliased as "total_revenue", AVG(amount) aliased as "avg_order", and SUM(quantity) aliased as "total_units"
3. Orders by total_revenue DESC
4. Returns region, category, total_revenue, avg_order, total_units

Respond with ONLY the SQL query. No markdown, no explanation.`,
    hints: [
      'GROUP BY region, category',
      'Use SUM() and AVG() aggregate functions',
      'ORDER BY total_revenue DESC',
    ],
    indexName: 'eq-pg-sales',
    seedData: [],
    mapping: { properties: {} },
    validate: async (): Promise<ValidationResult> =>
      ({ correct: false, score: 0, maxScore: 100, feedback: '' }),
    maxScore: 100,
    timeLimitMs: 30000,
    datastore: 'postgresql',
  } as Challenge & { datastore: string },

  // -----------------------------------------------------------------------
  // pg-7  Security Analytics  (advanced)
  // -----------------------------------------------------------------------
  {
    id: 'pg-7-security',
    domain: 'security' as Challenge['domain'],
    difficulty: 'advanced',
    title: 'Failed Login Detection',
    description: `Elasticsearch Security (with SIEM rules) can detect brute-force patterns using threshold rules, anomaly detection ML jobs, and pre-built security analytics. A single detection rule can alert on "more than N failed logins from the same IP within M minutes."

PostgreSQL has no built-in security analytics. You must write manual SQL with GROUP BY, HAVING, and window functions.

Schema:

  CREATE TABLE auth_events (
    id         SERIAL PRIMARY KEY,
    event_time TIMESTAMP NOT NULL,
    ip_address INET NOT NULL,
    username   TEXT NOT NULL,
    success    BOOLEAN NOT NULL,
    user_agent TEXT,
    country    TEXT
  );

Write a SQL query that:
1. Looks at the last 24 hours: event_time > NOW() - INTERVAL '24 hours'
2. Filters to failed attempts: success = false
3. Groups by ip_address
4. Finds IPs with more than 3 failed attempts: HAVING COUNT(*) > 3
5. Returns ip_address, COUNT(*) as "attempt_count", array_agg(DISTINCT username) as "targeted_users", MIN(event_time) as "first_attempt", MAX(event_time) as "last_attempt"
6. Orders by attempt_count DESC

Respond with ONLY the SQL query. No markdown, no explanation.`,
    hints: [
      'Use WHERE success = false AND event_time > NOW() - INTERVAL \'24 hours\'',
      'GROUP BY ip_address HAVING COUNT(*) > 3',
      'array_agg(DISTINCT username) collects targeted usernames',
    ],
    indexName: 'eq-pg-auth-events',
    seedData: [],
    mapping: { properties: {} },
    validate: async (): Promise<ValidationResult> =>
      ({ correct: false, score: 0, maxScore: 100, feedback: '' }),
    maxScore: 100,
    timeLimitMs: 45000,
    datastore: 'postgresql',
  } as Challenge & { datastore: string },

  // -----------------------------------------------------------------------
  // pg-8  SLO Percentile Computation  (advanced)
  // -----------------------------------------------------------------------
  {
    id: 'pg-8-slo-percentile',
    domain: 'observability' as Challenge['domain'],
    difficulty: 'advanced',
    title: 'SLO Percentile Computation',
    description: `Elasticsearch has a dedicated "percentiles" aggregation that computes multiple percentiles (p50, p90, p95, p99) in a single aggregation call and returns them all at once. It also has "percentile_ranks" for the inverse question.

PostgreSQL has percentile_cont and percentile_disc, but each call to WITHIN GROUP computes one percentile at a time. To get multiple percentiles you must either repeat the expression or use an array form.

Schema:

  CREATE TABLE requests (
    id               SERIAL PRIMARY KEY,
    endpoint         TEXT NOT NULL,
    response_time_ms INTEGER NOT NULL,
    status_code      INTEGER NOT NULL,
    recorded_at      TIMESTAMP NOT NULL
  );

Write a SQL query that:
1. Computes the p50, p90, p95, and p99 of response_time_ms in a SINGLE query
2. Use percentile_cont(array[0.5, 0.9, 0.95, 0.99]) WITHIN GROUP (ORDER BY response_time_ms) to get all percentiles at once
3. Alias the result column as "percentiles"
4. Also compute AVG(response_time_ms) as "avg_latency" and COUNT(*) as "total_requests"

Respond with ONLY the SQL query. No markdown, no explanation.`,
    hints: [
      'percentile_cont(array[...]) returns an array of percentile values',
      'WITHIN GROUP (ORDER BY response_time_ms) defines the sort',
      'You can combine percentile_cont with AVG and COUNT in one SELECT',
    ],
    indexName: 'eq-pg-requests',
    seedData: [],
    mapping: { properties: {} },
    validate: async (): Promise<ValidationResult> =>
      ({ correct: false, score: 0, maxScore: 100, feedback: '' }),
    maxScore: 100,
    timeLimitMs: 45000,
    datastore: 'postgresql',
  } as Challenge & { datastore: string },

  // -----------------------------------------------------------------------
  // pg-9  Nested / JSONB Document Query  (advanced)
  // -----------------------------------------------------------------------
  {
    id: 'pg-9-nested-docs',
    domain: 'aggregations' as Challenge['domain'],
    difficulty: 'advanced',
    title: 'Querying Nested JSONB Documents',
    description: `Elasticsearch has a native "nested" field type and a "nested" query that correctly handles arrays of objects — each inner object is indexed as a separate hidden document so cross-object matching is avoided.

PostgreSQL stores JSON arrays in JSONB columns, but to query individual array elements you must use jsonb_array_elements to unnest them — a lateral join that is verbose and can be slow on large datasets.

Schema:

  CREATE TABLE orders (
    id         SERIAL PRIMARY KEY,
    customer   TEXT NOT NULL,
    order_date TIMESTAMP NOT NULL,
    items      JSONB NOT NULL  -- array of {product: text, quantity: int, price: numeric}
  );

Example items value: '[{"product": "Laptop", "quantity": 1, "price": 1299.99}, {"product": "Mouse", "quantity": 2, "price": 49.99}]'

Write a SQL query that:
1. Uses jsonb_array_elements(items) to unnest the items array (alias the element as "item")
2. Filters to items where (item->>'price')::numeric > 100
3. Groups by customer
4. Returns customer, COUNT(*) as "expensive_item_count", SUM((item->>'price')::numeric * (item->>'quantity')::int) as "total_spend"
5. Orders by total_spend DESC
6. LIMIT 20

Respond with ONLY the SQL query. No markdown, no explanation.`,
    hints: [
      'Use FROM orders, jsonb_array_elements(items) AS item (lateral join)',
      'Cast JSONB text extraction with ::numeric and ::int',
      'item->>\'price\' extracts the value as text',
    ],
    indexName: 'eq-pg-orders',
    seedData: [],
    mapping: { properties: {} },
    validate: async (): Promise<ValidationResult> =>
      ({ correct: false, score: 0, maxScore: 100, feedback: '' }),
    maxScore: 100,
    timeLimitMs: 45000,
    datastore: 'postgresql',
  } as Challenge & { datastore: string },

  // -----------------------------------------------------------------------
  // pg-10  Ingest Pipeline via Trigger  (expert)
  // -----------------------------------------------------------------------
  {
    id: 'pg-10-ingest-pipeline',
    domain: 'ingest-indexing' as Challenge['domain'],
    difficulty: 'expert',
    title: 'Data Transformation via Trigger (Ingest Pipeline Equivalent)',
    description: `Elasticsearch ingest pipelines let you declaratively transform documents on index-time with a simple JSON array of processors: set, rename, grok, date, lowercase, script, etc. A single PUT _ingest/pipeline call sets it up.

PostgreSQL has no declarative ingest pipeline. To achieve the same, you must write a PL/pgSQL trigger function and attach it to the table — significantly more code and complexity.

Schema:

  CREATE TABLE raw_events (
    id         SERIAL PRIMARY KEY,
    raw_log    TEXT NOT NULL,
    source_ip  TEXT,
    event_type TEXT,
    severity   TEXT,
    parsed_at  TIMESTAMP,
    geo_region TEXT
  );

Write the complete SQL to:
1. CREATE OR REPLACE a function named "process_raw_event()" that returns TRIGGER
2. Inside the function body (BEGIN...END):
   a. Set NEW.event_type = split_part(NEW.raw_log, ' ', 1)  (first word of raw_log)
   b. Set NEW.severity = UPPER(split_part(NEW.raw_log, ' ', 2))  (second word, uppercased)
   c. Set NEW.parsed_at = NOW()
   d. Set NEW.source_ip = COALESCE(NEW.source_ip, '0.0.0.0')
   e. RETURN NEW
3. CREATE the trigger named "trg_process_raw_event" BEFORE INSERT on raw_events FOR EACH ROW EXECUTE FUNCTION process_raw_event()

Respond with ONLY the SQL statements. No markdown, no explanation.`,
    hints: [
      'Use CREATE OR REPLACE FUNCTION ... RETURNS TRIGGER',
      'The function body is in a $$ ... $$ block with LANGUAGE plpgsql',
      'BEFORE INSERT trigger fires before the row is actually inserted',
      'split_part(string, delimiter, field_number) extracts parts of a string',
    ],
    indexName: 'eq-pg-raw-events',
    seedData: [],
    mapping: { properties: {} },
    validate: async (): Promise<ValidationResult> =>
      ({ correct: false, score: 0, maxScore: 100, feedback: '' }),
    maxScore: 100,
    timeLimitMs: 60000,
    datastore: 'postgresql',
  } as Challenge & { datastore: string },
];
