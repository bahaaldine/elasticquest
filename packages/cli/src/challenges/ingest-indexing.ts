import type { Challenge, SearchResponse, ElasticBackend } from '../types';

export const ingestIndexingChallenges: Challenge[] = [
  // --- BEGINNER ---
  {
    id: 'ingest-1-mapping-query',
    domain: 'ingest-indexing',
    difficulty: 'beginner',
    title: 'Query with Correct Field Types',
    description: `The index "eq-ecommerce" has products with fields: name (text), category (keyword), price (float), in_stock (boolean), created_at (date).

Write a query to find all products in the "electronics" category priced between 100 and 500 (inclusive) that are in stock.`,
    hints: [
      'Use a bool query with filter clauses for efficiency',
      'Use a term query on keyword fields, range on numeric fields',
    ],
    indexName: 'eq-ecommerce',
    mapping: {
      properties: {
        name: { type: 'text' },
        category: { type: 'keyword' },
        price: { type: 'float' },
        in_stock: { type: 'boolean' },
        created_at: { type: 'date' },
      },
    },
    seedData: [
      { _id: '1', _index: 'eq-ecommerce', _source: { name: 'Wireless Headphones', category: 'electronics', price: 149.99, in_stock: true, created_at: '2024-01-10' } },
      { _id: '2', _index: 'eq-ecommerce', _source: { name: 'Mechanical Keyboard', category: 'electronics', price: 89.99, in_stock: true, created_at: '2024-01-15' } },
      { _id: '3', _index: 'eq-ecommerce', _source: { name: 'USB-C Monitor', category: 'electronics', price: 449.99, in_stock: true, created_at: '2024-02-01' } },
      { _id: '4', _index: 'eq-ecommerce', _source: { name: '4K Webcam', category: 'electronics', price: 199.99, in_stock: false, created_at: '2024-02-10' } },
      { _id: '5', _index: 'eq-ecommerce', _source: { name: 'Standing Desk', category: 'furniture', price: 350.00, in_stock: true, created_at: '2024-01-20' } },
      { _id: '6', _index: 'eq-ecommerce', _source: { name: 'Laptop Stand', category: 'electronics', price: 45.99, in_stock: true, created_at: '2024-03-01' } },
      { _id: '7', _index: 'eq-ecommerce', _source: { name: 'Gaming Mouse', category: 'electronics', price: 79.99, in_stock: true, created_at: '2024-03-05' } },
      { _id: '8', _index: 'eq-ecommerce', _source: { name: 'Noise Cancelling Earbuds', category: 'electronics', price: 299.99, in_stock: true, created_at: '2024-03-10' } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      const hitIds = response.hits.hits.map((h) => h._id);
      const expectedIds = ['1', '3', '8'];
      const found = expectedIds.filter((id) => hitIds.includes(id));
      const falsePositives = hitIds.filter((id) => !expectedIds.includes(id));
      const correct = found.length === expectedIds.length && falsePositives.length === 0;
      const score = Math.floor((found.length / expectedIds.length) * 85) - falsePositives.length * 15;
      return { correct, score: Math.max(0, Math.min(100, score)), maxScore: 100, feedback: correct ? 'Correct! Found all in-stock electronics between $100-$500.' : `Found ${found.length}/${expectedIds.length}. ${falsePositives.length} false positives.` };
    },
    maxScore: 100,
    timeLimitMs: 30000,
  },

  // --- INTERMEDIATE ---
  {
    id: 'ingest-2-sort-pagination',
    domain: 'ingest-indexing',
    difficulty: 'intermediate',
    title: 'Sort and Pagination',
    description: `Get the top 3 most expensive products from "eq-ecommerce", sorted by price descending. Use _source filtering to only return "name" and "price" fields.`,
    hints: [
      'Use sort: [{"price": {"order": "desc"}}]',
      'Use size: 3 to limit results',
      'Use _source: ["name", "price"] to filter fields',
    ],
    indexName: 'eq-ecommerce',
    mapping: {
      properties: {
        name: { type: 'text' },
        category: { type: 'keyword' },
        price: { type: 'float' },
        in_stock: { type: 'boolean' },
      },
    },
    seedData: [
      { _id: '1', _index: 'eq-ecommerce', _source: { name: 'Wireless Headphones', category: 'electronics', price: 149.99, in_stock: true } },
      { _id: '2', _index: 'eq-ecommerce', _source: { name: 'Mechanical Keyboard', category: 'electronics', price: 89.99, in_stock: true } },
      { _id: '3', _index: 'eq-ecommerce', _source: { name: 'USB-C Monitor', category: 'electronics', price: 449.99, in_stock: true } },
      { _id: '4', _index: 'eq-ecommerce', _source: { name: 'Standing Desk', category: 'furniture', price: 599.99, in_stock: true } },
      { _id: '5', _index: 'eq-ecommerce', _source: { name: 'Ergonomic Chair', category: 'furniture', price: 899.99, in_stock: false } },
      { _id: '6', _index: 'eq-ecommerce', _source: { name: 'Laptop Stand', category: 'electronics', price: 45.99, in_stock: true } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      const hits = response.hits.hits;
      const correctSize = hits.length === 3;
      const expectedOrder = ['5', '4', '3'];
      const actualOrder = hits.map((h) => h._id);
      const correctOrder = expectedOrder.every((id, i) => actualOrder[i] === id);
      let score = 0;
      if (correctSize) score += 40;
      if (correctOrder) score += 60;
      const correct = correctSize && correctOrder;
      return { correct, score: Math.min(100, score), maxScore: 100, feedback: correct ? 'Correct! Top 3 most expensive products in descending order.' : `${correctSize ? '' : `Expected 3 results, got ${hits.length}. `}${correctOrder ? '' : `Expected order: ${expectedOrder.join(', ')}, got: ${actualOrder.join(', ')}.`}` };
    },
    maxScore: 100,
    timeLimitMs: 30000,
  },
  {
    id: 'ingest-3-date-filter',
    domain: 'ingest-indexing',
    difficulty: 'intermediate',
    title: 'Date Range Filtering',
    description: `Find all orders placed in February 2024 (2024-02-01 to 2024-02-29 inclusive). Sort by order_date ascending.

Fields: order_id (keyword), customer (keyword), order_date (date), total (float), status (keyword).`,
    hints: [
      'Use a range query on order_date with gte and lte',
      'Sort by order_date asc',
    ],
    indexName: 'eq-orders',
    mapping: {
      properties: {
        order_id: { type: 'keyword' },
        customer: { type: 'keyword' },
        order_date: { type: 'date' },
        total: { type: 'float' },
        status: { type: 'keyword' },
      },
    },
    seedData: [
      { _id: '1', _index: 'eq-orders', _source: { order_id: 'ORD-001', customer: 'alice', order_date: '2024-01-15', total: 99.99, status: 'completed' } },
      { _id: '2', _index: 'eq-orders', _source: { order_id: 'ORD-002', customer: 'bob', order_date: '2024-02-03', total: 149.99, status: 'completed' } },
      { _id: '3', _index: 'eq-orders', _source: { order_id: 'ORD-003', customer: 'alice', order_date: '2024-02-14', total: 249.99, status: 'shipped' } },
      { _id: '4', _index: 'eq-orders', _source: { order_id: 'ORD-004', customer: 'charlie', order_date: '2024-02-28', total: 59.99, status: 'pending' } },
      { _id: '5', _index: 'eq-orders', _source: { order_id: 'ORD-005', customer: 'dave', order_date: '2024-03-01', total: 199.99, status: 'completed' } },
      { _id: '6', _index: 'eq-orders', _source: { order_id: 'ORD-006', customer: 'bob', order_date: '2024-03-15', total: 349.99, status: 'shipped' } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      const hitIds = response.hits.hits.map((h) => h._id);
      const expectedIds = ['2', '3', '4'];
      const found = expectedIds.filter((id) => hitIds.includes(id));
      const falsePositives = hitIds.filter((id) => !expectedIds.includes(id));
      const correctContent = found.length === expectedIds.length && falsePositives.length === 0;
      const correctOrder = hitIds[0] === '2' && hitIds[1] === '3' && hitIds[2] === '4';
      let score = 0;
      if (correctContent) score += 70;
      if (correctOrder) score += 30;
      return { correct: correctContent && correctOrder, score: Math.min(100, score), maxScore: 100, feedback: correctContent && correctOrder ? 'Correct! All February orders found in chronological order.' : `Content: ${found.length}/${expectedIds.length}. Sort: ${correctOrder ? 'correct' : 'should be ascending by order_date'}.` };
    },
    maxScore: 100,
    timeLimitMs: 30000,
  },
  {
    id: 'ingest-4-terms-query',
    domain: 'ingest-indexing',
    difficulty: 'intermediate',
    title: 'Multi-Value Matching',
    description: `Find all orders with status "pending" or "shipped" (not "completed" or "cancelled"). Use a terms query.`,
    hints: [
      'Use a terms query to match multiple values at once',
      'terms: { status: ["pending", "shipped"] }',
    ],
    indexName: 'eq-orders',
    mapping: {
      properties: {
        order_id: { type: 'keyword' },
        customer: { type: 'keyword' },
        order_date: { type: 'date' },
        total: { type: 'float' },
        status: { type: 'keyword' },
      },
    },
    seedData: [
      { _id: '1', _index: 'eq-orders', _source: { order_id: 'ORD-001', customer: 'alice', order_date: '2024-01-15', total: 99.99, status: 'completed' } },
      { _id: '2', _index: 'eq-orders', _source: { order_id: 'ORD-002', customer: 'bob', order_date: '2024-02-03', total: 149.99, status: 'shipped' } },
      { _id: '3', _index: 'eq-orders', _source: { order_id: 'ORD-003', customer: 'alice', order_date: '2024-02-14', total: 249.99, status: 'pending' } },
      { _id: '4', _index: 'eq-orders', _source: { order_id: 'ORD-004', customer: 'charlie', order_date: '2024-02-28', total: 59.99, status: 'cancelled' } },
      { _id: '5', _index: 'eq-orders', _source: { order_id: 'ORD-005', customer: 'dave', order_date: '2024-03-01', total: 199.99, status: 'pending' } },
      { _id: '6', _index: 'eq-orders', _source: { order_id: 'ORD-006', customer: 'bob', order_date: '2024-03-15', total: 349.99, status: 'shipped' } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      const hitIds = response.hits.hits.map((h) => h._id);
      const expectedIds = ['2', '3', '5', '6'];
      const found = expectedIds.filter((id) => hitIds.includes(id));
      const falsePositives = hitIds.filter((id) => !expectedIds.includes(id));
      const correct = found.length === expectedIds.length && falsePositives.length === 0;
      const score = Math.floor((found.length / expectedIds.length) * 85) - falsePositives.length * 15;
      return { correct, score: Math.max(0, score), maxScore: 100, feedback: correct ? 'Correct! Found all pending and shipped orders.' : `Found ${found.length}/${expectedIds.length}. ${falsePositives.length} false positives.` };
    },
    maxScore: 100,
    timeLimitMs: 30000,
  },

  // --- ADVANCED ---
  {
    id: 'ingest-5-pagination',
    domain: 'ingest-indexing',
    difficulty: 'advanced',
    title: 'Deep Pagination',
    description: `Implement page 2 of results (items 4-6) when showing 3 results per page, sorted by price ascending. Use from/size pagination.

This means: from=3, size=3, sorted by price ascending.`,
    hints: [
      'from is 0-indexed: page 2 with size 3 means from=3',
      'Use sort: [{"price": "asc"}]',
    ],
    indexName: 'eq-ecommerce',
    mapping: {
      properties: {
        name: { type: 'text' },
        price: { type: 'float' },
        category: { type: 'keyword' },
      },
    },
    seedData: [
      { _id: '1', _index: 'eq-ecommerce', _source: { name: 'Pen', price: 2.99, category: 'office' } },
      { _id: '2', _index: 'eq-ecommerce', _source: { name: 'Notebook', price: 12.99, category: 'office' } },
      { _id: '3', _index: 'eq-ecommerce', _source: { name: 'Mouse', price: 29.99, category: 'electronics' } },
      { _id: '4', _index: 'eq-ecommerce', _source: { name: 'Keyboard', price: 79.99, category: 'electronics' } },
      { _id: '5', _index: 'eq-ecommerce', _source: { name: 'Headphones', price: 149.99, category: 'electronics' } },
      { _id: '6', _index: 'eq-ecommerce', _source: { name: 'Monitor', price: 399.99, category: 'electronics' } },
      { _id: '7', _index: 'eq-ecommerce', _source: { name: 'Desk', price: 499.99, category: 'furniture' } },
      { _id: '8', _index: 'eq-ecommerce', _source: { name: 'Chair', price: 599.99, category: 'furniture' } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      const hits = response.hits.hits;
      // Price sorted asc: 1(2.99), 2(12.99), 3(29.99), 4(79.99), 5(149.99), 6(399.99), 7(499.99), 8(599.99)
      // Page 2 (from=3, size=3): 4, 5, 6
      const expectedOrder = ['4', '5', '6'];
      const actualOrder = hits.map((h) => h._id);
      const correctSize = hits.length === 3;
      const correctOrder = expectedOrder.every((id, i) => actualOrder[i] === id);
      let score = 0;
      if (correctSize) score += 40;
      if (correctOrder) score += 60;
      return { correct: correctSize && correctOrder, score, maxScore: 100, feedback: correctSize && correctOrder ? 'Correct! Page 2 shows items 4-6 by price.' : `Expected [4,5,6], got [${actualOrder.join(',')}]. size=${hits.length}.` };
    },
    maxScore: 100,
    timeLimitMs: 30000,
  },
  {
    id: 'ingest-6-count-and-filter',
    domain: 'ingest-indexing',
    difficulty: 'advanced',
    title: 'Conditional Counting',
    description: `Find how many products are in the "electronics" category AND priced above 50. Return size 0 (we only need the count from hits.total).`,
    hints: [
      'Use size: 0 so no docs are returned',
      'The count is in hits.total.value',
      'Use bool filter with term + range',
    ],
    indexName: 'eq-ecommerce',
    mapping: {
      properties: {
        name: { type: 'text' },
        price: { type: 'float' },
        category: { type: 'keyword' },
      },
    },
    seedData: [
      { _id: '1', _index: 'eq-ecommerce', _source: { name: 'Pen', price: 2.99, category: 'office' } },
      { _id: '2', _index: 'eq-ecommerce', _source: { name: 'Mouse', price: 29.99, category: 'electronics' } },
      { _id: '3', _index: 'eq-ecommerce', _source: { name: 'Keyboard', price: 79.99, category: 'electronics' } },
      { _id: '4', _index: 'eq-ecommerce', _source: { name: 'Headphones', price: 149.99, category: 'electronics' } },
      { _id: '5', _index: 'eq-ecommerce', _source: { name: 'Monitor', price: 399.99, category: 'electronics' } },
      { _id: '6', _index: 'eq-ecommerce', _source: { name: 'Cable', price: 9.99, category: 'electronics' } },
      { _id: '7', _index: 'eq-ecommerce', _source: { name: 'Desk', price: 499.99, category: 'furniture' } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      // electronics AND price > 50: 3(79.99), 4(149.99), 5(399.99) = 3
      const expectedCount = 3;
      const actualCount = response.hits.total.value;
      const noHits = response.hits.hits.length === 0;
      let score = 0;
      if (actualCount === expectedCount) score += 70;
      if (noHits) score += 30;
      const correct = actualCount === expectedCount && noHits;
      return { correct, score, maxScore: 100, feedback: correct ? 'Correct! 3 electronics priced above $50.' : `Expected count ${expectedCount}, got ${actualCount}. ${noHits ? '' : 'Use size:0.'}` };
    },
    maxScore: 100,
    timeLimitMs: 30000,
  },
];
