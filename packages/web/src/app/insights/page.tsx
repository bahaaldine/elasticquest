import { getChallengePassRates, getLeaderboard } from '@/lib/store';

export const dynamic = 'force-dynamic';

const DOMAIN_LABELS: Record<string, string> = {
  // Legacy challenge domains
  'full-text-search': 'Search',
  'ingest-indexing': 'Ingest',
  aggregations: 'Aggs',
  'vector-search': 'Vector',
  // Scenario domains
  search: 'Search',
  observability: 'Observability',
  security: 'Security',
  kibana: 'Kibana',
  cloud: 'Cloud',
  'agent-builder': 'Agent Builder',
};

const DIFF_COLORS: Record<string, string> = {
  beginner: '#22c55e',
  intermediate: '#3b82f6',
  advanced: '#a855f7',
  expert: '#ef4444',
};

// Static challenge metadata
const CHALLENGE_META: Record<string, { title: string; domain: string; difficulty: string; multiTurn?: boolean }> = {
  'fts-1-basic-match': { title: 'Find the Articles', domain: 'full-text-search', difficulty: 'beginner' },
  'fts-2-simple-term': { title: 'Exact Category Match', domain: 'full-text-search', difficulty: 'beginner' },
  'fts-3-match-with-operator': { title: 'Match All Terms', domain: 'full-text-search', difficulty: 'beginner' },
  'fts-4-bool-query': { title: 'Filtered Search', domain: 'full-text-search', difficulty: 'intermediate' },
  'fts-5-must-not': { title: 'Exclusion Query', domain: 'full-text-search', difficulty: 'intermediate' },
  'fts-6-multi-match-boosting': { title: 'Field Boosting', domain: 'full-text-search', difficulty: 'intermediate' },
  'fts-7-phrase-and-range': { title: 'Phrase + Date Range', domain: 'full-text-search', difficulty: 'advanced' },
  'fts-8-wildcard-exists': { title: 'Wildcard and Exists', domain: 'full-text-search', difficulty: 'advanced' },
  'fts-9-complex-bool': { title: 'Complex Multi-Condition', domain: 'full-text-search', difficulty: 'expert' },
  'fts-10-fuzzy': { title: 'Fuzzy Search', domain: 'full-text-search', difficulty: 'intermediate' },
  'fts-11-dis-max': { title: 'dis_max', domain: 'full-text-search', difficulty: 'advanced' },
  'fts-12-boosting': { title: 'Boosting Query', domain: 'full-text-search', difficulty: 'advanced' },
  'fts-13-nested': { title: 'Nested Object Query', domain: 'full-text-search', difficulty: 'expert' },
  'fts-14-function-score': { title: 'function_score', domain: 'full-text-search', difficulty: 'expert' },
  'ingest-1-mapping-query': { title: 'Field Type Queries', domain: 'ingest-indexing', difficulty: 'beginner' },
  'ingest-2-sort-pagination': { title: 'Sort and Pagination', domain: 'ingest-indexing', difficulty: 'intermediate' },
  'ingest-3-date-filter': { title: 'Date Range Filter', domain: 'ingest-indexing', difficulty: 'intermediate' },
  'ingest-4-terms-query': { title: 'Multi-Value Match', domain: 'ingest-indexing', difficulty: 'intermediate' },
  'ingest-5-pagination': { title: 'Deep Pagination', domain: 'ingest-indexing', difficulty: 'advanced' },
  'ingest-6-count-and-filter': { title: 'Conditional Count', domain: 'ingest-indexing', difficulty: 'advanced' },
  'aggs-1-basic-terms': { title: 'Category Breakdown', domain: 'aggregations', difficulty: 'beginner' },
  'aggs-2-simple-avg': { title: 'Average Value', domain: 'aggregations', difficulty: 'beginner' },
  'aggs-3-filtered-agg': { title: 'Filtered Aggregation', domain: 'aggregations', difficulty: 'intermediate' },
  'aggs-4-cardinality': { title: 'Count Unique', domain: 'aggregations', difficulty: 'intermediate' },
  'aggs-5-nested-stats': { title: 'Nested Stats', domain: 'aggregations', difficulty: 'advanced' },
  'aggs-6-date-histogram': { title: 'Date Histogram', domain: 'aggregations', difficulty: 'advanced' },
  'aggs-7-multi-level': { title: '3-Level Agg', domain: 'aggregations', difficulty: 'expert' },
  'aggs-8-percentiles': { title: 'Percentiles', domain: 'aggregations', difficulty: 'advanced' },
  'aggs-9-filters': { title: 'Named Filters', domain: 'aggregations', difficulty: 'advanced' },
  'aggs-10-percentile-ranks': { title: 'SLO Compliance', domain: 'aggregations', difficulty: 'expert' },
  'obs-1-log-filtering': { title: 'Filter Errors', domain: 'observability', difficulty: 'beginner' },
  'obs-2-service-errors': { title: 'Service Errors', domain: 'observability', difficulty: 'intermediate' },
  'obs-3-error-rate': { title: 'Error Rate', domain: 'observability', difficulty: 'advanced' },
  'obs-4-status-code-range': { title: 'HTTP 5xx', domain: 'observability', difficulty: 'intermediate' },
  'obs-5-log-text-search': { title: 'Log Pattern', domain: 'observability', difficulty: 'advanced' },
  'obs-6-latency-percentiles': { title: 'Latency Percentiles', domain: 'observability', difficulty: 'advanced' },
  'obs-7-error-spike': { title: 'Error Spike', domain: 'observability', difficulty: 'intermediate' },
  'obs-8-multi-service': { title: 'Trace Correlation', domain: 'observability', difficulty: 'advanced' },
  'obs-9-top-errors': { title: 'Top Errors', domain: 'observability', difficulty: 'intermediate' },
  'obs-10-uptime': { title: 'SLO Uptime', domain: 'observability', difficulty: 'expert' },
  'vec-1-knn-basic': { title: 'Basic kNN', domain: 'vector-search', difficulty: 'beginner' },
  'vec-2-knn-with-filter': { title: 'kNN + Filter', domain: 'vector-search', difficulty: 'intermediate' },
  'vec-3-hybrid': { title: 'Hybrid Search', domain: 'vector-search', difficulty: 'advanced' },
  'vec-4-semantic-category': { title: 'Semantic + Agg', domain: 'vector-search', difficulty: 'expert' },
  'sec-1-ip-range': { title: 'IP Range Filter', domain: 'security', difficulty: 'beginner' },
  'sec-2-failed-logins': { title: 'Brute Force', domain: 'security', difficulty: 'intermediate' },
  'sec-3-rare-domains': { title: 'DNS Hunting', domain: 'security', difficulty: 'intermediate' },
  'sec-4-alert-triage': { title: 'Alert Triage', domain: 'security', difficulty: 'advanced' },
  'sec-5-correlation': { title: 'Account Correlation', domain: 'security', difficulty: 'advanced' },
  'mt-1-discover-and-search': { title: 'Discover & Search', domain: 'full-text-search', difficulty: 'intermediate', multiTurn: true },
  'mt-2-explore-and-aggregate': { title: 'Explore & Aggregate', domain: 'aggregations', difficulty: 'advanced', multiTurn: true },
  'mt-3-unknown-logs': { title: 'Unknown Schema', domain: 'observability', difficulty: 'advanced', multiTurn: true },
  'mt-4-investigate': { title: 'Security Investigation', domain: 'security', difficulty: 'expert', multiTurn: true },
};

