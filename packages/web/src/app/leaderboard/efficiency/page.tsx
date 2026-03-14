import { getLeaderboard } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function EfficiencyPage() {
  const entries = await getLeaderboard();

  // Only show models with cost data, sorted by score per dollar
  const withCost = entries
    .filter((e) => e.costUsd && e.costUsd > 0)
    .sort((a, b) => (b.scorePerDollar ?? 0) - (a.scorePerDollar ?? 0));

  return (
    <div className="leaderboard-page">
      <h1>Cost Efficiency Leaderboard</h1>
      <p className="subtitle">
        Best score per dollar — which models give you the most Elasticsearch expertise for your money?
      </p>

      {/* Tab navigation */}
      <div className="tab-nav">
        <a href="/leaderboard" className="tab">By Score</a>
        <a href="/leaderboard/efficiency" className="tab tab-active">By Efficiency</a>
        <a href="/leaderboard/scenarios" className="tab">Scenarios</a>
      </div>

      {withCost.length === 0 ? (
        <div className="empty-state">
          <p>No cost data available yet.</p>
          <p style={{ color: '#737373', fontSize: '0.85rem', marginTop: '0.5rem' }}>
            Cost tracking requires benchmarking via OpenRouter. Run:
          </p>
          <code>npx elastic-quest benchmark --pick</code>
        </div>
      ) : (
        <table className="lb-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Model</th>
              <th>Score</th>
              <th>Cost</th>
              <th>Score / $</th>
              <th>Tokens</th>
            </tr>
          </thead>
          <tbody>
            {withCost.map((entry, i) => {
              const costStr = entry.costUsd! < 0.01
                ? `$${(entry.costUsd! * 100).toFixed(2)}c`
                : `$${entry.costUsd!.toFixed(3)}`;
              return (
                <tr key={entry.modelId}>
                  <td className="rank-col">{i + 1}</td>
                  <td className="model-col">
                    <a
                      href={`/models/${encodeURIComponent(entry.modelId)}`}
                      style={{ color: 'inherit', textDecoration: 'none' }}
                    >
                      {entry.modelName}
                      <span className="provider-tag">{entry.provider}</span>
                    </a>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{entry.percentage}%</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: '#fbbf24' }}>{costStr}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#22c55e' }}>
                    {entry.scorePerDollar?.toLocaleString()}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#737373' }}>
                    {((entry.totalScore / entry.percentage * 100) > 0 ? '' : '—')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: '2rem', padding: '1rem', background: '#141414', border: '1px solid #262626', borderRadius: 8, fontSize: '0.85rem', color: '#737373' }}>
        <strong style={{ color: '#e5e5e5' }}>How is cost calculated?</strong>
        <br />
        Cost = (input tokens x prompt price) + (output tokens x completion price).
        Pricing is fetched from the OpenRouter API at benchmark time.
        Score per dollar = overall percentage / cost in USD.
      </div>
    </div>
  );
}
