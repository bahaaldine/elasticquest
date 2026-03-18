import type { Challenge, ValidationResult } from '../../types';

// ---------------------------------------------------------------------------
// Helper: validate a MongoDB command string via pattern-matching checks
// ---------------------------------------------------------------------------

interface ValidateMongoOptions {
  /** Strings that MUST appear (case-insensitive) */
  mustContain?: string[];
  /** Groups where at least ONE string in each group must appear */
  mustContainAny?: string[][];
  /** Strings that must NOT appear (case-insensitive) */
  mustNotContain?: string[];
  /** RegExps that must match */
  mustMatch?: RegExp[];
  /** The expected collection name (must appear in the command) */
  collectionName?: string;
}

function validateMongo(
  cmd: string,
  opts: ValidateMongoOptions,
): ValidationResult {
  const checks: { label: string; pass: boolean }[] = [];
  const lower = cmd.toLowerCase();

  if (opts.collectionName) {
    checks.push({
      label: `References collection "${opts.collectionName}"`,
      pass: lower.includes(opts.collectionName.toLowerCase()),
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
        pass: re.test(cmd),
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
// validateQuery — entry point used by the benchmark runner for Mongo challenges
// ---------------------------------------------------------------------------

function validateQuery(
  cmd: string,
  opts: ValidateMongoOptions,
): ValidationResult {
  if (!cmd || typeof cmd !== 'string' || cmd.trim().length === 0) {
    return {
      correct: false,
      score: 0,
      maxScore: 100,
      feedback: 'No MongoDB command provided.',
    };
  }
  return validateMongo(cmd, opts);
}

// ---------------------------------------------------------------------------
// 10 MongoDB challenges — the same AI/LLM use-cases Elasticsearch handles
// natively. Each challenge asks the model to achieve the equivalent result in
// MongoDB, highlighting where Mongo falls short.
// ---------------------------------------------------------------------------

export const mongodbChallenges: Challenge[] = [
  // -----------------------------------------------------------------------
  // mg-1  Semantic / Vector Search  (intermediate)
  // -----------------------------------------------------------------------
  {
    id: 'mg-1-semantic-search',
    domain: 'vector-search' as Challenge['domain'],
    difficulty: 'intermediate',
    title: 'Atlas Vector Search with $vectorSearch',
    description: `In Elasticsearch, semantic (vector) search is built-in via the dense_vector field type and the top-level knn parameter — no cloud lock-in, works on any deployment.

MongoDB requires Atlas Vector Search, which ONLY works on MongoDB Atlas (cloud-hosted). Self-hosted MongoDB has no vector search capability. You must also pre-create a vector search index definition in the Atlas UI or API before querying.

Given the following collection schema:

  db.documents — each document has:
    _id:        ObjectId
    title:      String
    content:    String
    embedding:  Array of 384 Numbers (vector)
    category:   String
    created_at: ISODate

Write a MongoDB aggregation pipeline that:
1. Uses a $vectorSearch stage as the FIRST stage
2. Searches the "embedding" field using index "vector_index"
3. Uses path "embedding", queryVector [0.1, 0.2, ...] (use a placeholder array), numCandidates 100, limit 5
4. Projects title, content, and a "score" field via { $meta: "vectorSearchScore" }

Respond with ONLY the MongoDB aggregation pipeline command. No markdown, no explanation.`,
    hints: [
      '$vectorSearch must be the first stage in the pipeline',
      'numCandidates controls the breadth of the ANN search',
      'This only works on Atlas — not self-hosted MongoDB',
      'Use $project with { $meta: "vectorSearchScore" } for the score',
    ],
    indexName: 'eq-mg-documents',
    seedData: [],
    mapping: { properties: {} },
    validate: async (): Promise<ValidationResult> =>
      ({ correct: false, score: 0, maxScore: 100, feedback: '' }),
    maxScore: 100,
    timeLimitMs: 30000,
    datastore: 'mongodb',
  } as Challenge & { datastore: string },

  // -----------------------------------------------------------------------
  // mg-2  Hybrid Search  (advanced)
  // -----------------------------------------------------------------------
  {
    id: 'mg-2-hybrid-search',
    domain: 'full-text-search' as Challenge['domain'],
    difficulty: 'advanced',
    title: 'Hybrid Full-Text + Vector Search',
    description: `Elasticsearch performs hybrid search natively: supply both a "query" (BM25) and "knn" (vector) block at the top level and ES automatically combines the scores with reciprocal rank fusion — a single query, a single result set.

MongoDB has NO native hybrid search in a single query. You cannot combine $text search and $vectorSearch in the same aggregation pipeline ($vectorSearch must be the first stage and is incompatible with $match on $text). The only workaround is to run TWO separate queries — one text, one vector — and merge the results manually in application code or with $unionWith. This is a major Elasticsearch advantage.

Given the same collection schema:

  db.documents — each document has:
    _id, title, content, embedding (384d vector), category, created_at

Write two MongoDB commands (separated by a comment "// merge results in application code"):

Command 1 — Text search:
  db.documents.find(
    { $text: { $search: "machine learning" } },
    { score: { $meta: "textScore" }, title: 1, content: 1 }
  ).sort({ score: { $meta: "textScore" } }).limit(10)

Command 2 — Vector search:
  db.documents.aggregate([
    { $vectorSearch: { index: "vector_index", path: "embedding", queryVector: [/* placeholder */], numCandidates: 100, limit: 10 } },
    { $project: { title: 1, content: 1, score: { $meta: "vectorSearchScore" } } }
  ])

Then add a comment explaining that results must be merged and re-ranked client-side using reciprocal rank fusion or a weighted sum.

Respond with ONLY the MongoDB commands. No markdown, no explanation.`,
    hints: [
      '$text and $vectorSearch cannot coexist in one pipeline',
      'You must run two separate queries and merge in application code',
      'Reciprocal rank fusion: score = sum(1 / (k + rank)) across queries',
      'ES does this automatically with a single request',
    ],
    indexName: 'eq-mg-documents',
    seedData: [],
    mapping: { properties: {} },
    validate: async (): Promise<ValidationResult> =>
      ({ correct: false, score: 0, maxScore: 100, feedback: '' }),
    maxScore: 100,
    timeLimitMs: 45000,
    datastore: 'mongodb',
  } as Challenge & { datastore: string },

  // -----------------------------------------------------------------------
  // mg-3  RAG with Metadata Filters  (intermediate)
  // -----------------------------------------------------------------------
  {
    id: 'mg-3-rag-filtered',
    domain: 'vector-search' as Challenge['domain'],
    difficulty: 'intermediate',
    title: 'Filtered Vector Search for RAG',
    description: `Elasticsearch's knn parameter accepts a "filter" block that is applied BEFORE vector search, allowing efficient pre-filtered ANN in a single integrated operation on any deployment.

MongoDB's $vectorSearch supports a "filter" field for pre-filtering, but this ONLY works on MongoDB Atlas. The filter field syntax is limited to Atlas Search filter expressions (not the full MongoDB query language). Self-hosted MongoDB cannot do filtered vector search at all.

Given the following collection schema:

  db.documents — each document has:
    _id:        ObjectId
    title:      String
    content:    String
    embedding:  Array of 384 Numbers (vector)
    category:   String
    created_at: ISODate

Write a MongoDB aggregation pipeline that:
1. Uses $vectorSearch as the first stage with:
   - index: "vector_index"
   - path: "embedding"
   - queryVector: [/* placeholder */]
   - numCandidates: 100
   - limit: 5
   - filter: { "category": { "$eq": "technical" } }
2. Adds a $project stage returning title, content, and score via { $meta: "vectorSearchScore" }

Respond with ONLY the MongoDB aggregation pipeline command. No markdown, no explanation.`,
    hints: [
      'The filter field goes inside the $vectorSearch stage',
      'Filter syntax uses Atlas Search operators, not standard MQL',
      'This is Atlas-only — self-hosted MongoDB has no vector search',
      '$meta: "vectorSearchScore" retrieves the similarity score',
    ],
    indexName: 'eq-mg-documents',
    seedData: [],
    mapping: { properties: {} },
    validate: async (): Promise<ValidationResult> =>
      ({ correct: false, score: 0, maxScore: 100, feedback: '' }),
    maxScore: 100,
    timeLimitMs: 30000,
    datastore: 'mongodb',
  } as Challenge & { datastore: string },

  // -----------------------------------------------------------------------
  // mg-4  Relevance Tuning / Boosting  (advanced)
  // -----------------------------------------------------------------------
  {
    id: 'mg-4-relevance-tuning',
    domain: 'full-text-search' as Challenge['domain'],
    difficulty: 'advanced',
    title: 'Full-Text Relevance Tuning',
    description: `Elasticsearch offers function_score, boosting queries, per-field boosts, and decay functions to fine-tune relevance — all in a single declarative JSON query. For example you can boost title matches 3x over body, add a recency decay, and factor in popularity.

MongoDB's $text search is much more basic: it uses a single textScore based on term frequency, and there is no built-in function_score, no per-field boosting, no decay functions. To boost title over body you would need separate fields and manual score computation.

Given the following collection schema:

  db.articles — each document has:
    _id:        ObjectId
    title:      String
    body:       String
    published:  ISODate
    popularity: Number

There is a text index: db.articles.createIndex({ title: "text", body: "text" }, { weights: { title: 3, body: 1 } })

Write a MongoDB aggregation pipeline that:
1. Uses $match with $text: { $search: "artificial intelligence" }
2. Adds a $project stage computing:
   - title: 1
   - textScore: { $meta: "textScore" }
   - recencyBoost: a formula dividing the published timestamp by the current time to boost newer articles (use $divide with $toLong on "$published" and { $toLong: "$$NOW" })
3. Adds an $addFields stage computing "finalScore" as { $multiply: ["$textScore", "$recencyBoost"] }
4. Sorts by finalScore descending
5. Limits to 10

Respond with ONLY the MongoDB aggregation pipeline command. No markdown, no explanation.`,
    hints: [
      'MongoDB text index weights { title: 3, body: 1 } is the only field boosting available',
      '$meta: "textScore" gives the raw BM25-like score',
      'There is no native decay function — you must compute it manually',
      'ES does all of this in a single function_score query',
    ],
    indexName: 'eq-mg-articles',
    seedData: [],
    mapping: { properties: {} },
    validate: async (): Promise<ValidationResult> =>
      ({ correct: false, score: 0, maxScore: 100, feedback: '' }),
    maxScore: 100,
    timeLimitMs: 45000,
    datastore: 'mongodb',
  } as Challenge & { datastore: string },

  // -----------------------------------------------------------------------
  // mg-5  Log Analysis  (intermediate)
  // -----------------------------------------------------------------------
  {
    id: 'mg-5-log-analysis',
    domain: 'observability' as Challenge['domain'],
    difficulty: 'intermediate',
    title: 'Log Analysis Query',
    description: `Elasticsearch is purpose-built for log analytics: it indexes log lines automatically, supports Index Lifecycle Management (ILM) for retention, follows the Elastic Common Schema (ECS) for standardised fields, and queries billions of log events with inverted indices.

MongoDB can store and query logs, but it lacks native ILM (you must set up TTL indexes manually), has no standardised log schema like ECS, and does not have specialised log query operators.

Given the following collection schema:

  db.logs — each document has:
    _id:       ObjectId
    timestamp: ISODate
    level:     String ("ERROR", "WARN", "INFO", "DEBUG")
    service:   String
    message:   String
    trace_id:  String
    host:      String

Write a MongoDB command that:
1. Filters to level "ERROR" AND service "api"
2. Filters to timestamp >= ISODate("2024-06-01") and timestamp <= ISODate("2024-06-30")
3. Sorts by timestamp descending
4. Returns the first 50 documents
5. Projects only _id, timestamp, message, trace_id

Use db.logs.find(...).sort(...).limit(...) syntax.

Respond with ONLY the MongoDB command. No markdown, no explanation.`,
    hints: [
      'Use find() with a query filter object containing level, service, and timestamp range',
      'Timestamp range: { $gte: ISODate("..."), $lte: ISODate("...") }',
      '.sort({ timestamp: -1 }) for descending order',
      '.limit(50) for top 50 results',
    ],
    indexName: 'eq-mg-logs',
    seedData: [],
    mapping: { properties: {} },
    validate: async (): Promise<ValidationResult> =>
      ({ correct: false, score: 0, maxScore: 100, feedback: '' }),
    maxScore: 100,
    timeLimitMs: 30000,
    datastore: 'mongodb',
  } as Challenge & { datastore: string },

  // -----------------------------------------------------------------------
  // mg-6  Multi-Dimensional Aggregation  (intermediate)
  // -----------------------------------------------------------------------
  {
    id: 'mg-6-aggregation',
    domain: 'aggregations' as Challenge['domain'],
    difficulty: 'intermediate',
    title: 'Multi-Dimensional Aggregation Pipeline',
    description: `Elasticsearch supports deeply nested aggregations declaratively: a single JSON body can nest terms -> terms -> stats without any joins. ES also has specialised aggs like date_histogram, significant_terms, and composite that have no direct MongoDB equivalent.

MongoDB's aggregation pipeline is powerful but more verbose — achieving nested groupings requires multiple sequential $group stages, and there is no equivalent to composite or significant_terms aggregations.

Given the following collection schema:

  db.sales — each document has:
    _id:      ObjectId
    region:   String
    category: String
    amount:   Number
    quantity: Number
    sold_at:  ISODate

Write a MongoDB aggregation pipeline that:
1. Uses $group to group by { region: "$region", category: "$category" } and compute:
   - total_revenue: { $sum: "$amount" }
   - avg_order: { $avg: "$amount" }
   - total_units: { $sum: "$quantity" }
2. Uses a second $group to group by "$_id.region" and push each category's stats into an array called "categories" using $push
3. Uses $sort to order by "_id" ascending (region name)

Respond with ONLY the MongoDB aggregation pipeline command. No markdown, no explanation.`,
    hints: [
      'First $group uses a compound _id: { region, category }',
      'Second $group re-groups by region and uses $push to nest category results',
      'MongoDB requires two $group stages for what ES does with nested terms aggs',
      'ES achieves this with a single declarative terms > terms > stats nesting',
    ],
    indexName: 'eq-mg-sales',
    seedData: [],
    mapping: { properties: {} },
    validate: async (): Promise<ValidationResult> =>
      ({ correct: false, score: 0, maxScore: 100, feedback: '' }),
    maxScore: 100,
    timeLimitMs: 30000,
    datastore: 'mongodb',
  } as Challenge & { datastore: string },

  // -----------------------------------------------------------------------
  // mg-7  Security Analytics  (advanced)
  // -----------------------------------------------------------------------
  {
    id: 'mg-7-security',
    domain: 'security' as Challenge['domain'],
    difficulty: 'advanced',
    title: 'Brute-Force Login Detection',
    description: `Elasticsearch Security (with SIEM rules) can detect brute-force patterns using threshold rules, anomaly detection ML jobs, and pre-built security analytics. A single detection rule can alert on "more than N failed logins from the same IP within M minutes" — no custom code required.

MongoDB has no built-in SIEM, no anomaly detection, and no pre-built security rules. You must write a manual aggregation pipeline with $match, $group, and $match to detect brute-force patterns.

Given the following collection schema:

  db.auth_events — each document has:
    _id:        ObjectId
    event_time: ISODate
    ip_address: String
    username:   String
    success:    Boolean
    user_agent: String
    country:    String

Write a MongoDB aggregation pipeline that:
1. $match: success is false AND event_time >= 24 hours ago (use { $gte: new Date(Date.now() - 24*60*60*1000) })
2. $group by ip_address, computing:
   - attempt_count: { $sum: 1 }
   - targeted_users: { $addToSet: "$username" }
   - first_attempt: { $min: "$event_time" }
   - last_attempt: { $max: "$event_time" }
3. $match: attempt_count >= 3 (only keep IPs with 3+ failures)
4. $sort by attempt_count descending

Respond with ONLY the MongoDB aggregation pipeline command. No markdown, no explanation.`,
    hints: [
      '$addToSet collects unique usernames (like array_agg DISTINCT)',
      'Two $match stages: first to filter, second to apply the threshold',
      'MongoDB has no built-in SIEM or detection rules',
      'ES detects this with a single threshold rule — zero custom code',
    ],
    indexName: 'eq-mg-auth-events',
    seedData: [],
    mapping: { properties: {} },
    validate: async (): Promise<ValidationResult> =>
      ({ correct: false, score: 0, maxScore: 100, feedback: '' }),
    maxScore: 100,
    timeLimitMs: 45000,
    datastore: 'mongodb',
  } as Challenge & { datastore: string },

  // -----------------------------------------------------------------------
  // mg-8  SLO Percentile Computation  (advanced)
  // -----------------------------------------------------------------------
  {
    id: 'mg-8-slo-percentile',
    domain: 'observability' as Challenge['domain'],
    difficulty: 'advanced',
    title: 'SLO Percentile Computation',
    description: `Elasticsearch has a dedicated "percentiles" aggregation that computes multiple percentiles (p50, p90, p95, p99) in a single aggregation call using T-Digest or HDR histograms — highly accurate and efficient even on billions of data points.

MongoDB added the $percentile operator in version 7.0, but it is less mature: it only supports the "approximate" method, does not support multiple methods (no HDR histogram), and was not available at all before 7.0. For older versions you must sort the entire collection and compute percentiles manually.

Given the following collection schema:

  db.requests — each document has:
    _id:              ObjectId
    endpoint:         String
    response_time_ms: Number
    status_code:      Number
    recorded_at:      ISODate

Write a MongoDB aggregation pipeline that:
1. Uses $group with _id: null to aggregate all documents:
   - p50: { $percentile: { input: "$response_time_ms", p: [0.5], method: "approximate" } }
   - p90: { $percentile: { input: "$response_time_ms", p: [0.9], method: "approximate" } }
   - p95: { $percentile: { input: "$response_time_ms", p: [0.95], method: "approximate" } }
   - p99: { $percentile: { input: "$response_time_ms", p: [0.99], method: "approximate" } }
   - avg_latency: { $avg: "$response_time_ms" }
   - total_requests: { $sum: 1 }
2. Uses $project to reshape: flatten each percentile array to its first element using { $arrayElemAt: ["$p50", 0] } etc.

Respond with ONLY the MongoDB aggregation pipeline command. No markdown, no explanation.`,
    hints: [
      '$percentile returns an array — use $arrayElemAt to extract the scalar',
      '$percentile requires MongoDB 7.0+ (not available in older versions)',
      'Only the "approximate" method is supported (no HDR histogram)',
      'ES computes all percentiles in one call with configurable accuracy',
    ],
    indexName: 'eq-mg-requests',
    seedData: [],
    mapping: { properties: {} },
    validate: async (): Promise<ValidationResult> =>
      ({ correct: false, score: 0, maxScore: 100, feedback: '' }),
    maxScore: 100,
    timeLimitMs: 45000,
    datastore: 'mongodb',
  } as Challenge & { datastore: string },

  // -----------------------------------------------------------------------
  // mg-9  Nested / Array Document Query  (intermediate)
  // -----------------------------------------------------------------------
  {
    id: 'mg-9-nested-docs',
    domain: 'aggregations' as Challenge['domain'],
    difficulty: 'intermediate',
    title: 'Querying Nested Array Documents with $elemMatch',
    description: `Elasticsearch has a native "nested" field type and a "nested" query that correctly handles arrays of objects — each inner object is indexed as a separate hidden document so cross-object matching is avoided. However, you must explicitly declare the nested mapping.

MongoDB handles arrays of embedded documents natively — this is one area where MongoDB actually excels. The $elemMatch operator queries within array elements, ensuring all conditions apply to the SAME array element (avoiding cross-element matching). No special schema declaration is needed.

Given the following collection schema:

  db.orders — each document has:
    _id:        ObjectId
    customer:   String
    order_date: ISODate
    items:      Array of { product: String, quantity: Number, price: Number }

Example items: [{ product: "Laptop", quantity: 1, price: 1299.99 }, { product: "Mouse", quantity: 2, price: 49.99 }]

Write a MongoDB command that:
1. Uses db.orders.find() with $elemMatch on the items array to find orders containing at least one item where price > 100 AND quantity >= 1
2. Projects customer, order_date, and items
3. Sorts by order_date descending
4. Limits to 20

Respond with ONLY the MongoDB command. No markdown, no explanation.`,
    hints: [
      '$elemMatch ensures conditions apply to the same array element',
      'Without $elemMatch, MongoDB might match across different elements',
      'This is one area where MongoDB is arguably simpler than ES',
      'ES requires explicit nested mapping + nested query for the same result',
    ],
    indexName: 'eq-mg-orders',
    seedData: [],
    mapping: { properties: {} },
    validate: async (): Promise<ValidationResult> =>
      ({ correct: false, score: 0, maxScore: 100, feedback: '' }),
    maxScore: 100,
    timeLimitMs: 30000,
    datastore: 'mongodb',
  } as Challenge & { datastore: string },

  // -----------------------------------------------------------------------
  // mg-10  Ingest Pipeline via Change Streams  (expert)
  // -----------------------------------------------------------------------
  {
    id: 'mg-10-ingest-pipeline',
    domain: 'ingest-indexing' as Challenge['domain'],
    difficulty: 'expert',
    title: 'Real-Time Data Transformation via Change Streams',
    description: `Elasticsearch ingest pipelines let you declaratively transform documents at index-time with a simple JSON array of processors: set, rename, grok, date, lowercase, script, etc. A single PUT _ingest/pipeline call sets it up — no custom code, no external services.

MongoDB has no declarative ingest pipeline. To achieve real-time document transformation on insert, you must use Change Streams (which require a replica set) combined with an Atlas Trigger function or a separate application process that watches the stream. This is significantly more complex: you need to write JavaScript functions, deploy them as Atlas Triggers or run a persistent watcher process, and handle error/retry logic yourself.

Given the following collection schema:

  db.raw_events — each document has:
    _id:        ObjectId
    raw_log:    String (e.g. "LOGIN ERROR 192.168.1.1 user=admin")
    source_ip:  String (may be null)
    event_type: String (initially empty)
    severity:   String (initially empty)
    parsed_at:  ISODate (initially null)
    geo_region: String (initially empty)

Write the JavaScript code for a MongoDB Atlas Trigger function that:
1. Watches the "raw_events" collection for insert operations
2. On each insert, parses the raw_log field:
   a. Splits raw_log by spaces
   b. Sets event_type to the first word (e.g. "LOGIN")
   c. Sets severity to the second word uppercased (e.g. "ERROR")
   d. Sets source_ip to the third word if source_ip is null or empty
   e. Sets parsed_at to new Date()
3. Updates the inserted document with the parsed fields using updateOne with $set

The function signature should be:
  exports = async function(changeEvent) { ... }

Also include the change stream watcher alternative using db.raw_events.watch() for self-hosted deployments.

Respond with ONLY the JavaScript code. No markdown, no explanation.`,
    hints: [
      'Change streams require a replica set (not available on standalone mongod)',
      'Atlas Triggers run as serverless functions — must be deployed via Atlas UI/API',
      'You must handle errors and retries manually',
      'ES ingest pipelines are a single declarative JSON — no code, no deployment',
    ],
    indexName: 'eq-mg-raw-events',
    seedData: [],
    mapping: { properties: {} },
    validate: async (): Promise<ValidationResult> =>
      ({ correct: false, score: 0, maxScore: 100, feedback: '' }),
    maxScore: 100,
    timeLimitMs: 60000,
    datastore: 'mongodb',
  } as Challenge & { datastore: string },
];
