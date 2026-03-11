const DOMAIN_LABELS: Record<string, string> = {
  'full-text-search': 'Full-Text Search',
  'ingest-indexing': 'Ingest & Indexing',
  aggregations: 'Aggregations',
  observability: 'Observability',
  'vector-search': 'Vector Search',
  security: 'Security / SIEM',
};

const DIFF_COLORS: Record<string, string> = {
  beginner: '#22c55e',
  intermediate: '#3b82f6',
  advanced: '#a855f7',
  expert: '#ef4444',
};

// Static challenge list (from CLI)
const CHALLENGES = [
  // Full-Text Search (14)
  { id: 'fts-1-basic-match', domain: 'full-text-search', difficulty: 'beginner', title: 'Find the Articles', desc: 'Multi-field match query to find articles mentioning "elasticsearch"' },
  { id: 'fts-2-simple-term', domain: 'full-text-search', difficulty: 'beginner', title: 'Exact Category Match', desc: 'Term query on keyword field for exact author matching' },
  { id: 'fts-3-match-with-operator', domain: 'full-text-search', difficulty: 'beginner', title: 'Match All Terms', desc: 'Match query with AND operator requiring all terms present' },
  { id: 'fts-4-bool-query', domain: 'full-text-search', difficulty: 'intermediate', title: 'Filtered Search', desc: 'Bool query with must, should, and filter clauses' },
  { id: 'fts-5-must-not', domain: 'full-text-search', difficulty: 'intermediate', title: 'Exclusion Query', desc: 'Bool query with must_not to exclude specific tags' },
  { id: 'fts-6-multi-match-boosting', domain: 'full-text-search', difficulty: 'intermediate', title: 'Field Boosting', desc: 'Multi-match with field boosting (title^3)' },
  { id: 'fts-7-phrase-and-range', domain: 'full-text-search', difficulty: 'advanced', title: 'Precise Phrase + Date Range', desc: 'Combine match_phrase with range query on dates' },
  { id: 'fts-8-wildcard-exists', domain: 'full-text-search', difficulty: 'advanced', title: 'Wildcard and Exists', desc: 'Wildcard on SKU patterns combined with exists check' },
  { id: 'fts-9-complex-bool', domain: 'full-text-search', difficulty: 'expert', title: 'Complex Multi-Condition Search', desc: 'Multi-clause bool with must/must_not/should/filter on job listings' },
  { id: 'fts-10-fuzzy', domain: 'full-text-search', difficulty: 'intermediate', title: 'Fuzzy Search for Typos', desc: 'Fuzzy query with edit distance for typo tolerance' },
  { id: 'fts-11-dis-max', domain: 'full-text-search', difficulty: 'advanced', title: 'Best-Field with dis_max', desc: 'dis_max query for best single field match with tie_breaker' },
  { id: 'fts-12-boosting', domain: 'full-text-search', difficulty: 'advanced', title: 'Demote Without Excluding', desc: 'Boosting query to reduce score of beginner articles' },
  { id: 'fts-13-nested', domain: 'full-text-search', difficulty: 'expert', title: 'Nested Object Query', desc: 'Nested query to match conditions within same array element' },
  { id: 'fts-14-function-score', domain: 'full-text-search', difficulty: 'expert', title: 'Custom Relevance', desc: 'function_score with field_value_factor to boost by rating' },
  // Ingest & Indexing (6)
  { id: 'ingest-1-mapping-query', domain: 'ingest-indexing', difficulty: 'beginner', title: 'Field Type Queries', desc: 'Bool filter with term, range, and boolean field matching' },
  { id: 'ingest-2-sort-pagination', domain: 'ingest-indexing', difficulty: 'intermediate', title: 'Sort and Pagination', desc: 'Sort by price desc, limit to top 3, _source filtering' },
  { id: 'ingest-3-date-filter', domain: 'ingest-indexing', difficulty: 'intermediate', title: 'Date Range Filtering', desc: 'Range query on dates with ascending sort' },
  { id: 'ingest-4-terms-query', domain: 'ingest-indexing', difficulty: 'intermediate', title: 'Multi-Value Matching', desc: 'Terms query to match multiple status values at once' },
  { id: 'ingest-5-pagination', domain: 'ingest-indexing', difficulty: 'advanced', title: 'Deep Pagination', desc: 'Page 2 of results using from/size with sort' },
  { id: 'ingest-6-count-and-filter', domain: 'ingest-indexing', difficulty: 'advanced', title: 'Conditional Counting', desc: 'Count documents matching criteria with size:0' },
  // Aggregations (10)
  { id: 'aggs-1-basic-terms', domain: 'aggregations', difficulty: 'beginner', title: 'Category Breakdown', desc: 'Terms aggregation to count documents per category' },
  { id: 'aggs-2-simple-avg', domain: 'aggregations', difficulty: 'beginner', title: 'Average Value', desc: 'Avg metric aggregation on a numeric field' },
  { id: 'aggs-3-filtered-agg', domain: 'aggregations', difficulty: 'intermediate', title: 'Filtered Aggregation', desc: 'Sum aggregation with query filter on category' },
  { id: 'aggs-4-cardinality', domain: 'aggregations', difficulty: 'intermediate', title: 'Count Unique Values', desc: 'Cardinality aggregation for approximate distinct count' },
  { id: 'aggs-5-nested-stats', domain: 'aggregations', difficulty: 'advanced', title: 'Revenue by Region', desc: 'Terms agg with nested stats sub-aggregation' },
  { id: 'aggs-6-date-histogram', domain: 'aggregations', difficulty: 'advanced', title: 'Monthly Sales Trend', desc: 'Date histogram with revenue sum sub-aggregation' },
  { id: 'aggs-7-multi-level', domain: 'aggregations', difficulty: 'expert', title: 'Three-Level Aggregation', desc: 'Triple nested: region -> category -> avg amount' },
  { id: 'aggs-8-percentiles', domain: 'aggregations', difficulty: 'advanced', title: 'Latency Percentiles', desc: 'p50/p95/p99 percentiles on response times' },
  { id: 'aggs-9-filters', domain: 'aggregations', difficulty: 'advanced', title: 'Named Filters', desc: 'Filters aggregation for HTTP status code categorization' },
  { id: 'aggs-10-percentile-ranks', domain: 'aggregations', difficulty: 'expert', title: 'SLO Compliance', desc: 'Percentile ranks to check what % of requests meet SLO' },
  // Observability (5)
  { id: 'obs-1-log-filtering', domain: 'observability', difficulty: 'beginner', title: 'Filter Error Logs', desc: 'Term query to find all ERROR-level logs' },
  { id: 'obs-2-service-errors', domain: 'observability', difficulty: 'intermediate', title: 'Service Error Investigation', desc: 'Bool + range + sort for time-windowed service errors' },
  { id: 'obs-3-error-rate', domain: 'observability', difficulty: 'advanced', title: 'Error Rate by Service', desc: 'Nested terms aggs: service -> level distribution' },
  { id: 'obs-4-status-code-range', domain: 'observability', difficulty: 'intermediate', title: 'HTTP 5xx Analysis', desc: 'Range query on status_code field for server errors' },
  { id: 'obs-5-log-text-search', domain: 'observability', difficulty: 'advanced', title: 'Log Pattern Search', desc: 'Combined text match + level filter for error investigation' },
  // Vector Search (4)
  { id: 'vec-1-knn-basic', domain: 'vector-search', difficulty: 'beginner', title: 'Basic kNN Search', desc: 'kNN nearest neighbor search on dense vector field' },
  { id: 'vec-2-knn-with-filter', domain: 'vector-search', difficulty: 'intermediate', title: 'kNN with Filter', desc: 'kNN with category filter to restrict candidates' },
  { id: 'vec-3-hybrid', domain: 'vector-search', difficulty: 'advanced', title: 'Hybrid Text + Vector', desc: 'Combine kNN similarity with keyword text matching' },
  { id: 'vec-4-semantic-category', domain: 'vector-search', difficulty: 'expert', title: 'Semantic + Aggregation', desc: 'kNN results aggregated by category for classification' },
  // Security (5)
  { id: 'sec-1-ip-range', domain: 'security', difficulty: 'beginner', title: 'Denied Traffic from Subnet', desc: 'Wildcard/prefix on source IP + action filter' },
  { id: 'sec-2-failed-logins', domain: 'security', difficulty: 'intermediate', title: 'Brute Force Detection', desc: 'Bool filter + terms agg to find IPs with most failed logins' },
  { id: 'sec-3-rare-domains', domain: 'security', difficulty: 'intermediate', title: 'DNS Threat Hunting', desc: 'Rare terms aggregation to find unusual domain queries' },
  { id: 'sec-4-alert-triage', domain: 'security', difficulty: 'advanced', title: 'Alert Severity Triage', desc: 'Filters aggregation to categorize alerts by severity range' },
  { id: 'sec-5-correlation', domain: 'security', difficulty: 'advanced', title: 'Compromised Accounts', desc: 'Terms + sub-agg to find users with both failed and successful logins' },
];