export default async function InsightsPage() {
  const [passRates, leaderboard] = await Promise.all([
    getChallengePassRates(),
    getLeaderboard(),
  ]);

  const totalModels = leaderboard.length;

  // Build sorted list
  const challenges = Object.entries(passRates)
    .map(([id, { passed, total }]) => {
      const meta = CHALLENGE_META[id] ?? { title: id, domain: 'unknown', difficulty: 'unknown' };
      const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
      return { id, passed, total, pct, ...meta };
    })
    .sort((a, b) => a.pct - b.pct); // Hardest first

  const hardest = challenges.slice(0, 10);
  const easiest = [...challenges].sort((a, b) => b.pct - a.pct).slice(0, 10);

  // Domain averages
  const domainAvg = new Map<string, { totalPct: number; count: number }>();
  for (const c of challenges) {
    const entry = domainAvg.get(c.domain) ?? { totalPct: 0, count: 0 };
    entry.totalPct += c.pct;
    entry.count++;
    domainAvg.set(c.domain, entry);
  }

  // Difficulty averages
  const diffAvg = new Map<string, { totalPct: number; count: number }>();
  for (const c of challenges) {
    const entry = diffAvg.get(c.difficulty) ?? { totalPct: 0, count: 0 };
    entry.totalPct += c.pct;
    entry.count++;
    diffAvg.set(c.difficulty, entry);
  }

  return (
    <div className="leaderboard-page">
      <h1>Challenge Insights</h1>
      <p className="subtitle">
        What do LLMs actually struggle with in Elasticsearch? Aggregate pass rates across {totalModels} model{totalModels !== 1 ? 's' : ''}.
      </p>

      {challenges.length === 0 ? (
        <div className="empty-state">
          <p>No benchmark data yet. Run some benchmarks to see insights.</p>
          <code>npx elastic-quest benchmark --pick</code>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '1rem',
            marginBottom: '2.5rem',
          }}>
            <div style={{ background: '#141414', border: '1px solid #262626', borderRadius: 8, padding: '1rem' }}>
              <div style={{ color: '#737373', fontSize: '0.8rem' }}>Avg Pass Rate</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#00bfae' }}>
                {challenges.length > 0 ? Math.round(challenges.reduce((s, c) => s + c.pct, 0) / challenges.length) : 0}%
              </div>
              <div style={{ color: '#737373', fontSize: '0.75rem' }}>across all challenges</div>
            </div>
            <div style={{ background: '#141414', border: '1px solid #262626', borderRadius: 8, padding: '1rem' }}>
              <div style={{ color: '#737373', fontSize: '0.8rem' }}>Hardest Challenge</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ef4444' }}>
                {hardest[0]?.title ?? '—'}
              </div>
              <div style={{ color: '#737373', fontSize: '0.75rem' }}>{hardest[0]?.pct ?? 0}% pass rate</div>
            </div>
            <div style={{ background: '#141414', border: '1px solid #262626', borderRadius: 8, padding: '1rem' }}>
              <div style={{ color: '#737373', fontSize: '0.8rem' }}>Easiest Challenge</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#22c55e' }}>
                {easiest[0]?.title ?? '—'}
              </div>
              <div style={{ color: '#737373', fontSize: '0.75rem' }}>{easiest[0]?.pct ?? 0}% pass rate</div>
            </div>
            <div style={{ background: '#141414', border: '1px solid #262626', borderRadius: 8, padding: '1rem' }}>
              <div style={{ color: '#737373', fontSize: '0.8rem' }}>Models Tested</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{totalModels}</div>
              <div style={{ color: '#737373', fontSize: '0.75rem' }}>unique models</div>
            </div>
          </div>

          {/* Domain difficulty heatmap */}
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Pass Rate by Domain</h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '0.75rem',
            marginBottom: '2.5rem',
          }}>
            {Array.from(domainAvg.entries())
              .sort((a, b) => Math.round(a[1].totalPct / a[1].count) - Math.round(b[1].totalPct / b[1].count))
              .map(([domain, { totalPct, count }]) => {
                const avg = Math.round(totalPct / count);
                const color = avg >= 80 ? '#22c55e' : avg >= 50 ? '#fbbf24' : '#ef4444';
                return (
                  <div key={domain} style={{ background: '#141414', border: '1px solid #262626', borderRadius: 8, padding: '0.75rem 1rem' }}>
                    <div style={{ fontSize: '0.85rem', marginBottom: 4 }}>{DOMAIN_LABELS[domain] ?? domain}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ flex: 1, height: 8, borderRadius: 4, background: '#262626' }}>
                        <div style={{ width: `${avg}%`, height: 8, borderRadius: 4, background: color }} />
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 700, color }}>{avg}%</span>
                    </div>
                    <div style={{ color: '#737373', fontSize: '0.75rem', marginTop: 4 }}>{count} challenges</div>
                  </div>
                );
              })}
          </div>

          {/* Pass rate by difficulty */}
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Pass Rate by Difficulty</h2>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2.5rem' }}>
            {['beginner', 'intermediate', 'advanced', 'expert'].map((d) => {
              const entry = diffAvg.get(d);
              const avg = entry ? Math.round(entry.totalPct / entry.count) : 0;
              return (
                <div key={d} style={{
                  background: '#141414', border: '1px solid #262626', borderRadius: 8,
                  padding: '1rem 1.5rem', textAlign: 'center', minWidth: 120,
                }}>
                  <div style={{ color: DIFF_COLORS[d], fontWeight: 600, fontSize: '0.85rem', marginBottom: 4 }}>{d}</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{avg}%</div>
                  <div style={{ color: '#737373', fontSize: '0.75rem' }}>{entry?.count ?? 0} challenges</div>
                </div>
              );
            })}
          </div>

          {/* Hardest challenges table */}
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#ef4444' }}>
            10 Hardest Challenges
          </h2>
          <table className="lb-table" style={{ marginBottom: '2.5rem' }}>
            <thead>
              <tr>
                <th>Challenge</th>
                <th>Domain</th>
                <th>Difficulty</th>
                <th>Pass Rate</th>
                <th>Passed / Total</th>
              </tr>
            </thead>
            <tbody>
              {hardest.map((c) => {
                const barColor = c.pct >= 80 ? '#22c55e' : c.pct >= 50 ? '#fbbf24' : '#ef4444';
                return (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>
                      {c.title}
                      {c.multiTurn && <span style={{ fontSize: '0.7rem', color: '#a855f7', marginLeft: 6, fontWeight: 600 }}>MULTI-TURN</span>}
                    </td>
                    <td><span className="domain-chip">{DOMAIN_LABELS[c.domain] ?? c.domain}</span></td>
                    <td><span style={{ fontSize: '0.75rem', fontWeight: 600, color: DIFF_COLORS[c.difficulty] }}>{c.difficulty}</span></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: 80, height: 6, borderRadius: 3, background: '#262626' }}>
                          <div style={{ width: `${c.pct}%`, height: 6, borderRadius: 3, background: barColor }} />
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 600, color: barColor }}>{c.pct}%</span>
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#737373' }}>
                      {c.passed}/{c.total}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Easiest challenges table */}
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#22c55e' }}>
            10 Easiest Challenges
          </h2>
          <table className="lb-table">
            <thead>
              <tr>
                <th>Challenge</th>
                <th>Domain</th>
                <th>Difficulty</th>
                <th>Pass Rate</th>
                <th>Passed / Total</th>
              </tr>
            </thead>
            <tbody>
              {easiest.map((c) => {
                const barColor = c.pct >= 80 ? '#22c55e' : c.pct >= 50 ? '#fbbf24' : '#ef4444';
                return (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.title}</td>
                    <td><span className="domain-chip">{DOMAIN_LABELS[c.domain] ?? c.domain}</span></td>
                    <td><span style={{ fontSize: '0.75rem', fontWeight: 600, color: DIFF_COLORS[c.difficulty] }}>{c.difficulty}</span></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: 80, height: 6, borderRadius: 3, background: '#262626' }}>
                          <div style={{ width: `${c.pct}%`, height: 6, borderRadius: 3, background: barColor }} />
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 600, color: barColor }}>{c.pct}%</span>
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#737373' }}>
                      {c.passed}/{c.total}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
