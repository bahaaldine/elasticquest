import { getBestModelScore, getAllModelRuns } from '@/lib/store';
import type { ChallengeDetail } from '@/lib/store';
import { notFound } from 'next/navigation';
import { RadarChart } from '@/components/radar-chart';
import { DifficultyCurve } from '@/components/difficulty-curve';
import { computeBadges } from '@/components/badges-logic';
import { BadgeDisplay } from '@/components/badges';
import { ChallengeRow } from '@/components/eval-process';

export const dynamic = 'force-dynamic';

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

const API_BASE = 'https://elastic-quest-web-2t3s3mceqa-uc.a.run.app';

function ScoreBar({ score, maxScore }: { score: number; maxScore: number }) {
  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#fbbf24' : '#ef4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ width: 60, height: 6, borderRadius: 3, background: '#262626' }}>
        <div style={{ width: `${pct}%`, height: 6, borderRadius: 3, background: color }} />
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{score}/{maxScore}</span>
    </div>
  );
}

export default async function ModelCardPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const modelId = slug.join('/');
  const decoded = decodeURIComponent(modelId);

  const [score, allRuns] = await Promise.all([
    getBestModelScore(decoded),
    getAllModelRuns(decoded),
  ]);

  if (!score) notFound();

  const challenges = score.challengeScores ?? [];
  const passed = challenges.filter((c) => c.correct).length;
  const failed = challenges.filter((c) => !c.correct).length;

  // Group by domain
  const byDomain = new Map<string, ChallengeDetail[]>();
  for (const c of challenges) {
    const arr = byDomain.get(c.domain) ?? [];
    arr.push(c);
    byDomain.set(c.domain, arr);
  }

  // Consistently fails
  const failedChallenges = challenges.filter((c) => !c.correct);

  // Badge embed URL
  const badgeUrl = `${API_BASE}/api/badge/${encodeURIComponent(decoded)}`;
  const badgeMarkdown = `![ElasticQuest](${badgeUrl})`;

  return (
    <div className="leaderboard-page">
      <div style={{ marginBottom: '0.5rem' }}>
        <a href="/leaderboard" style={{ color: '#00bfae', textDecoration: 'none', fontSize: '0.85rem' }}>
          &larr; Back to Leaderboard
        </a>
      </div>

      <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        {score.modelName}
        <span className="provider-tag" style={{ fontSize: '0.85rem' }}>{score.provider}</span>
      </h1>

      {/* Badges */}
      <div style={{ marginBottom: '1.5rem' }}>
        <BadgeDisplay badges={computeBadges({
          domainScores: score.domainScores,
          overallPercentage: score.percentage,
          avgLatencyMs: score.avgLatencyMs,
          correctCount: passed,
          totalCount: challenges.length,
        })} />
      </div>

      {/* Summary stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem',
      }}>
        {[
          { label: 'Score', value: `${score.percentage}%`, sub: `${score.totalScore}/${score.maxPossibleScore}` },
          { label: 'Passed', value: `${passed}`, sub: `of ${challenges.length}` },
          { label: 'Failed', value: `${failed}`, sub: `of ${challenges.length}` },
          { label: 'Avg Latency', value: `${score.avgLatencyMs}ms`, sub: 'per challenge' },
          { label: 'Runs', value: `${allRuns.length}`, sub: 'total submissions' },
          ...(score.costUsd ? [{ label: 'Cost', value: `$${score.costUsd < 0.01 ? (score.costUsd * 100).toFixed(2) + 'c' : score.costUsd.toFixed(3)}`, sub: 'per run' }] : []),
        ].map((s) => (
          <div key={s.label} style={{
            background: '#141414',
            border: '1px solid #262626',
            borderRadius: 8,
            padding: '1rem',
          }}>
            <div style={{ color: '#737373', fontSize: '0.8rem', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{s.value}</div>
            <div style={{ color: '#737373', fontSize: '0.75rem' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts side by side */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '2rem',
        marginBottom: '2.5rem',
      }}>
        <div style={{ background: '#141414', border: '1px solid #262626', borderRadius: 12, padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: '#a3a3a3' }}>Domain Strengths</h3>
          <RadarChart
            data={score.domainScores.map((ds) => ({
              label: (DOMAIN_LABELS[ds.domain] ?? ds.domain).replace(' / SIEM', ''),
              value: ds.percentage,
            }))}
            size={320}
          />
        </div>
        <div style={{ background: '#141414', border: '1px solid #262626', borderRadius: 12, padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: '#a3a3a3' }}>Difficulty Curve</h3>
          <DifficultyCurve
            data={score.difficultyScores.map((ds) => ({
              difficulty: ds.difficulty,
              percentage: ds.percentage,
              count: ds.challengeCount,
            }))}
            width={440}
            height={220}
          />
        </div>
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
            <div key={ds.domain} style={{ background: '#141414', border: '1px solid #262626', borderRadius: 8, padding: '0.75rem 1rem' }}>
              <div style={{ fontSize: '0.85rem', marginBottom: 4 }}>{DOMAIN_LABELS[ds.domain] ?? ds.domain}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#262626' }}>
                  <div style={{ width: `${pct}%`, height: 6, borderRadius: 3, background: color }} />
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 600 }}>{pct}%</span>
              </div>
              <div style={{ color: '#737373', fontSize: '0.75rem', marginTop: 4 }}>{ds.correctCount}/{ds.challengeCount} passed</div>
            </div>
          );
        })}
      </div>

      {/* Consistently fails */}
      {failedChallenges.length > 0 && (
        <>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#ef4444' }}>
            Failed Challenges ({failedChallenges.length})
          </h2>
          <table className="lb-table" style={{ marginBottom: '2rem' }}>
            <thead>
              <tr><th></th><th>Challenge</th><th>Difficulty</th><th>Score</th><th>Feedback</th></tr>
            </thead>
            <tbody>
              {failedChallenges.map((c) => (
                <ChallengeRow key={c.challengeId} challenge={c} colCount={5}>
                  <td style={{ color: '#ef4444' }}>&#10007;</td>
                  <td style={{ fontWeight: 600 }}>{c.title}</td>
                  <td><span style={{ fontSize: '0.75rem', color: DIFF_COLORS[c.difficulty], fontWeight: 600 }}>{c.difficulty}</span></td>
                  <td><ScoreBar score={c.score} maxScore={c.maxScore} /></td>
                  <td style={{ fontSize: '0.8rem', color: '#ef4444', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.feedback}</td>
                </ChallengeRow>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* All challenges */}
      {challenges.length > 0 && (
        <>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>All Challenges</h2>
          {Array.from(byDomain.entries()).map(([domain, domainChallenges]) => (
            <div key={domain} style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1rem', color: '#00bfae', marginBottom: '0.75rem' }}>{DOMAIN_LABELS[domain] ?? domain}</h3>
              <table className="lb-table">
                <thead><tr><th style={{ width: 30 }}></th><th>Challenge</th><th>Difficulty</th><th>Score</th><th>Latency</th><th>Feedback</th></tr></thead>
                <tbody>
                  {domainChallenges.map((c) => (
                    <ChallengeRow key={c.challengeId} challenge={c} colCount={6}>
                      <td><span style={{ fontSize: '1.1rem' }}>{c.correct ? '\u2713' : '\u2717'}</span></td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{c.title}</div>
                        <div style={{ fontSize: '0.8rem', color: '#737373' }}>{c.challengeId}</div>
                      </td>
                      <td><span style={{ fontSize: '0.75rem', fontWeight: 600, color: DIFF_COLORS[c.difficulty] ?? '#737373' }}>{c.difficulty}</span></td>
                      <td><ScoreBar score={c.score} maxScore={c.maxScore} /></td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#737373' }}>{c.latencyMs}ms</td>
                      <td style={{ maxWidth: 300, fontSize: '0.8rem', color: c.correct ? '#737373' : '#ef4444', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.feedback}</td>
                    </ChallengeRow>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}

      {/* Run history */}
      {allRuns.length > 1 && (
        <>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Run History</h2>
          <table className="lb-table" style={{ marginBottom: '2rem' }}>
            <thead><tr><th>Date</th><th>Score</th><th>Passed</th><th>Latency</th><th>Cost</th></tr></thead>
            <tbody>
              {allRuns.map((run, i) => (
                <tr key={i}>
                  <td style={{ fontSize: '0.85rem' }}>{run.submittedAt ? new Date(run.submittedAt).toLocaleString() : '—'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{run.percentage}%</td>
                  <td>{run.correctChallenges}/{run.totalChallenges}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{run.avgLatencyMs}ms</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#fbbf24' }}>{run.costUsd ? `$${run.costUsd.toFixed(4)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Embed badge */}
      <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Embed Badge</h2>
      <div style={{ background: '#141414', border: '1px solid #262626', borderRadius: 12, padding: '1.5rem', marginBottom: '2rem' }}>
        <p style={{ color: '#a3a3a3', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Add this badge to your README or documentation:
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={badgeUrl} alt="ElasticQuest badge" style={{ marginBottom: '1rem' }} />
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ color: '#737373', fontSize: '0.75rem', marginBottom: 4 }}>Markdown:</div>
          <code style={{ display: 'block', background: '#0a0a0a', border: '1px solid #262626', borderRadius: 6, padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: '#00bfae', wordBreak: 'break-all' }}>
            {badgeMarkdown}
          </code>
        </div>
        <div>
          <div style={{ color: '#737373', fontSize: '0.75rem', marginBottom: 4 }}>HTML:</div>
          <code style={{ display: 'block', background: '#0a0a0a', border: '1px solid #262626', borderRadius: 6, padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: '#00bfae', wordBreak: 'break-all' }}>
            {`<img src="${badgeUrl}" alt="ElasticQuest score" />`}
          </code>
        </div>
      </div>
    </div>
  );
}
