import type { Challenge, SearchResponse, ElasticBackend } from '../types';

export const aggregationsChallenges: Challenge[] = [
  // --- BEGINNER ---
  {
    id: 'aggs-1-basic-terms',
    domain: 'aggregations',
    difficulty: 'beginner',
    title: 'Category Breakdown',
    description: `Get the count of sales per product category using a terms aggregation named "categories". Set size to 0 (no hits needed).

Fields: product_name (text), category (keyword), amount (float), region (keyword), sale_date (date).`,
    hints: ['Use size: 0', 'Name your aggregation "categories"', 'terms agg on "category" field'],
    indexName: 'eq-sales',
    mapping: { properties: { product_name: { type: 'text' }, category: { type: 'keyword' }, amount: { type: 'float' }, region: { type: 'keyword' }, sale_date: { type: 'date' } } },
    seedData: [
      { _id: '1', _index: 'eq-sales', _source: { product_name: 'Laptop Pro', category: 'electronics', amount: 1299.99, region: 'north', sale_date: '2024-01-15' } },
      { _id: '2', _index: 'eq-sales', _source: { product_name: 'Wireless Mouse', category: 'electronics', amount: 49.99, region: 'south', sale_date: '2024-01-16' } },
      { _id: '3', _index: 'eq-sales', _source: { product_name: 'Office Chair', category: 'furniture', amount: 399.99, region: 'north', sale_date: '2024-01-17' } },
      { _id: '4', _index: 'eq-sales', _source: { product_name: 'Standing Desk', category: 'furniture', amount: 599.99, region: 'east', sale_date: '2024-01-18' } },
      { _id: '5', _index: 'eq-sales', _source: { product_name: 'Headphones', category: 'electronics', amount: 199.99, region: 'west', sale_date: '2024-01-19' } },
      { _id: '6', _index: 'eq-sales', _source: { product_name: 'Notebook Set', category: 'office_supplies', amount: 24.99, region: 'south', sale_date: '2024-01-20' } },
      { _id: '7', _index: 'eq-sales', _source: { product_name: 'Desk Lamp', category: 'furniture', amount: 79.99, region: 'north', sale_date: '2024-02-01' } },
      { _id: '8', _index: 'eq-sales', _source: { product_name: 'Pen Pack', category: 'office_supplies', amount: 12.99, region: 'east', sale_date: '2024-02-02' } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      let score = 0;
      if (response.hits.hits.length === 0) score += 20;
      const catAgg = response.aggregations?.categories;
      if (!catAgg) return { correct: false, score, maxScore: 100, feedback: 'Missing "categories" aggregation.' };
      if (!catAgg.buckets) return { correct: false, score, maxScore: 100, feedback: 'No buckets in aggregation.' };
      score += 20;
      const buckets = new Map(catAgg.buckets.map((b) => [String(b.key), b.doc_count]));
      const expected = new Map([['electronics', 3], ['furniture', 3], ['office_supplies', 2]]);
      let correctBuckets = 0;
      for (const [key, count] of expected) { if (buckets.get(key) === count) correctBuckets++; }
      score += Math.floor((correctBuckets / expected.size) * 60);
      const correct = correctBuckets === expected.size && response.hits.hits.length === 0;
      return { correct, score: Math.min(100, score), maxScore: 100, feedback: correct ? 'Correct! electronics(3), furniture(3), office_supplies(2).' : `${correctBuckets}/${expected.size} counts correct.` };
    },
    maxScore: 100,
    timeLimitMs: 30000,
  },
  {
    id: 'aggs-2-simple-avg',
    domain: 'aggregations',
    difficulty: 'beginner',
    title: 'Average Order Value',
    description: `Calculate the average sale amount across all records. Use a metric aggregation named "avg_amount" on the "amount" field. Set size to 0.`,
    hints: ['Use avg aggregation on "amount" field', 'Name it "avg_amount"'],
    indexName: 'eq-sales',
    mapping: { properties: { product_name: { type: 'text' }, category: { type: 'keyword' }, amount: { type: 'float' }, region: { type: 'keyword' } } },
    seedData: [
      { _id: '1', _index: 'eq-sales', _source: { product_name: 'Item A', category: 'electronics', amount: 100, region: 'north' } },
      { _id: '2', _index: 'eq-sales', _source: { product_name: 'Item B', category: 'electronics', amount: 200, region: 'south' } },
      { _id: '3', _index: 'eq-sales', _source: { product_name: 'Item C', category: 'furniture', amount: 300, region: 'north' } },
      { _id: '4', _index: 'eq-sales', _source: { product_name: 'Item D', category: 'furniture', amount: 400, region: 'east' } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      let score = 0;
      if (response.hits.hits.length === 0) score += 20;
      const agg = response.aggregations?.avg_amount;
      if (!agg) return { correct: false, score, maxScore: 100, feedback: 'Missing "avg_amount" aggregation.' };
      const expectedAvg = 250;
      if (agg.value !== undefined && Math.abs(Number(agg.value) - expectedAvg) < 1) score += 80;
      const correct = score >= 90;
      return { correct, score: Math.min(100, score), maxScore: 100, feedback: correct ? `Correct! Average amount is $${expectedAvg}.` : `Expected avg ~${expectedAvg}, got ${agg.value}.` };
    },
    maxScore: 100,
    timeLimitMs: 30000,
  },

  // --- INTERMEDIATE ---
  {
    id: 'aggs-3-filtered-agg',
    domain: 'aggregations',
    difficulty: 'intermediate',
    title: 'Aggregation with Query Filter',
    description: `Calculate the total (sum) revenue for the "electronics" category only. Use a query to filter to electronics, then a sum aggregation named "total_revenue" on the "amount" field. Set size to 0.`,
    hints: ['Filter with query.term on category first', 'Then use sum agg on amount'],
    indexName: 'eq-sales',
    mapping: { properties: { product_name: { type: 'text' }, category: { type: 'keyword' }, amount: { type: 'float' } } },
    seedData: [
      { _id: '1', _index: 'eq-sales', _source: { product_name: 'Laptop', category: 'electronics', amount: 1200 } },
      { _id: '2', _index: 'eq-sales', _source: { product_name: 'Mouse', category: 'electronics', amount: 50 } },
      { _id: '3', _index: 'eq-sales', _source: { product_name: 'Chair', category: 'furniture', amount: 400 } },
      { _id: '4', _index: 'eq-sales', _source: { product_name: 'Keyboard', category: 'electronics', amount: 80 } },
      { _id: '5', _index: 'eq-sales', _source: { product_name: 'Desk', category: 'furniture', amount: 600 } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      let score = 0;
      if (response.hits.hits.length === 0) score += 20;
      const agg = response.aggregations?.total_revenue;
      if (!agg) return { correct: false, score, maxScore: 100, feedback: 'Missing "total_revenue" aggregation.' };
      const expected = 1330;
      if (agg.value !== undefined && Math.abs(Number(agg.value) - expected) < 1) score += 80;
      else if (agg.value !== undefined && Math.abs(Number(agg.value) - 2330) < 1) return { correct: false, score: 30, maxScore: 100, feedback: 'Got sum of ALL categories. Filter to electronics first with a query.' };
      const correct = score >= 90;
      return { correct, score: Math.min(100, score), maxScore: 100, feedback: correct ? `Correct! Electronics total: $${expected}.` : `Expected $${expected}, got $${agg.value}.` };
    },
    maxScore: 100,
    timeLimitMs: 30000,
  },
  {
    id: 'aggs-4-cardinality',
    domain: 'aggregations',
    difficulty: 'intermediate',
    title: 'Count Unique Values',
    description: `Count the number of unique customers who placed orders. Use a cardinality aggregation named "unique_customers" on the "customer" field. Set size to 0.`,
    hints: ['Use cardinality aggregation for approximate distinct count', 'Field is "customer"'],
    indexName: 'eq-orders',
    mapping: { properties: { order_id: { type: 'keyword' }, customer: { type: 'keyword' }, total: { type: 'float' }, status: { type: 'keyword' } } },
    seedData: [
      { _id: '1', _index: 'eq-orders', _source: { order_id: 'O1', customer: 'alice', total: 100, status: 'completed' } },
      { _id: '2', _index: 'eq-orders', _source: { order_id: 'O2', customer: 'bob', total: 200, status: 'completed' } },
      { _id: '3', _index: 'eq-orders', _source: { order_id: 'O3', customer: 'alice', total: 150, status: 'shipped' } },
      { _id: '4', _index: 'eq-orders', _source: { order_id: 'O4', customer: 'charlie', total: 300, status: 'pending' } },
      { _id: '5', _index: 'eq-orders', _source: { order_id: 'O5', customer: 'bob', total: 50, status: 'completed' } },
      { _id: '6', _index: 'eq-orders', _source: { order_id: 'O6', customer: 'dave', total: 75, status: 'shipped' } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      let score = 0;
      if (response.hits.hits.length === 0) score += 20;
      const agg = response.aggregations?.unique_customers;
      if (!agg) return { correct: false, score, maxScore: 100, feedback: 'Missing "unique_customers" aggregation.' };
      if (agg.value === 4) score += 80;
      const correct = score >= 90;
      return { correct, score: Math.min(100, score), maxScore: 100, feedback: correct ? 'Correct! 4 unique customers.' : `Expected 4, got ${agg.value}.` };
    },
    maxScore: 100,
    timeLimitMs: 30000,
  },

  // --- ADVANCED ---
  {
    id: 'aggs-5-nested-stats',
    domain: 'aggregations',
    difficulty: 'advanced',
    title: 'Revenue by Region with Stats',
    description: `Group sales by "region" (terms agg named "by_region"), then for each region compute stats on "amount" (stats agg named "amount_stats"). Set size to 0.`,
    hints: ['Nest stats agg inside terms agg', 'stats gives count, min, max, avg, sum'],
    indexName: 'eq-sales',
    mapping: { properties: { product_name: { type: 'text' }, category: { type: 'keyword' }, amount: { type: 'float' }, region: { type: 'keyword' }, sale_date: { type: 'date' } } },
    seedData: [
      { _id: '1', _index: 'eq-sales', _source: { product_name: 'Laptop Pro', category: 'electronics', amount: 1299.99, region: 'north', sale_date: '2024-01-15' } },
      { _id: '2', _index: 'eq-sales', _source: { product_name: 'Wireless Mouse', category: 'electronics', amount: 49.99, region: 'south', sale_date: '2024-01-16' } },
      { _id: '3', _index: 'eq-sales', _source: { product_name: 'Office Chair', category: 'furniture', amount: 399.99, region: 'north', sale_date: '2024-01-17' } },
      { _id: '4', _index: 'eq-sales', _source: { product_name: 'Standing Desk', category: 'furniture', amount: 599.99, region: 'east', sale_date: '2024-01-18' } },
      { _id: '5', _index: 'eq-sales', _source: { product_name: 'Headphones', category: 'electronics', amount: 199.99, region: 'west', sale_date: '2024-01-19' } },
      { _id: '6', _index: 'eq-sales', _source: { product_name: 'Notebook Set', category: 'office_supplies', amount: 24.99, region: 'south', sale_date: '2024-01-20' } },
      { _id: '7', _index: 'eq-sales', _source: { product_name: 'Desk Lamp', category: 'furniture', amount: 79.99, region: 'north', sale_date: '2024-02-01' } },
      { _id: '8', _index: 'eq-sales', _source: { product_name: 'Pen Pack', category: 'office_supplies', amount: 12.99, region: 'east', sale_date: '2024-02-02' } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      let score = 0;
      if (response.hits.hits.length === 0) score += 10;
      const byRegion = response.aggregations?.by_region;
      if (!byRegion?.buckets) return { correct: false, score, maxScore: 100, feedback: 'Missing "by_region" terms aggregation.' };
      score += 20;
      if (byRegion.buckets.length === 4) score += 20;
      let hasStats = true;
      for (const bucket of byRegion.buckets) { if (!bucket.amount_stats) { hasStats = false; break; } }
      if (hasStats) score += 30;
      const northBucket = byRegion.buckets.find((b) => b.key === 'north');
      if (northBucket?.amount_stats) {
        const stats = northBucket.amount_stats as Record<string, unknown>;
        if (stats.count === 3) score += 10;
        if (stats.sum !== undefined && Math.abs(Number(stats.sum) - 1779.97) < 0.1) score += 10;
      }
      const correct = score >= 90;
      return { correct, score: Math.min(100, score), maxScore: 100, feedback: correct ? 'Nested stats per region computed correctly.' : `Score: ${score}/100. ${!hasStats ? 'Missing "amount_stats" sub-agg.' : 'Check structure.'}` };
    },
    maxScore: 100,
    timeLimitMs: 60000,
  },
  {
    id: 'aggs-6-date-histogram',
    domain: 'aggregations',
    difficulty: 'advanced',
    title: 'Monthly Sales Trend',
    description: `Create a date histogram of sales by month. Use a date_histogram aggregation named "monthly_sales" on the "sale_date" field with calendar_interval "month". For each month, also compute the sum of "amount" (named "revenue"). Size 0.`,
    hints: ['date_histogram with calendar_interval: "month"', 'Nest a sum agg inside'],
    indexName: 'eq-sales',
    mapping: { properties: { amount: { type: 'float' }, sale_date: { type: 'date' }, region: { type: 'keyword' } } },
    seedData: [
      { _id: '1', _index: 'eq-sales', _source: { amount: 100, sale_date: '2024-01-05', region: 'north' } },
      { _id: '2', _index: 'eq-sales', _source: { amount: 200, sale_date: '2024-01-20', region: 'south' } },
      { _id: '3', _index: 'eq-sales', _source: { amount: 150, sale_date: '2024-02-10', region: 'north' } },
      { _id: '4', _index: 'eq-sales', _source: { amount: 300, sale_date: '2024-02-15', region: 'east' } },
      { _id: '5', _index: 'eq-sales', _source: { amount: 250, sale_date: '2024-03-01', region: 'west' } },
      { _id: '6', _index: 'eq-sales', _source: { amount: 175, sale_date: '2024-03-20', region: 'north' } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      let score = 0;
      if (response.hits.hits.length === 0) score += 10;
      const agg = response.aggregations?.monthly_sales;
      if (!agg?.buckets) return { correct: false, score, maxScore: 100, feedback: 'Missing "monthly_sales" date_histogram aggregation.' };
      score += 20;
      if (agg.buckets.length === 3) score += 20;
      // Check each bucket has revenue sub-agg
      let hasRevenue = true;
      for (const b of agg.buckets) { if (!b.revenue) { hasRevenue = false; break; } }
      if (hasRevenue) score += 30;
      // Jan revenue = 300, Feb = 450, Mar = 425
      if (hasRevenue && agg.buckets.length >= 1) {
        const janBucket = agg.buckets[0];
        if (janBucket.revenue && Math.abs(Number((janBucket.revenue as Record<string, unknown>).value) - 300) < 1) score += 20;
      }
      const correct = score >= 90;
      return { correct, score: Math.min(100, score), maxScore: 100, feedback: correct ? 'Monthly date histogram with revenue sub-agg correct.' : `Score: ${score}/100. Need monthly_sales -> revenue structure.` };
    },
    maxScore: 100,
    timeLimitMs: 60000,
  },

  // --- EXPERT ---
  {
    id: 'aggs-7-multi-level',
    domain: 'aggregations',
    difficulty: 'expert',
    title: 'Three-Level Aggregation',
    description: `Build a 3-level aggregation:
1. Group by "region" (terms, named "by_region")
2. Inside each region, group by "category" (terms, named "by_category")
3. Inside each category, compute the avg "amount" (named "avg_amount")

Size 0.`,
    hints: ['Three nested aggs: terms -> terms -> avg', 'Each level uses aggs/aggregations key'],
    indexName: 'eq-sales',
    mapping: { properties: { category: { type: 'keyword' }, amount: { type: 'float' }, region: { type: 'keyword' } } },
    seedData: [
      { _id: '1', _index: 'eq-sales', _source: { category: 'electronics', amount: 500, region: 'north' } },
      { _id: '2', _index: 'eq-sales', _source: { category: 'electronics', amount: 300, region: 'north' } },
      { _id: '3', _index: 'eq-sales', _source: { category: 'furniture', amount: 400, region: 'north' } },
      { _id: '4', _index: 'eq-sales', _source: { category: 'electronics', amount: 600, region: 'south' } },
      { _id: '5', _index: 'eq-sales', _source: { category: 'furniture', amount: 200, region: 'south' } },
      { _id: '6', _index: 'eq-sales', _source: { category: 'furniture', amount: 350, region: 'south' } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      let score = 0;
      if (response.hits.hits.length === 0) score += 10;
      const byRegion = response.aggregations?.by_region;
      if (!byRegion?.buckets) return { correct: false, score, maxScore: 100, feedback: 'Missing "by_region" aggregation.' };
      score += 15;
      const northBucket = byRegion.buckets.find((b) => b.key === 'north');
      if (!northBucket) return { correct: false, score, maxScore: 100, feedback: 'No "north" bucket found.' };
      const byCat = northBucket.by_category as { buckets?: Array<{ key: string; doc_count: number; avg_amount?: Record<string, unknown> }> } | undefined;
      if (!byCat?.buckets) return { correct: false, score: score + 10, maxScore: 100, feedback: 'Missing "by_category" sub-agg in north bucket.' };
      score += 25;
      const elecBucket = byCat.buckets.find((b) => b.key === 'electronics');
      if (elecBucket?.avg_amount) {
        score += 25;
        // north electronics avg = (500+300)/2 = 400
        if (Math.abs(Number(elecBucket.avg_amount.value) - 400) < 1) score += 25;
      }
      const correct = score >= 90;
      return { correct, score: Math.min(100, score), maxScore: 100, feedback: correct ? '3-level aggregation correct. North electronics avg = $400.' : `Score: ${score}/100. Build: by_region -> by_category -> avg_amount.` };
    },
    maxScore: 100,
    timeLimitMs: 60000,
  },
];
