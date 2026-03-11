# Contributing to ElasticQuest

Thanks for your interest in contributing! The most impactful way to contribute
is by **adding new challenges** that test real-world Elasticsearch knowledge.

## Adding a New Challenge

### 1. Pick your challenge

Choose a domain and difficulty that's missing or underrepresented:

| Domain | Current | Could use more |
|---|---|---|
| `full-text-search` | 14 | function_score variations, highlight, percolate |
| `ingest-indexing` | 6 | pipeline processors (grok, dissect, enrich), runtime fields, reindex |
| `aggregations` | 10 | composite, significant_terms, pipeline aggs (derivative, cumulative_sum, bucket_script) |
| `observability` | 5 | APM traces, SLO computation, moving averages, anomaly detection |
| `vector-search` | 4 | sparse_vector/ELSER, RRF, semantic_text, reranking |
| `security` | 5 | EQL sequences, geo queries, CIDR range, lateral movement detection |

### 2. Create the challenge file

```bash
# Copy the template
cp packages/cli/src/challenges/_template.ts \
   packages/cli/src/challenges/<domain>/<your-id>.ts
```

For example:
```bash
cp packages/cli/src/challenges/_template.ts \
   packages/cli/src/challenges/aggregations/aggs-11-composite.ts
```

### 3. Fill in the challenge

Edit your new file. Key fields:

```typescript
export const challenge: Challenge = {
  id: 'aggs-11-composite',           // unique, format: <prefix>-<num>-<name>
  domain: 'aggregations',
  difficulty: 'advanced',
  title: 'Paginated Aggregation with Composite',
  description: `Full description shown to the model...`,
  hints: ['Use composite agg...', 'Set size and after_key...'],
  indexName: 'eq-analytics',          // must start with eq-
  mapping: { properties: { ... } },
  seedData: [                         // 5-8 documents
    { _id: '1', _index: 'eq-analytics', _source: { ... } },
  ],
  validate: async (response, backend) => {
    // Use helpers or write custom validation
    return scoreHits(response, ['1', '3', '5']);
  },
  maxScore: 100,
  timeLimitMs: 45000,
};
```

### 4. Register it

Edit `packages/cli/src/challenges/index.ts`:

```typescript
import { challenge as aggs11Composite } from './aggregations/aggs-11-composite';

export function getAllChallenges(): Challenge[] {
  return [
    ...fullTextSearchChallenges,
    // ... existing arrays ...
    aggs11Composite,  // <-- add your challenge
  ];
}
```

### 5. Test it

```bash
# Run all tests
npm test -w packages/cli

# Type check
npm run typecheck -w packages/cli

# Test your challenge specifically with a model (optional)
OPENROUTER_API_KEY=... node packages/cli/dist/index.js benchmark \
  -m openrouter:openai/gpt-4o-mini \
  --domain aggregations -v
```

## Validation Tips

### Use helpers for common patterns

```typescript
import { scoreHits, scoreOrder, checkNoHits, getAgg, getBucketCounts } from '../helpers';

// Check document IDs in results
return scoreHits(response, ['1', '3', '5']);

// Check sort order
return scoreOrder(response, ['3', '1', '5']);

// Check aggregation values
const { ok, score } = checkNoHits(response);
const agg = getAgg(response, 'my_agg');
if (!agg) return { correct: false, score, maxScore: 100, feedback: 'Missing aggregation.' };
```

### Write good seed data

- Include 5-8 documents
- Have clear "should match" and "should not match" examples
- Include edge cases (e.g., a document that matches one condition but not another)
- Make sure false positives are possible if the query is wrong

### Write clear descriptions

The model only sees the `description` and `hints` fields. Be specific:
- State what fields exist and their types
- State exactly what the expected output should be
- Mention specific query types when relevant for advanced challenges

### Scoring guidelines

- `maxScore` is always 100
- Give partial credit for partially correct answers
- Penalize false positives (typically -15 per false positive)
- Add bonus points for things like correct sort order or optimal query structure

## Challenge ID Convention

Format: `<domain-prefix>-<number>-<short-name>`

| Domain | Prefix | Example |
|---|---|---|
| full-text-search | `fts` | `fts-15-synonym` |
| ingest-indexing | `ingest` | `ingest-7-grok` |
| aggregations | `aggs` | `aggs-11-composite` |
| observability | `obs` | `obs-6-trace-correlation` |
| vector-search | `vec` | `vec-5-sparse-vector` |
| security | `sec` | `sec-6-eql-sequence` |

## Running with Real Elasticsearch

To test challenges against a real Elasticsearch cluster:

```bash
# Auto-provision on Elastic Cloud (creates + tears down automatically)
ESS_API_KEY=... node packages/cli/dist/index.js benchmark \
  -m openrouter:openai/gpt-4o-mini --real-es -v

# Or use your own cluster
node packages/cli/dist/index.js benchmark \
  -m openrouter:openai/gpt-4o-mini \
  --mode real --es-node https://my-cluster:9200 -v
```

## Other Ways to Contribute

- **Report bugs** — Open an issue on GitHub
- **Improve the simulated backend** — Add support for more ES query types in
  `packages/cli/src/elastic/simulated-backend.ts`
- **Improve the web UI** — The leaderboard and challenge pages are in `packages/web/`
- **Add model adapters** — New providers in `packages/cli/src/benchmark/model-adapters.ts`
