import { getBestModelScore } from '@/lib/store';
import { notFound } from 'next/navigation';
import { RadarChart } from '@/components/radar-chart';

export const dynamic = 'force-dynamic';

const DOMAIN_LABELS: Record<string, string> = {
  'full-text-search': 'Search',
  'ingest-indexing': 'Ingest',
  aggregations: 'Aggs',
  observability: 'Obs',
  'vector-search': 'Vector',
  security: 'Security',
};

const DIFF_COLORS: Record<string, string> = {
  beginner: '#22c55e',
  intermediate: '#3b82f6',
  advanced: '#a855f7',
  expert: '#ef4444',
};

export default async function ComparePage({
  params,
}: {
  params: Promise<{ models: string }>;
}) {
  const { models } = await params;
  const parts = decodeURIComponent(models).split('...');
  if (parts.length !== 2) {
    return (
      <div className="leaderboard-page">
        <h1>Compare Models</h1>
        <p className="subtitle">
          Use the URL format: /compare/modelA...modelB
        </p>
        <p style={{ color: '#737373', fontSize: '0.9rem' }}>
          Example: <code style={{ color: '#00bfae' }}>/compare/openrouter:openai/gpt-4o...openrouter:anthropic/claude-sonnet-4</code>
        </p>
      </div>
    );
  }

  const [idA, idB] = parts;
  const [scoreA, scoreB] = await Promise.all([
    getBestModelScore(idA),
    getBestModelScore(idB),
  ]);

  if (!scoreA || !scoreB) {
    const missing = !scoreA ? idA : idB;
    return (
      <div className="leaderboard-page">
        <h1>Model not found</h1>
        <p className="subtitle">No benchmark results for &quot;{missing}&quot;. Run the benchmark first.</p>
      </div>
    );
  }

  const challengesA = scoreA.challengeScores ?? [];
  const challengesB = scoreB.challengeScores ?? [];

  // Build challenge comparison
  const allChallengeIds = new Set([
    ...challengesA.map((c) => c.challengeId),
    ...challengesB.map((c) => c.challengeId),
  ]);

  const challengeMap = Array.from(allChallengeIds).map((id) => {
    const a = challengesA.find((c) => c.challengeId === id);
    const b = challengesB.find((c) => c.challengeId === id);
    return { id, a, b, title: a?.title ?? b?.title ?? id, domain: a?.domain ?? b?.domain ?? '', difficulty: a?.difficulty ?? b?.difficulty ?? '' };
  });

  // Stats comparison
  const stats = [
    { label: 'Overall Score', a: `${scoreA.percentage}%`, b: `${scoreB.percentage}%`, winA: scoreA.percentage > scoreB.percentage, winB: scoreB.percentage > scoreA.percentage },
    { label: 'Challenges Passed', a: `${scoreA.correctChallenges}/${scoreA.totalChallenges}`, b: `${scoreB.correctChallenges}/${scoreB.totalChallenges}`, winA: scoreA.correctChallenges > scoreB.correctChallenges, winB: scoreB.correctChallenges > scoreA.correctChallenges },
    { label: 'Avg Latency', a: `${scoreA.avgLatencyMs}ms`, b: `${scoreB.avgLatencyMs}ms`, winA: scoreA.avgLatencyMs < scoreB.avgLatencyMs, winB: scoreB.avgLatencyMs < scoreA.avgLatencyMs },
  ];

  // Who wins per domain
  const domainComparison = scoreA.domainScores.map((dsA) => {
    const dsB = scoreB.domainScores.find((d) => d.domain === dsA.domain);
    return {
      domain: dsA.domain,
      pctA: dsA.percentage,
      pctB: dsB?.percentage ?? 0,
    };
  });

  const nameA = scoreA.modelName;
  const nameB = scoreB.modelName;

  return (
    <div className="leaderboard-page">
      <div style={{ marginBottom: '0.5rem' }}>
        <a href="/leaderboard" style={{ color: '#00bfae', textDecoration: 'none', fontSize: '0.85rem' }}>
          &larr; Back to Leaderboard
        </a>
      </div>

      <h1 style={{ fontSize: '1.75rem' }}>
        {nameA} <span style={{ color: '#737373', fontWeight: 400 }}>vs</span> {nameB}
      </h1>

      {/* Overall stats comparison */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        gap: '0',
        margin: '2rem 0',
        background: '#141414',
        border: '1px solid #262626',
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '1rem', textAlign: 'center', borderBottom: '1px solid #262626', fontWeight: 600, color: '#00bfae' }}>{nameA}</div>
        <div style={{ padding: '1rem', textAlign: 'center', borderBottom: '1px solid #262626', color: '#737373' }}>vs</div>
        <div style={{ padding: '1rem', textAlign: 'center', borderBottom: '1px solid #262626', fontWeight: 600, color: '#a855f7' }}>{nameB}</div>

        {stats.map((s) => (
          <>
            <div key={`${s.label}-a`} style={{
              padding: '0.75rem 1rem',
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
              fontWeight: s.winA ? 700 : 400,
              color: s.winA ? '#22c55e' : '#e5e5e5',
              borderBottom: '1px solid #1a1a1a',
            }}>
              {s.a} {s.winA ? '◀' : ''}
            </div>
            <div key={`${s.label}-label`} style={{
              padding: '0.75rem 1rem',
              textAlign: 'center',
              color: '#737373',
              fontSize: '0.85rem',
              borderBottom: '1px solid #1a1a1a',
            }}>
              {s.label}
            </div>
            <div key={`${s.label}-b`} style={{
              padding: '0.75rem 1rem',
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
              fontWeight: s.winB ? 700 : 400,
              color: s.winB ? '#22c55e' : '#e5e5e5',
              borderBottom: '1px solid #1a1a1a',
            }}>
              {s.winB ? '▶' : ''} {s.b}
            </div>
          </>
        ))}
      </div>

      {/* Domain comparison bars */}
      <h2 style={{ fontSize: '1.15rem', marginBottom: '1rem' }}>Domain Breakdown</h2>
      <div style={{ marginBottom: '2.5rem' }}>
        {domainComparison.map(({ domain, pctA, pctB }) => (
          <div key={domain} style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.85rem' }}>
              <span style={{ fontFamily: 'var(--font-mono)', color: '#00bfae', fontWeight: pctA > pctB ? 700 : 400 }}>{pctA}%</span>
              <span style={{ color: '#737373' }}>{DOMAIN_LABELS[domain] ?? domain}</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: '#a855f7', fontWeight: pctB > pctA ? 700 : 400 }}>{pctB}%</span>
            </div>
            <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 }}>
              <div style={{
                width: `${pctA}%`,
                background: '#00bfae',
                borderRadius: '4px 0 0 4px',
              }} />
              <div style={{
                flex: 1,
                background: '#262626',
              }} />
              <div style={{
                width: `${pctB}%`,
                background: '#a855f7',
                borderRadius: '0 4px 4px 0',
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* Challenge-by-challenge comparison */}
      {challengeMap.length > 0 && (
        <>
          <h2 style={{ fontSize: '1.15rem', marginBottom: '1rem' }}>Challenge by Challenge</h2>
          <table className="lb-table">
            <thead>
              <tr>
                <th>Challenge</th>
                <th>Difficulty</th>
                <th style={{ textAlign: 'center', color: '#00bfae' }}>{nameA}</th>
                <th style={{ textAlign: 'center' }}></th>
                <th style={{ textAlign: 'center', color: '#a855f7' }}>{nameB}</th>
              </tr>
            </thead>
            <tbody>
              {challengeMap.map(({ id, a, b, title, difficulty }) => {
                const sA = a?.score ?? 0;
                const sB = b?.score ?? 0;
                const maxS = a?.maxScore ?? b?.maxScore ?? 100;
                return (
                  <tr key={id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{title}</div>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.75rem', color: DIFF_COLORS[difficulty] ?? '#737373', fontWeight: 600 }}>
                        {difficulty}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.85rem',
                        fontWeight: sA > sB ? 700 : 400,
                        color: a?.correct ? '#22c55e' : sA > 0 ? '#fbbf24' : '#ef4444',
                      }}>
                        {a ? `${sA}/${maxS}` : '—'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', color: '#525252', fontSize: '0.8rem' }}>
                      {sA > sB ? '◀' : sB > sA ? '▶' : '='}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.85rem',
                        fontWeight: sB > sA ? 700 : 400,
                        color: b?.correct ? '#22c55e' : sB > 0 ? '#fbbf24' : '#ef4444',
                      }}>
                        {b ? `${sB}/${maxS}` : '—'}
                      </span>
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
