/**
 * Article data generator — produces 500+ realistic articles
 * with varied categories, authors, dates, tags, and view counts.
 *
 * Deterministic: uses a seeded PRNG so results are reproducible
 * across runs, making validation predictable.
 */

import type { Document, IndexMapping } from '../../types';

// Seeded PRNG for reproducibility
function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const CATEGORIES = [
  'technology', 'technology', 'technology',  // 3x weight
  'science', 'science',
  'business', 'business',
  'lifestyle',
  'travel',
  'health',
];

const TECH_TOPICS = [
  'Elasticsearch', 'ES|QL', 'Kibana', 'Kubernetes',
  'Machine Learning', 'Neural Networks', 'LLM',
  'Docker', 'Terraform', 'CI/CD', 'GraphQL',
  'React', 'TypeScript', 'Rust', 'Go',
  'Observability', 'APM', 'Distributed Tracing',
  'Vector Search', 'RAG', 'Embeddings',
];

const SCIENCE_TOPICS = [
  'Quantum Computing', 'CRISPR', 'Climate Change', 'Fusion Energy',
  'Mars Exploration', 'Neuroscience', 'Particle Physics',
  'Ocean Conservation', 'Renewable Energy', 'Biodiversity',
];

const BUSINESS_TOPICS = [
  'Startup Funding', 'Market Analysis', 'Remote Work',
  'Supply Chain', 'Digital Transformation', 'AI Strategy',
  'Cloud Economics', 'SaaS Metrics', 'Tech IPO', 'Venture Capital',
];

const LIFESTYLE_TOPICS = [
  'Healthy Cooking', 'Meditation', 'Fitness', 'Minimalism',
  'Work-Life Balance', 'Digital Detox', 'Productivity',
];

const TRAVEL_TOPICS = [
  'Tokyo', 'Paris', 'New York', 'Barcelona', 'Sydney',
  'Iceland', 'Costa Rica', 'New Zealand', 'Portugal', 'Thailand',
];

const HEALTH_TOPICS = [
  'Mental Health', 'Nutrition', 'Sleep', 'Exercise Science',
  'Preventive Care', 'Telemedicine', 'Wearable Health Tech',
];

const AUTHORS = [
  'Alice Chen', 'Bob Smith', 'Carlos Rivera', 'Diana Lee',
  'Emily Tanaka', 'Frank Wilson', 'Grace Park', 'Henry Kumar',
  'Iris Johansson', 'James Brown', 'Keiko Yamamoto', 'Liam O\'Brien',
  'Maria Garcia', 'Nathan Kim', 'Olivia Taylor',
];

const TITLE_PREFIXES = [
  'Introduction to', 'Deep Dive into', 'Understanding',
  'Advanced', 'Getting Started with', 'The Future of',
  'A Practical Guide to', 'Best Practices for',
  'How to Master', 'Why You Should Learn',
  'Building with', 'Scaling', 'Optimizing',
  'The Complete Guide to', 'Exploring',
];

const TAG_POOL: Record<string, string[]> = {
  technology: [
    'elasticsearch', 'esql', 'search', 'devops', 'cloud', 'ai',
    'machine-learning', 'tutorial', 'architecture', 'performance',
    'kubernetes', 'docker', 'observability', 'security', 'api',
    'typescript', 'rust', 'go', 'react', 'database',
  ],
  science: [
    'research', 'physics', 'biology', 'climate', 'space',
    'neuroscience', 'quantum', 'energy', 'genetics', 'ocean',
  ],
  business: [
    'startup', 'strategy', 'remote-work', 'finance', 'growth',
    'saas', 'leadership', 'economics', 'market', 'innovation',
  ],
  lifestyle: [
    'wellness', 'cooking', 'fitness', 'productivity', 'mindfulness',
    'minimalism', 'self-improvement', 'habits',
  ],
  travel: [
    'travel', 'guide', 'adventure', 'culture', 'food',
    'budget-travel', 'solo-travel', 'photography',
  ],
  health: [
    'health', 'nutrition', 'mental-health', 'fitness', 'sleep',
    'medicine', 'wellness', 'prevention',
  ],
};

