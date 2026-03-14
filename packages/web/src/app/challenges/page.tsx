'use client';

import { useState } from 'react';

const DOMAIN_LABELS: Record<string, string> = {
  'full-text-search': 'Full-Text Search',
  'ingest-indexing': 'Ingest & Indexing',
  aggregations: 'Aggregations',
  observability: 'Observability',
  'vector-search': 'Vector Search',
  security: 'Security / SIEM',
  esql: 'ES|QL',
};

const DIFF_COLORS: Record<string, string> = {
  beginner: '#22c55e',
  intermediate: '#3b82f6',
  advanced: '#a855f7',
  expert: '#ef4444',
};

const CHALLENGES = [
  // Full-Text Search
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
  // Ingest & Indexing
  { id: 'ingest-1-mapping-query', domain: 'ingest-indexing', difficulty: 'beginner', title: 'Field Type Queries', desc: 'Bool filter with term, range, and boolean field matching' },
  { id: 'ingest-2-sort-pagination', domain: 'ingest-indexing', difficulty: 'intermediate', title: 'Sort and Pagination', desc: 'Sort by price desc, limit to top 3, _source filtering' },
  { id: 'ingest-3-date-filter', domain: 'ingest-indexing', difficulty: 'intermediate', title: 'Date Range Filtering', desc: 'Range query on dates with ascending sort' },
  { id: 'ingest-4-terms-query', domain: 'ingest-indexing', difficulty: 'intermediate', title: 'Multi-Value Matching', desc: 'Terms query to match multiple status values at once' },
  { id: 'ingest-5-pagination', domain: 'ingest-indexing', difficulty: 'advanced', title: 'Deep Pagination', desc: 'Page 2 of results using from/size with sort' },
  { id: 'ingest-6-count-and-filter', domain: 'ingest-indexing', difficulty: 'advanced', title: 'Conditional Counting', desc: 'Count documents matching criteria with size:0' },
  // Aggregations
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
  // Observability
  { id: 'obs-1-log-filtering', domain: 'observability', difficulty: 'beginner', title: 'Filter Error Logs', desc: 'Term query to find all ERROR-level logs' },
  { id: 'obs-2-service-errors', domain: 'observability', difficulty: 'intermediate', title: 'Service Error Investigation', desc: 'Bool + range + sort for time-windowed service errors' },
  { id: 'obs-3-error-rate', domain: 'observability', difficulty: 'advanced', title: 'Error Rate by Service', desc: 'Nested terms aggs: service -> level distribution' },
  { id: 'obs-4-status-code-range', domain: 'observability', difficulty: 'intermediate', title: 'HTTP 5xx Analysis', desc: 'Range query on status_code field for server errors' },
  { id: 'obs-5-log-text-search', domain: 'observability', difficulty: 'advanced', title: 'Log Pattern Search', desc: 'Combined text match + level filter for error investigation' },
  { id: 'obs-6-latency-percentiles', domain: 'observability', difficulty: 'advanced', title: 'Service Latency Percentiles', desc: 'APM-style: terms on service -> percentiles p50/p95/p99' },
  { id: 'obs-7-error-spike', domain: 'observability', difficulty: 'intermediate', title: 'Error Spike Detection', desc: 'date_histogram (1h) on ERROR logs to find incident window' },
  { id: 'obs-8-multi-service', domain: 'observability', difficulty: 'advanced', title: 'Cross-Service Trace Errors', desc: 'Terms on trace_id -> cardinality on service.name' },
  { id: 'obs-9-top-errors', domain: 'observability', difficulty: 'intermediate', title: 'Top Error Messages', desc: 'Terms agg on message.keyword for most common errors' },
  { id: 'obs-10-uptime', domain: 'observability', difficulty: 'expert', title: 'SLO Uptime Calculation', desc: 'Filters agg with success (2xx) vs failure (5xx) per service' },
  // Vector Search
  { id: 'vec-1-knn-basic', domain: 'vector-search', difficulty: 'beginner', title: 'Basic kNN Search', desc: 'kNN nearest neighbor search on dense vector field' },
  { id: 'vec-2-knn-with-filter', domain: 'vector-search', difficulty: 'intermediate', title: 'kNN with Filter', desc: 'kNN with category filter to restrict candidates' },
  { id: 'vec-3-hybrid', domain: 'vector-search', difficulty: 'advanced', title: 'Hybrid Text + Vector', desc: 'Combine kNN similarity with keyword text matching' },
  { id: 'vec-4-semantic-category', domain: 'vector-search', difficulty: 'expert', title: 'Semantic + Aggregation', desc: 'kNN results aggregated by category for classification' },
  // Security
  { id: 'sec-1-ip-range', domain: 'security', difficulty: 'beginner', title: 'Denied Traffic from Subnet', desc: 'Wildcard/prefix on source IP + action filter' },
  { id: 'sec-2-failed-logins', domain: 'security', difficulty: 'intermediate', title: 'Brute Force Detection', desc: 'Bool filter + terms agg to find IPs with most failed logins' },
  { id: 'sec-3-rare-domains', domain: 'security', difficulty: 'intermediate', title: 'DNS Threat Hunting', desc: 'Rare terms aggregation to find unusual domain queries' },
  { id: 'sec-4-alert-triage', domain: 'security', difficulty: 'advanced', title: 'Alert Severity Triage', desc: 'Filters aggregation to categorize alerts by severity range' },
  { id: 'sec-5-correlation', domain: 'security', difficulty: 'advanced', title: 'Compromised Accounts', desc: 'Terms + sub-agg to find users with both failed and successful logins' },
  // Multi-turn
  { id: 'mt-1-discover-and-search', domain: 'full-text-search', difficulty: 'intermediate', title: 'Discover Schema, Then Search', desc: 'Explore unknown index schema, then find matching documents', multiTurn: true },
  { id: 'mt-2-explore-and-aggregate', domain: 'aggregations', difficulty: 'advanced', title: 'Explore Data, Then Aggregate', desc: 'Discover non-obvious field names, then compute revenue per region', multiTurn: true },
  { id: 'mt-3-unknown-logs', domain: 'observability', difficulty: 'advanced', title: 'Unknown Log Schema', desc: 'Investigate logs with non-standard field names (ts, severity, svc)', multiTurn: true },
  { id: 'mt-4-investigate', domain: 'security', difficulty: 'expert', title: 'Security Investigation', desc: 'Discover auth schema, find IPs with 3+ failed login attempts', multiTurn: true },
  // ES|QL Scenarios (require real ES)
  { id: 'esql-1-basic-filter', domain: 'esql', difficulty: 'beginner', title: 'ES|QL Basic Filtering', desc: 'FROM + WHERE + SORT + LIMIT on 600 articles', scenario: true },
  { id: 'esql-2-stats-aggregation', domain: 'esql', difficulty: 'beginner', title: 'ES|QL Stats Aggregation', desc: 'STATS with COUNT/AVG grouped BY category', scenario: true },
  { id: 'esql-3-eval-computed', domain: 'esql', difficulty: 'intermediate', title: 'ES|QL Computed Fields with EVAL', desc: 'EVAL + CASE for conditional classification', scenario: true },
  { id: 'esql-4-log-error-analysis', domain: 'esql', difficulty: 'intermediate', title: 'ES|QL Log Error Analysis', desc: 'Error counting with COUNT_DISTINCT across 2500 logs', scenario: true },
  { id: 'esql-5-time-bucket', domain: 'esql', difficulty: 'advanced', title: 'ES|QL Time-Bucketed Log Analysis', desc: 'BUCKET(@timestamp, 5 min) with log.level breakdown', scenario: true },
  { id: 'esql-6-discover-and-query', domain: 'esql', difficulty: 'advanced', title: 'ES|QL Discovery and Query', desc: 'Multi-turn: discover schema then aggregate top authors', multiTurn: true, scenario: true },
  // Observability Scenarios
  { id: 'obs-esql-1-error-investigation', domain: 'observability', difficulty: 'intermediate', title: 'Log Error Investigation (ES|QL)', desc: 'Error timeline across 2500 microservice logs', scenario: true },
  { id: 'obs-esql-2-error-breakdown', domain: 'observability', difficulty: 'intermediate', title: 'Service Error Breakdown (ES|QL)', desc: 'Count by service and log level', scenario: true },
  { id: 'obs-esql-3-root-cause', domain: 'observability', difficulty: 'advanced', title: 'Root Cause Investigation (ES|QL)', desc: 'Multi-turn: funnel through noise to find upstream failure', multiTurn: true, scenario: true },
  // Security Scenarios
  { id: 'sec-esql-1-brute-force', domain: 'security', difficulty: 'intermediate', title: 'Brute Force Detection (ES|QL)', desc: 'Find IPs with 3+ failed auths in 1500 events', scenario: true },
  { id: 'sec-esql-2-post-compromise', domain: 'security', difficulty: 'advanced', title: 'Post-Compromise Analysis (ES|QL)', desc: 'Timeline of attacker activity after successful login', scenario: true },
  { id: 'sec-esql-3-attack-chain', domain: 'security', difficulty: 'expert', title: 'Full Attack Chain (ES|QL)', desc: 'Multi-turn: classify events into attack phases', multiTurn: true, scenario: true },
];

