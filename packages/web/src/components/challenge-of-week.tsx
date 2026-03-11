import { getChallengePassRates } from '@/lib/store';

// Static challenge metadata (same as challenges page)
const CHALLENGES = [
  { id: 'fts-1-basic-match', domain: 'full-text-search', difficulty: 'beginner', title: 'Find the Articles', desc: 'Multi-field match query to find articles mentioning "elasticsearch"' },
  { id: 'fts-4-bool-query', domain: 'full-text-search', difficulty: 'intermediate', title: 'Filtered Search', desc: 'Bool query with must, should, and filter clauses' },
  { id: 'fts-11-dis-max', domain: 'full-text-search', difficulty: 'advanced', title: 'Best-Field with dis_max', desc: 'dis_max query for best single field match with tie_breaker' },
  { id: 'fts-13-nested', domain: 'full-text-search', difficulty: 'expert', title: 'Nested Object Query', desc: 'Nested query to match conditions within same array element' },
  { id: 'fts-14-function-score', domain: 'full-text-search', difficulty: 'expert', title: 'Custom Relevance', desc: 'function_score with field_value_factor to boost by rating' },
  { id: 'aggs-5-nested-stats', domain: 'aggregations', difficulty: 'advanced', title: 'Revenue by Region', desc: 'Terms agg with nested stats sub-aggregation' },
  { id: 'aggs-7-multi-level', domain: 'aggregations', difficulty: 'expert', title: 'Three-Level Aggregation', desc: 'Triple nested: region -> category -> avg amount' },
  { id: 'aggs-8-percentiles', domain: 'aggregations', difficulty: 'advanced', title: 'Latency Percentiles', desc: 'p50/p95/p99 percentiles on response times' },
  { id: 'aggs-10-percentile-ranks', domain: 'aggregations', difficulty: 'expert', title: 'SLO Compliance', desc: 'Percentile ranks to check what % of requests meet SLO' },
  { id: 'obs-6-latency-percentiles', domain: 'observability', difficulty: 'advanced', title: 'Service Latency Percentiles', desc: 'APM-style: terms on service -> percentiles p50/p95/p99 on duration' },
  { id: 'obs-8-multi-service', domain: 'observability', difficulty: 'advanced', title: 'Cross-Service Trace Errors', desc: 'Terms on trace_id -> cardinality on service.name for cascading failures' },
  { id: 'obs-10-uptime', domain: 'observability', difficulty: 'expert', title: 'SLO Uptime Calculation', desc: 'Filters agg with success (2xx) vs failure (5xx) per service' },
  { id: 'vec-3-hybrid', domain: 'vector-search', difficulty: 'advanced', title: 'Hybrid Text + Vector', desc: 'Combine kNN similarity with keyword text matching' },
  { id: 'sec-4-alert-triage', domain: 'security', difficulty: 'advanced', title: 'Alert Severity Triage', desc: 'Filters aggregation to categorize alerts by severity range' },
  { id: 'sec-5-correlation', domain: 'security', difficulty: 'advanced', title: 'Compromised Accounts', desc: 'Terms + sub-agg to find users with both failed and successful logins' },
];

const DIFF_COLORS: Record<string, string> = {
  beginner: '#22c55e',
  intermediate: '#3b82f6',
  advanced: '#a855f7',
  expert: '#ef4444',
};

function getWeeklyChallenge(): typeof CHALLENGES[0] {
  const weekNumber = Math.floor(Date.now() / (7 * 86400000));
  return CHALLENGES[weekNumber % CHALLENGES.length];
}

export async function ChallengeOfTheWeek() {
  const challenge = getWeeklyChallenge();
  let passRate: { passed: number; total: number } | null = null;

  try {
    const rates = await getChallengePassRates();
    passRate = rates[challenge.id] ?? null;
  } catch {
    // Firestore may not be available locally
  }

  const pct = passRate && passRate.total > 0
    ? Math.round((passRate.passed / passRate.total) * 100)
    : null;

  return (
    <div style={{
      background: '#141414',
      border: '1px solid #262626',
      borderRadius: 12,
      padding: '1.75rem',
      maxWidth: 600,
      margin: '0 auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.8rem', color: '#00bfae', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Challenge of the Week
        </span>
        <span style={{
          fontSize: '0.75rem',
          fontWeight: 600,
          color: DIFF_COLORS[challenge.difficulty] ?? '#737373',
          background: `${DIFF_COLORS[challenge.difficulty] ?? '#737373'}15`,
          padding: '0.15rem 0.5rem',
          borderRadius: 4,
        }}>
          {challenge.difficulty}
        </span>
      </div>

      <h3 style={{ fontSize: '1.15rem', marginBottom: '0.5rem' }}>{challenge.title}</h3>
      <p style={{ color: '#a3a3a3', fontSize: '0.9rem', marginBottom: '1rem', lineHeight: 1.6 }}>
        {challenge.desc}
      </p>

      <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.85rem' }}>
        <span style={{ color: '#737373' }}>
          Domain: <span style={{ color: '#e5e5e5' }}>{challenge.domain}</span>
        </span>
        {pct !== null && (
          <span style={{ color: '#737373' }}>
            Pass rate: <span style={{ color: pct >= 70 ? '#22c55e' : pct >= 40 ? '#fbbf24' : '#ef4444', fontWeight: 600 }}>
              {pct}%
            </span>
            <span style={{ color: '#525252' }}> ({passRate!.passed}/{passRate!.total} models)</span>
          </span>
        )}
      </div>
    </div>
  );
}
