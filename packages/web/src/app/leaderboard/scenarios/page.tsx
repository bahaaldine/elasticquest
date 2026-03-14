import { getScenarioLeaderboard } from '@/lib/store';
import type { ScenarioLeaderboardEntry } from '@/lib/store';

const DOMAIN_LABELS: Record<string, string> = {
  'full-text-search': 'Search',
  'ingest-indexing': 'Ingest',
  aggregations: 'Aggs',
  observability: 'Obs',
  'vector-search': 'Vector',
  security: 'Security',
  esql: 'ES|QL',
};

function UpliftBadge({ uplift }: { uplift?: number }) {
  if (uplift === undefined) return <span style={{ color: '#737373', fontSize: '0.8rem' }}>--</span>;
  const cls = uplift > 0
    ? 'skill-uplift skill-uplift-positive'
    : uplift < 0
      ? 'skill-uplift skill-uplift-negative'
      : 'skill-uplift skill-uplift-neutral';
  return (
    <span className={cls}>
      {uplift > 0 ? '+' : ''}{uplift}%
    </span>
  );
}

export const dynamic = 'force-dynamic';

export default async function ScenariosLeaderboardPage() {
  const entries = await getScenarioLeaderboard();

  return (
    <div className="leaderboard-page">
      <h1>Scenario Leaderboard</h1>
      <p className="subtitle">
        Skill-aligned scenarios: ES|QL, log investigation, and security triage.
        {' '}Compare baseline vs skill-augmented performance.
      </p>

      {/* Tabs */}
      <div className="tab-nav">
        <a href="/leaderboard" className="tab">By Score</a>
        <a href="/leaderboard/efficiency" className="tab">By Efficiency</a>
        <a href="/leaderboard/scenarios" className="tab tab-active">Scenarios</a>
      </div>

      {/* Info box */}
      <div style={{
        background: '#141414', border: '1px solid #262626', borderRadius: 12,
        padding: '1.25rem', marginBottom: '2rem',
      }}>
        <h3 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>
          How Scenario Scoring Works
        </h3>
        <p style={{ color: '#a3a3a3', fontSize: '0.85rem', lineHeight: 1.6 }}>
          Each model runs 12 skill-aligned scenarios against real Elasticsearch (via Docker or Cloud).
          With <code style={{ color: '#00bfae' }}>--compare-skills</code>, each scenario runs twice:
          once <strong>baseline</strong> (no skill context) and once with the{' '}
          <a href="https://github.com/elastic/agent-skills" target="_blank" rel="noopener noreferrer" style={{ color: '#00bfae' }}>
            Elastic Agent Skill
          </a> injected into the prompt. The <strong>Skill Uplift</strong> column shows how much the
          skill improved (or hurt) performance.
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="empty-state">
          <p>No scenario results yet. Run scenarios with:</p>
          <code>npx elastic-quest benchmark --scenarios --start-local --compare-skills -m openrouter:openai/gpt-4o</code>
        </div>
      ) : (
        <>
          {/* Card grid for models with uplift data */}
          <div className="model-grid">
            {entries.map((entry) => {
              const hasUplift = entry.skillUplift !== undefined;
              return (
                <div
                  key={entry.modelId}
                  className="model-card"
                  style={{ cursor: 'default' }}
                >
                  {/* Header */}
                  <div className="model-card-header">
                    <div style={{ minWidth: 0 }}>
                      <div className="model-card-name">{entry.modelName}</div>
                      <span className="provider-tag">{entry.provider}</span>
                    </div>
                    {entry.skillsEnabled !== undefined && (
                      <span style={{
                        fontSize: '0.65rem',
                        padding: '0.15rem 0.5rem',
                        borderRadius: 4,
                        fontWeight: 700,
                        background: entry.skillsEnabled ? 'rgba(168, 85, 247, 0.15)' : 'rgba(0, 191, 174, 0.15)',
                        color: entry.skillsEnabled ? '#a855f7' : '#00bfae',
                      }}>
                        {entry.skillsEnabled ? 'WITH SKILLS' : 'BASELINE'}
                      </span>
                    )}
                  </div>

                  {/* Comparison bars */}
                  {hasUplift ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 2 }}>
                          <span style={{ color: '#737373' }}>Baseline</span>
                          <span style={{ fontFamily: 'var(--font-mono)', color: '#00bfae' }}>{entry.baselinePercentage}%</span>
                        </div>
                        <div className="model-card-bar">
                          <div className="model-card-bar-fill" style={{ width: `${entry.baselinePercentage}%`, background: '#00bfae' }} />
                        </div>
                      </div>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 2 }}>
                          <span style={{ color: '#737373' }}>With Skills</span>
                          <span style={{ fontFamily: 'var(--font-mono)', color: '#a855f7' }}>{entry.skillsPercentage}%</span>
                        </div>
                        <div className="model-card-bar">
                          <div className="model-card-bar-fill" style={{ width: `${entry.skillsPercentage}%`, background: '#a855f7' }} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="model-card-bar">
                      <div className="model-card-bar-fill" style={{ width: `${entry.percentage}%`, background: '#00bfae' }} />
                    </div>
                  )}

                  {/* Stats */}
                  <div className="model-card-stats">
                    <div className="model-card-stat">
                      <span className="model-card-stat-label">Best Score</span>
                      <span className="model-card-stat-value">{entry.percentage}%</span>
                    </div>
                    <div className="model-card-stat">
                      <span className="model-card-stat-label">Passed</span>
                      <span className="model-card-stat-value">{entry.correct}/{entry.total}</span>
                    </div>
                    <div className="model-card-stat">
                      <span className="model-card-stat-label">Skill Uplift</span>
                      <UpliftBadge uplift={entry.skillUplift} />
                    </div>
                    <div className="model-card-stat">
                      <span className="model-card-stat-label">Latency</span>
                      <span className="model-card-stat-value">{entry.avgLatencyMs}ms</span>
                    </div>
                  </div>

                  {/* Domain chips */}
                  <div className="model-card-domains">
                    {Object.entries(entry.domainScores).map(([domain, pct]) => (
                      <span key={domain} className="domain-chip">
                        {DOMAIN_LABELS[domain] ?? domain} {pct}%
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary table */}
          <div style={{ marginTop: '2rem' }}>
            <h2 style={{ fontSize: '1.15rem', marginBottom: '1rem' }}>Detailed Results</h2>
            <table className="lb-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Model</th>
                  <th>Baseline</th>
                  <th>With Skills</th>
                  <th>Uplift</th>
                  <th>Domains</th>
                  <th>Latency</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.modelId}>
                    <td className={`rank-col ${entry.rank <= 3 ? `rank-${entry.rank}` : ''}`}>
                      {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : entry.rank}
                    </td>
                    <td className="model-col">
                      {entry.modelName}
                      <span className="provider-tag">{entry.provider}</span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {entry.baselinePercentage !== undefined ? `${entry.baselinePercentage}%` : '--'}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#a855f7' }}>
                      {entry.skillsPercentage !== undefined ? `${entry.skillsPercentage}%` : '--'}
                    </td>
                    <td><UpliftBadge uplift={entry.skillUplift} /></td>
                    <td>
                      <div className="domain-scores">
                        {Object.entries(entry.domainScores).map(([domain, pct]) => (
                          <span key={domain} className="domain-chip">
                            {DOMAIN_LABELS[domain] ?? domain} {pct}%
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{entry.avgLatencyMs}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