// Group by domain
const domains = [...new Set(CHALLENGES.map((c) => c.domain))];

export default function ChallengesPage() {
  return (
    <div className="leaderboard-page">
      <h1>Challenge Catalog</h1>
      <p className="subtitle">
        44 Elasticsearch challenges across 6 domains and 4 difficulty levels
      </p>

      {/* Stats */}
      <div style={{
        display: 'flex',
        gap: '1rem',
        flexWrap: 'wrap',
        marginBottom: '2rem',
      }}>
        {(['beginner', 'intermediate', 'advanced', 'expert'] as const).map((d) => {
          const count = CHALLENGES.filter((c) => c.difficulty === d).length;
          return (
            <span key={d} style={{
              background: '#141414',
              border: '1px solid #262626',
              borderRadius: 6,
              padding: '0.4rem 0.8rem',
              fontSize: '0.85rem',
            }}>
              <span style={{ color: DIFF_COLORS[d], fontWeight: 600 }}>{d}</span>
              <span style={{ color: '#737373', marginLeft: '0.4rem' }}>{count}</span>
            </span>
          );
        })}
      </div>

      {domains.map((domain) => {
        const domainChallenges = CHALLENGES.filter((c) => c.domain === domain);
        return (
          <div key={domain} style={{ marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.15rem', color: '#00bfae', marginBottom: '0.75rem' }}>
              {DOMAIN_LABELS[domain] ?? domain}
              <span style={{ color: '#737373', fontWeight: 400, fontSize: '0.9rem', marginLeft: '0.5rem' }}>
                ({domainChallenges.length})
              </span>
            </h2>
            <table className="lb-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Challenge</th>
                  <th>Difficulty</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {domainChallenges.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#737373', whiteSpace: 'nowrap' }}>
                      {c.id}
                    </td>
                    <td style={{ fontWeight: 600 }}>{c.title}</td>
                    <td>
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: DIFF_COLORS[c.difficulty] ?? '#737373',
                      }}>
                        {c.difficulty}
                      </span>
                    </td>
                    <td style={{ color: '#a3a3a3', fontSize: '0.9rem' }}>{c.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
