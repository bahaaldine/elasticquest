import { getLeaderboard } from '@/lib/store';
import type { LeaderboardEntry } from '@/lib/store';

const DOMAIN_LABELS: Record<string, string> = {
  'full-text-search': 'Search',
  'ingest-indexing': 'Ingest',
  aggregations: 'Aggs',
  observability: 'Obs',
  'vector-search': 'Vector',
  security: 'Security',
};

function RankBadge({ rank }: { rank: number }) {
  const cls = rank <= 3 ? `rank-col rank-${rank}` : 'rank-col';
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`;
  return <td className={cls}>{medal}</td>;
}

function PercentBar({ pct }: { pct: number }) {
  return (
    <span>
      <span className="pct-track">
        <span className="pct-bar" style={{ width: `${pct}%` }} />
      </span>
      {pct}%
    </span>
  );
}

function LeaderboardTable({ entries }: { entries: LeaderboardEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="empty-state">
        <p>No benchmark results yet. Be the first!</p>
        <code>npx elastic-quest benchmark --pick</code>
      </div>
    );
  }

  return (
    <table className="lb-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Model</th>
          <th>Score</th>
          <th>Pass Rate</th>
          <th>Domains</th>
          <th>Latency</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.modelId}>
            <RankBadge rank={entry.rank} />
            <td className="model-col">
              <a
                href={`/leaderboard/${encodeURIComponent(entry.modelId)}`}
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                {entry.modelName}
                <span className="provider-tag">{entry.provider}</span>
              </a>
            </td>
            <td className="score-col">
              <PercentBar pct={entry.percentage} />
            </td>
            <td>
              {entry.correct}/{entry.total}
            </td>
            <td>
              <div className="domain-scores">
                {Object.entries(entry.domainScores).map(([domain, pct]) => (
                  <span key={domain} className="domain-chip">
                    {DOMAIN_LABELS[domain] ?? domain} {pct}%
                  </span>
                ))}
              </div>
            </td>
            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
              {entry.avgLatencyMs}ms
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export const dynamic = 'force-dynamic';

export default async function LeaderboardPage() {
  const entries = await getLeaderboard();

  return (
    <div className="leaderboard-page">
      <h1>Model Leaderboard</h1>
      <p className="subtitle">
        Best scores across {entries.length} model{entries.length !== 1 ? 's' : ''} on 44
        Elasticsearch challenges
      </p>
      <LeaderboardTable entries={entries} />

      {/* Compare suggestion */}
      {entries.length >= 2 && (
        <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#141414', border: '1px solid #262626', borderRadius: 12 }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Compare Models</h3>
          <p style={{ color: '#737373', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
            Head-to-head comparison with challenge-by-challenge breakdown:
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {entries.length >= 2 && (
              <a
                href={`/compare/${encodeURIComponent(entries[0].modelId)}...${encodeURIComponent(entries[1].modelId)}`}
                style={{
                  color: '#00bfae',
                  textDecoration: 'none',
                  background: '#0a0a0a',
                  border: '1px solid #262626',
                  borderRadius: 6,
                  padding: '0.4rem 0.8rem',
                  fontSize: '0.85rem',
                }}
              >
                {entries[0].modelName} vs {entries[1].modelName}
              </a>
            )}
            {entries.length >= 3 && (
              <a
                href={`/compare/${encodeURIComponent(entries[0].modelId)}...${encodeURIComponent(entries[2].modelId)}`}
                style={{
                  color: '#00bfae',
                  textDecoration: 'none',
                  background: '#0a0a0a',
                  border: '1px solid #262626',
                  borderRadius: 6,
                  padding: '0.4rem 0.8rem',
                  fontSize: '0.85rem',
                }}
              >
                {entries[0].modelName} vs {entries[2].modelName}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