const ALL_DOMAINS = [...new Set(CHALLENGES.map((c) => c.domain))];
const ALL_DIFFICULTIES = ['beginner', 'intermediate', 'advanced', 'expert'];

export default function ChallengesPage() {
  const [search, setSearch] = useState('');
  const [domainFilter, setDomainFilter] = useState<string | null>(null);
  const [diffFilter, setDiffFilter] = useState<string | null>(null);
  const [multiTurnOnly, setMultiTurnOnly] = useState(false);

  const filtered = CHALLENGES.filter((c) => {
    if (domainFilter && c.domain !== domainFilter) return false;
    if (diffFilter && c.difficulty !== diffFilter) return false;
    if (multiTurnOnly && !('multiTurn' in c && c.multiTurn)) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.title.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q) || c.id.toLowerCase().includes(q);
    }
    return true;
  });

  const domains = [...new Set(filtered.map((c) => c.domain))];

  return (
    <div className="leaderboard-page">
      <h1>Challenge Catalog</h1>
      <p className="subtitle">
        65 challenges + 12 skill-aligned scenarios across 7 domains and 4 difficulty levels
      </p>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem', alignItems: 'center' }}>
        {/* Search */}
        <input
          type="text"
          placeholder="Search challenges..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            background: '#141414', border: '1px solid #262626', borderRadius: 6,
            padding: '0.5rem 0.75rem', color: '#e5e5e5', fontSize: '0.85rem',
            outline: 'none', width: 220,
          }}
        />

        {/* Domain filter */}
        <select
          value={domainFilter ?? ''}
          onChange={(e) => setDomainFilter(e.target.value || null)}
          style={{
            background: '#141414', border: '1px solid #262626', borderRadius: 6,
            padding: '0.5rem 0.75rem', color: '#e5e5e5', fontSize: '0.85rem', outline: 'none',
          }}
        >
          <option value="">All domains</option>
          {ALL_DOMAINS.map((d) => (
            <option key={d} value={d}>{DOMAIN_LABELS[d] ?? d}</option>
          ))}
        </select>

        {/* Difficulty filter */}
        <select
          value={diffFilter ?? ''}
          onChange={(e) => setDiffFilter(e.target.value || null)}
          style={{
            background: '#141414', border: '1px solid #262626', borderRadius: 6,
            padding: '0.5rem 0.75rem', color: '#e5e5e5', fontSize: '0.85rem', outline: 'none',
          }}
        >
          <option value="">All difficulties</option>
          {ALL_DIFFICULTIES.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        {/* Multi-turn toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', color: '#a3a3a3', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={multiTurnOnly}
            onChange={(e) => setMultiTurnOnly(e.target.checked)}
            style={{ accentColor: '#a855f7' }}
          />
          Multi-turn only
        </label>

        {/* Result count */}
        <span style={{ color: '#737373', fontSize: '0.85rem', marginLeft: 'auto' }}>
          {filtered.length} challenge{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Difficulty stats */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        {ALL_DIFFICULTIES.map((d) => {
          const count = filtered.filter((c) => c.difficulty === d).length;
          return (
            <span
              key={d}
              onClick={() => setDiffFilter(diffFilter === d ? null : d)}
              style={{
                background: diffFilter === d ? `${DIFF_COLORS[d]}20` : '#141414',
                border: `1px solid ${diffFilter === d ? DIFF_COLORS[d] : '#262626'}`,
                borderRadius: 6, padding: '0.4rem 0.8rem', fontSize: '0.85rem', cursor: 'pointer',
              }}
            >
              <span style={{ color: DIFF_COLORS[d], fontWeight: 600 }}>{d}</span>
              <span style={{ color: '#737373', marginLeft: '0.4rem' }}>{count}</span>
            </span>
          );
        })}
        {CHALLENGES.filter((c) => 'multiTurn' in c && c.multiTurn).length > 0 && (
          <span
            onClick={() => setMultiTurnOnly(!multiTurnOnly)}
            style={{
              background: multiTurnOnly ? '#a855f720' : '#141414',
              border: `1px solid ${multiTurnOnly ? '#a855f7' : '#262626'}`,
              borderRadius: 6, padding: '0.4rem 0.8rem', fontSize: '0.85rem', cursor: 'pointer',
            }}
          >
            <span style={{ color: '#a855f7', fontWeight: 600 }}>multi-turn</span>
            <span style={{ color: '#737373', marginLeft: '0.4rem' }}>
              {CHALLENGES.filter((c) => 'multiTurn' in c && c.multiTurn).length}
            </span>
          </span>
        )}
      </div>

      {domains.map((domain) => {
        const domainChallenges = filtered.filter((c) => c.domain === domain);
        if (domainChallenges.length === 0) return null;
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
                    <td style={{ fontWeight: 600 }}>
                      {c.title}
                      {'multiTurn' in c && c.multiTurn && (
                        <span style={{
                          fontSize: '0.65rem', color: '#a855f7', marginLeft: 6,
                          fontWeight: 700, background: '#a855f715', padding: '0.1rem 0.4rem',
                          borderRadius: 3, verticalAlign: 'middle',
                        }}>
                          MULTI-TURN
                        </span>
                      )}
                      {'scenario' in c && c.scenario && (
                        <span style={{
                          fontSize: '0.65rem', color: '#facc15', marginLeft: 6,
                          fontWeight: 700, background: 'rgba(250, 204, 21, 0.1)', padding: '0.1rem 0.4rem',
                          borderRadius: 3, verticalAlign: 'middle',
                        }}>
                          SCENARIO
                        </span>
                      )}
                    </td>
                    <td>
                      <span style={{
                        fontSize: '0.75rem', fontWeight: 600,
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
