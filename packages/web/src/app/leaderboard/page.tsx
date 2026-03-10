import { getLeaderboard } from '@/lib/store';
import type { LeaderboardEntry } from '@/lib/store';

const DOMAIN_LABELS: Record<string, string> = {
  'full-text-search': 'Search',
  'ingest-indexing': 'Ingest',
  aggregations: 'Aggs',
  observability: 'Obs',
  'vector-search': 'Vector',
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
              {entry.modelName}
              <span className="provider-tag">{entry.provider}</span>
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
        Best scores across {entries.length} model{entries.length !== 1 ? 's' : ''} on 31
        Elasticsearch challenges
      </p>
      <LeaderboardTable entries={entries} />
    </div>
  );
}
