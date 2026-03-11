import { getBestModelScore } from '@/lib/store';
import type { ChallengeDetail } from '@/lib/store';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

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

function ScoreBar({ score, maxScore }: { score: number; maxScore: number }) {
  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#fbbf24' : '#ef4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ width: 60, height: 6, borderRadius: 3, background: '#262626' }}>
        <div style={{ width: `${pct}%`, height: 6, borderRadius: 3, background: color }} />
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
        {score}/{maxScore}
      </span>
    </div>
  );
}

function ChallengeRow({ c }: { c: ChallengeDetail }) {
  return (
    <tr>
      <td style={{ width: 30 }}>
        <span style={{ fontSize: '1.1rem' }}>{c.correct ? '✓' : '✗'}</span>
      </td>
      <td>
        <div style={{ fontWeight: 600 }}>{c.title}</div>
        <div style={{ fontSize: '0.8rem', color: '#737373', marginTop: 2 }}>
          {c.challengeId}
        </div>
      </td>
      <td>
        <span className="domain-chip">
          {DOMAIN_LABELS[c.domain] ?? c.domain}
        </span>
      </td>
      <td>
        <span style={{
          fontSize: '0.75rem',
          fontWeight: 600,
          color: DIFF_COLORS[c.difficulty] ?? '#737373',
        }}>
          {c.difficulty}
        </span>
      </td>
      <td><ScoreBar score={c.score} maxScore={c.maxScore} /></td>
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#737373' }}>
        {c.latencyMs}ms
      </td>
      <td style={{ maxWidth: 300 }}>
        <div style={{
          fontSize: '0.8rem',
          color: c.correct ? '#737373' : '#ef4444',
          lineHeight: 1.4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {c.feedback}
        </div>
      </td>
    </tr>
  );
}

export default async function ModelDetailPage({
  params,
}: {
  params: Promise<{ modelId: string }>;
}) {
  const { modelId } = await params;
  const decoded = decodeURIComponent(modelId);
  const score = await getBestModelScore(decoded);

  if (!score) {
    notFound();
  }

  const challenges = score.challengeScores ?? [];

  // Group by domain
  const byDomain = new Map<string, ChallengeDetail[]>();
  for (const c of challenges) {
    const arr = byDomain.get(c.domain) ?? [];
    arr.push(c);
    byDomain.set(c.domain, arr);
  }

  const passed = challenges.filter((c) => c.correct).length;
  const failed = challenges.filter((c) => !c.correct).length;

  return (
    <div className="leaderboard-page">
      <div style={{ marginBottom: '0.5rem' }}>
        <a href="/leaderboard" style={{ color: '#00bfae', textDecoration: 'none', fontSize: '0.85rem' }}>
          &larr; Back to Leaderboard
        </a>
      </div>

      <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {score.modelName}
        <span className="provider-tag" style={{ fontSize: '0.85rem' }}>{score.provider}</span>
      </h1>

      {/* Summary stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '1rem',
        margin: '1.5rem 0 2rem',
      }}>
        {[
          { label: 'Score', value: `${score.percentage}%`, sub: `${score.totalScore}/${score.maxPossibleScore}` },
          { label: 'Passed', value: `${passed}`, sub: `of ${challenges.length}` },
          { label: 'Failed', value: `${failed}`, sub: `of ${challenges.length}` },
          { label: 'Avg Latency', value: `${score.avgLatencyMs}ms`, sub: 'per challenge' },
        ].map((s) => (
          <div key={s.label} style={{
            background: '#141414',
            border: '1px solid #262626',
            borderRadius: 8,
            padding: '1rem',
          }}>
            <div style={{ color: '#737373', fontSize: '0.8rem', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{s.value}</div>
            <div style={{ color: '#737373', fontSize: '0.75rem' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Domain breakdown */}
      <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>By Domain</h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '0.75rem',
        marginBottom: '2rem',
      }}>
        {score.domainScores.map((ds) => {
          const pct = ds.percentage;
          const color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#fbbf24' : '#ef4444';
          return (
            <div key={ds.domain} style={{
              background: '#141414',
              border: '1px solid #262626',
              borderRadius: 8,
              padding: '0.75rem 1rem',
            }}>
              <div style={{ fontSize: '0.85rem', marginBottom: 4 }}>
                {DOMAIN_LABELS[ds.domain] ?? ds.domain}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#262626' }}>
                  <div style={{ width: `${pct}%`, height: 6, borderRadius: 3, background: color }} />
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 600 }}>
                  {pct}%
                </span>
              </div>
              <div style={{ color: '#737373', fontSize: '0.75rem', marginTop: 4 }}>
                {ds.correctCount}/{ds.challengeCount} passed
              </div>
            </div>
          );
        })}
      </div>

      {/* Per-challenge breakdown */}
      <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>All Challenges</h2>

      {challenges.length === 0 ? (
        <div className="empty-state">
          <p>No per-challenge details available for this run.</p>
          <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
            Re-run the benchmark with the latest CLI version to get detailed results.
          </p>
        </div>
      ) : (
        <>
          {Array.from(byDomain.entries()).map(([domain, domainChallenges]) => (
            <div key={domain} style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1rem', color: '#00bfae', marginBottom: '0.75rem' }}>
                {DOMAIN_LABELS[domain] ?? domain}
              </h3>
              <table className="lb-table">
                <thead>
                  <tr>
                    <th style={{ width: 30 }}></th>
                    <th>Challenge</th>
                    <th>Domain</th>
                    <th>Difficulty</th>
                    <th>Score</th>
                    <th>Latency</th>
                    <th>Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {domainChallenges.map((c) => (
                    <ChallengeRow key={c.challengeId} c={c} />
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