function getTopics(category: string): string[] {
  switch (category) {
    case 'technology': return TECH_TOPICS;
    case 'science': return SCIENCE_TOPICS;
    case 'business': return BUSINESS_TOPICS;
    case 'lifestyle': return LIFESTYLE_TOPICS;
    case 'travel': return TRAVEL_TOPICS;
    case 'health': return HEALTH_TOPICS;
    default: return TECH_TOPICS;
  }
}

export const articlesMapping: IndexMapping = {
  properties: {
    title: { type: 'text' },
    category: { type: 'keyword' },
    author: { type: 'keyword' },
    published_date: { type: 'date' },
    views: { type: 'long' },
    tags: { type: 'keyword' },
    word_count: { type: 'integer' },
    rating: { type: 'float' },
  },
};

export function generateArticles(count = 600, seed = 42): Document[] {
  const rng = seededRng(seed);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const pickN = <T>(arr: T[], n: number): T[] => {
    const shuffled = [...arr].sort(() => rng() - 0.5);
    return shuffled.slice(0, n);
  };

  const docs: Document[] = [];

  // Generate across 18 months (2023-07 to 2024-12)
  const startMs = new Date('2023-07-01T00:00:00Z').getTime();
  const endMs = new Date('2024-12-31T23:59:59Z').getTime();
  const rangeMs = endMs - startMs;

  for (let i = 0; i < count; i++) {
    const category = pick(CATEGORIES);
    const topics = getTopics(category);
    const topic = pick(topics);
    const prefix = pick(TITLE_PREFIXES);
    const author = pick(AUTHORS);
    const tags = pickN(TAG_POOL[category] ?? TAG_POOL.technology, 2 + Math.floor(rng() * 3));

    // Views follow a power-law distribution
    const baseViews = Math.floor(rng() * rng() * 50000) + 100;
    // Technology articles get a boost
    const viewMultiplier = category === 'technology' ? 1.5 : 1.0;
    const views = Math.floor(baseViews * viewMultiplier);

    // Published date spread across the time range
    const publishedMs = startMs + Math.floor(rng() * rangeMs);
    const publishedDate = new Date(publishedMs).toISOString();

    const wordCount = 500 + Math.floor(rng() * 4500); // 500-5000
    const rating = Math.round((2.5 + rng() * 2.5) * 10) / 10; // 2.5-5.0

    docs.push({
      _id: `art-${i + 1}`,
      _index: 'eq-esql-articles',
      _source: {
        title: `${prefix} ${topic}`,
        category,
        author,
        published_date: publishedDate,
        views,
        tags,
        word_count: wordCount,
        rating,
      },
    });
  }

  return docs;
}

/**
 * Pre-computed facts about the generated data (seed=42).
 * Used by scenario validation to check correctness.
 */
export function getArticleFacts(docs: Document[]): {
  totalCount: number;
  techCount: number;
  categoryBreakdown: Record<string, number>;
  topAuthorByViews: { author: string; totalViews: number };
  topAuthorByCount: { author: string; count: number };
} {
  const categoryBreakdown: Record<string, number> = {};
  const authorViews: Record<string, number> = {};
  const authorCounts: Record<string, number> = {};

  for (const doc of docs) {
    const cat = doc._source.category as string;
    categoryBreakdown[cat] = (categoryBreakdown[cat] ?? 0) + 1;

    const author = doc._source.author as string;
    authorViews[author] = (authorViews[author] ?? 0) + (doc._source.views as number);
    authorCounts[author] = (authorCounts[author] ?? 0) + 1;
  }

  const techCount = categoryBreakdown['technology'] ?? 0;

  let topViewAuthor = '';
  let topViewTotal = 0;
  for (const [author, total] of Object.entries(authorViews)) {
    if (total > topViewTotal) {
      topViewAuthor = author;
      topViewTotal = total;
    }
  }

  let topCountAuthor = '';
  let topCount = 0;
  for (const [author, count] of Object.entries(authorCounts)) {
    if (count > topCount) {
      topCountAuthor = author;
      topCount = count;
    }
  }

  return {
    totalCount: docs.length,
    techCount,
    categoryBreakdown,
    topAuthorByViews: { author: topViewAuthor, totalViews: topViewTotal },
    topAuthorByCount: { author: topCountAuthor, count: topCount },
  };
}
