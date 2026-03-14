'use client';

import { useEffect, useState } from 'react';

interface LeaderboardEntry {
  rank: number;
  modelId: string;
  modelName: string;
  provider: string;
  totalScore: number;
  maxScore: number;
  percentage: number;
  correct: number;
  total: number;
  avgLatencyMs: number;
  domainScores: Record<string, number>;
  submittedAt: string;
  runCount: number;
  costUsd?: number;
  scorePerDollar?: number;
}

type Grade = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

function computeGrade(percentage: number): Grade {
  if (percentage >= 95) return 'S';
  if (percentage >= 80) return 'A';
  if (percentage >= 65) return 'B';
  if (percentage >= 50) return 'C';
  if (percentage >= 30) return 'D';
  return 'F';
}

const GRADE_COLORS: Record<Grade, string> = {
  S: '#facc15',
  A: '#22c55e',
  B: '#3b82f6',
  C: '#f97316',
  D: '#a855f7',
  F: '#ef4444',
};

const DOMAIN_LABELS: Record<string, string> = {
  'full-text-search': 'Search',
  'ingest-indexing': 'Ingest',
  aggregations: 'Aggs',
  observability: 'Obs',
  'vector-search': 'Vector',
  security: 'Security',
  esql: 'ES|QL',
};

type SortOption = 'score' | 'latency' | 'pass-rate' | 'newest';
type ViewMode = 'grid' | 'list';

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState<Grade | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('score');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  useEffect(() => {
    fetch('/api/leaderboard')
      .then((r) => r.json())
      .then((data) => {
        setEntries(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = entries.filter((e) => {
    if (search) {
      const q = search.toLowerCase();
      if (
        !e.modelName.toLowerCase().includes(q) &&
        !e.provider.toLowerCase().includes(q) &&
        !e.modelId.toLowerCase().includes(q)
      )
        return false;
    }
    if (gradeFilter && computeGrade(e.percentage) !== gradeFilter) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'latency':
        return a.avgLatencyMs - b.avgLatencyMs;
      case 'pass-rate':
        return b.correct / b.total - a.correct / a.total;
      case 'newest':
        return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
      default:
        return b.percentage - a.percentage || a.avgLatencyMs - b.avgLatencyMs;
    }
  });

  // Grade distribution
  const gradeCounts: Record<Grade, number> = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const e of entries) {
    gradeCounts[computeGrade(e.percentage)]++;
  }

  return (
    <div className="leaderboard-page">
      <h1>Model Leaderboard</h1>
      <p className="subtitle">
        Best scores across {entries.length} model{entries.length !== 1 ? 's' : ''}
      </p>

      {/* Tabs */}
      <div className="tab-nav">
        <a href="/leaderboard" className="tab tab-active">By Score</a>
        <a href="/leaderboard/efficiency" className="tab">By Efficiency</a>
        <a href="/leaderboard/scenarios" className="tab">Scenarios</a>
      </div>

      {/* Grade summary */}
      <div className="grade-summary">
        {(['S', 'A', 'B', 'C', 'D', 'F'] as Grade[]).map((g) => (
          <span
            key={g}
            className={`grade-pill ${gradeFilter === g ? 'grade-pill-active' : ''}`}
            onClick={() => setGradeFilter(gradeFilter === g ? null : g)}
          >
            <span className="grade-pill-letter" style={{ color: GRADE_COLORS[g] }}>{g}</span>
            <span className="grade-pill-count">{gradeCounts[g]}</span>
          </span>
        ))}
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <input
          type="text"
          placeholder="Search models..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="filter-input"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          className="filter-select"
        >
          <option value="score">Sort: Score</option>
          <option value="latency">Sort: Fastest</option>
          <option value="pass-rate">Sort: Pass Rate</option>
          <option value="newest">Sort: Newest</option>
        </select>

        <div className="view-toggle">
          <button
            className={`view-toggle-btn ${viewMode === 'grid' ? 'view-toggle-active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Grid view"
          >&#9638;</button>
          <button
            className={`view-toggle-btn ${viewMode === 'list' ? 'view-toggle-active' : ''}`}
            onClick={() => setViewMode('list')}
            title="List view"
          >&#9776;</button>
        </div>

        <span className="filter-count">
          {sorted.length} model{sorted.length !== 1 ? 's' : ''}
        </span>
      </div>

      {loading ? (
        <div className="empty-state">Loading...</div>
      ) : sorted.length === 0 ? (
        <div className="empty-state">
          <p>No benchmark results yet. Be the first!</p>
          <code>npx elastic-quest benchmark --pick</code>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="model-grid">
          {sorted.map((entry) => {
            const grade = computeGrade(entry.percentage);
            const gradeColor = GRADE_COLORS[grade];
            return (
              <a
                key={entry.modelId}
                href={`/models/${encodeURIComponent(entry.modelId)}`}
                className="model-card"
              >
                <div className="model-card-header">
                  <div style={{ minWidth: 0 }}>
                    <div className="model-card-name">{entry.modelName}</div>
                    <span className="provider-tag">{entry.provider}</span>
                  </div>
                  <div
                    className="model-card-grade"
                    style={{
                      background: `${gradeColor}15`,
                      color: gradeColor,
                      border: `2px solid ${gradeColor}40`,
                    }}
                  >
                    {grade}
                  </div>
                </div>

                <div className="model-card-bar">
                  <div
                    className="model-card-bar-fill"
                    style={{ width: `${entry.percentage}%`, background: gradeColor }}
                  />
                </div>

                <div className="model-card-stats">
                  <div className="model-card-stat">
                    <span className="model-card-stat-label">Score</span>
                    <span className="model-card-stat-value">{entry.percentage}%</span>
                  </div>
                  <div className="model-card-stat">
                    <span className="model-card-stat-label">Passed</span>
                    <span className="model-card-stat-value">{entry.correct}/{entry.total}</span>
                  </div>
                  <div className="model-card-stat">
                    <span className="model-card-stat-label">Latency</span>
                    <span className="model-card-stat-value">{entry.avgLatencyMs}ms</span>
                  </div>
                  {entry.costUsd !== undefined && (
                    <div className="model-card-stat">
                      <span className="model-card-stat-label">Cost</span>
                      <span className="model-card-stat-value" style={{ color: '#fbbf24' }}>
                        ${entry.costUsd < 0.01
                          ? (entry.costUsd * 100).toFixed(1) + 'c'
                          : entry.costUsd.toFixed(3)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="model-card-domains">
                  {Object.entries(entry.domainScores).map(([domain, pct]) => (
                    <span key={domain} className="domain-chip">
                      {DOMAIN_LABELS[domain] ?? domain} {pct}%
                    </span>
                  ))}
                </div>
              </a>
            );
          })}
        </div>
      ) : (
        <table className="lb-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Model</th>
              <th>Grade</th>
              <th>Score</th>
              <th>Pass Rate</th>
              <th>Domains</th>
              <th>Latency</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((entry, i) => {
              const grade = computeGrade(entry.percentage);
              const gradeColor = GRADE_COLORS[grade];
              return (
                <tr key={entry.modelId}>
                  <td className={`rank-col ${i < 3 ? `rank-${i + 1}` : ''}`}>
                    {i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}
                  </td>
                  <td className="model-col">
                    <a href={`/models/${encodeURIComponent(entry.modelId)}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                      {entry.modelName}
                      <span className="provider-tag">{entry.provider}</span>
                    </a>
                  </td>
                  <td>
                    <span style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', color: gradeColor }}>{grade}</span>
                  </td>
                  <td className="score-col">
                    <span className="pct-track">
                      <span className="pct-bar" style={{ width: `${entry.percentage}%`, background: gradeColor }} />
                    </span>
                    {entry.percentage}%
                  </td>
                  <td>{entry.correct}/{entry.total}</td>
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
              );
            })}
          </tbody>
        </table>
      )}

      {entries.length >= 2 && (
        <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#141414', border: '1px solid #262626', borderRadius: 12 }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Compare Models</h3>
          <p style={{ color: '#737373', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
            Head-to-head comparison with challenge-by-challenge breakdown:
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <a href={`/compare/${encodeURIComponent(entries[0].modelId)}...${encodeURIComponent(entries[1].modelId)}`}
              style={{ color: '#00bfae', textDecoration: 'none', background: '#0a0a0a', border: '1px solid #262626', borderRadius: 6, padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
              {entries[0].modelName} vs {entries[1].modelName}
            </a>
            {entries.length >= 3 && (
              <a href={`/compare/${encodeURIComponent(entries[0].modelId)}...${encodeURIComponent(entries[2].modelId)}`}
                style={{ color: '#00bfae', textDecoration: 'none', background: '#0a0a0a', border: '1px solid #262626', borderRadius: 6, padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
                {entries[0].modelName} vs {entries[2].modelName}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
