'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

// --- Types ---

interface Highlights {
  empty: boolean;
  totalModels: number;
  totalRuns: number;
  avgScore: number;
  champion: {
    modelName: string; provider: string; percentage: number;
    correct: number; total: number; avgLatencyMs: number;
    domainScores: Record<string, number>; modelId: string;
  };
  podium: Array<{ modelName: string; provider: string; percentage: number; modelId: string }>;
  domainChampions: Array<{ domain: string; modelName: string; provider: string; score: number }>;
  speedDemon: { modelName: string; provider: string; avgLatencyMs: number; percentage: number } | null;
  bestValue: { modelName: string; provider: string; costUsd: number; scorePerDollar: number; percentage: number } | null;
  hardestChallenge: { id: string; passRate: number; total: number } | null;
  easiestChallenge: { id: string; passRate: number; total: number } | null;
  biggestUplift: { modelName: string; provider: string; uplift: number; baseline: number; withSkills: number } | null;
  gradeDistribution: Record<string, number>;
  providerCounts: Record<string, number>;
  scenarioCount: number;
}

const GRADE_COLORS: Record<string, string> = {
  S: '#facc15', A: '#22c55e', B: '#3b82f6', C: '#f97316', D: '#a855f7', F: '#ef4444',
};

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

// --- Hooks ---

function useInView(threshold = 0.3) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return { ref, visible };
}

function AnimatedCounter({ target, duration = 2000, prefix = '', suffix = '' }: {
  target: number; duration?: number; prefix?: string; suffix?: string;
}) {
  const [count, setCount] = useState(0);
  const { ref, visible } = useInView();

  useEffect(() => {
    if (!visible) return;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setCount(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [visible, target, duration]);

  return (
    <span ref={ref} className="hl-counter">
      {prefix}{count.toLocaleString()}{suffix}
    </span>
  );
}

// --- Slide Components ---

function SlideTitle() {
  return (
    <section className="hl-slide hl-slide-title">
      <div className="hl-slide-inner">
        <div className="hl-title-badge">ElasticQuest</div>
        <h1 className="hl-title">Leaderboard<br/>Highlights</h1>
        <p className="hl-subtitle">The story behind the scores</p>
        <div className="hl-scroll-hint">
          <span>Scroll to explore</span>
          <div className="hl-scroll-arrow" />
        </div>
      </div>
    </section>
  );
}

function SlideNumbers({ data }: { data: Highlights }) {
  const { ref, visible } = useInView();
  return (
    <section className="hl-slide" ref={ref}>
      <div className={`hl-slide-inner ${visible ? 'hl-visible' : ''}`}>
        <div className="hl-label">The Numbers</div>
        <div className="hl-numbers-grid">
          <div className="hl-number-card">
            <AnimatedCounter target={data.totalModels} />
            <div className="hl-number-label">Models Tested</div>
          </div>
          <div className="hl-number-card">
            <AnimatedCounter target={data.totalRuns} />
            <div className="hl-number-label">Benchmark Runs</div>
          </div>
          <div className="hl-number-card">
            <AnimatedCounter target={data.avgScore} suffix="%" />
            <div className="hl-number-label">Average Score</div>
          </div>
          <div className="hl-number-card">
            <AnimatedCounter target={data.scenarioCount} />
            <div className="hl-number-label">Scenario Results</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SlideChampion({ data }: { data: Highlights }) {
  const { ref, visible } = useInView();
  const c = data.champion;
  return (
    <section className="hl-slide hl-slide-accent" ref={ref}>
      <div className={`hl-slide-inner ${visible ? 'hl-visible' : ''}`}>
        <div className="hl-label">The Champion</div>
        <div className="hl-champion-name">{c.modelName}</div>
        <div className="hl-champion-provider">{c.provider}</div>
        <div className="hl-champion-score">
          <AnimatedCounter target={c.percentage} suffix="%" duration={1500} />
        </div>
        <div className="hl-champion-detail">
          {c.correct}/{c.total} challenges passed &middot; {c.avgLatencyMs}ms avg
        </div>
        {/* Domain radar as bars */}
        <div className="hl-domain-bars">
          {Object.entries(c.domainScores).map(([domain, pct]) => (
            <div key={domain} className="hl-domain-bar-row">
              <span className="hl-domain-bar-label">{DOMAIN_LABELS[domain] ?? domain}</span>
              <div className="hl-domain-bar-track">
                <div
                  className="hl-domain-bar-fill"
                  style={{
                    width: visible ? `${pct}%` : '0%',
                    transitionDelay: `${Object.keys(c.domainScores).indexOf(domain) * 0.1}s`,
                  }}
                />
              </div>
              <span className="hl-domain-bar-value">{pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SlidePodium({ data }: { data: Highlights }) {
  const { ref, visible } = useInView();
  const medals = ['🥇', '🥈', '🥉'];
  const barColors = ['#facc15', '#c0c0c0', '#cd7f32'];
  return (
    <section className="hl-slide" ref={ref}>
      <div className={`hl-slide-inner ${visible ? 'hl-visible' : ''}`}>
        <div className="hl-label">The Podium</div>
        <div className="hl-podium">
          {data.podium.map((m, i) => (
            <div key={m.modelId} className="hl-podium-entry">
              <div className="hl-podium-medal">{medals[i]}</div>
              <div className="hl-podium-bar-container">
                <div
                  className="hl-podium-bar"
                  style={{
                    height: visible ? `${(m.percentage / 100) * 200}px` : '0px',
                    background: barColors[i],
                    transitionDelay: `${i * 0.2}s`,
                  }}
                />
              </div>
              <div className="hl-podium-score">{m.percentage}%</div>
              <div className="hl-podium-name">{m.modelName}</div>
              <div className="hl-podium-provider">{m.provider}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SlideDomainChampions({ data }: { data: Highlights }) {
  const { ref, visible } = useInView(0.2);
  return (
    <section className="hl-slide" ref={ref}>
      <div className={`hl-slide-inner ${visible ? 'hl-visible' : ''}`}>
        <div className="hl-label">Domain Champions</div>
        <p className="hl-subtitle" style={{ marginBottom: '2rem' }}>Best model in each domain</p>
        <div className="hl-domain-champs-grid">
          {data.domainChampions.map((dc, i) => (
            <div
              key={dc.domain}
              className={`hl-domain-champ-card ${visible ? 'hl-visible' : ''}`}
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="hl-domain-champ-domain">{DOMAIN_LABELS[dc.domain] ?? dc.domain}</div>
              <div className="hl-domain-champ-score">{dc.score}%</div>
              <div className="hl-domain-champ-model">{dc.modelName}</div>
              <div className="hl-domain-champ-provider">{dc.provider}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SlideSpeedDemon({ data }: { data: Highlights }) {
  const { ref, visible } = useInView();
  const s = data.speedDemon;
  if (!s) return null;
  return (
    <section className="hl-slide hl-slide-dark" ref={ref}>
      <div className={`hl-slide-inner ${visible ? 'hl-visible' : ''}`}>
        <div className="hl-label">The Speed Demon</div>
        <div className="hl-big-emoji">&#9889;</div>
        <div className="hl-champion-name">{s.modelName}</div>
        <div className="hl-champion-provider">{s.provider}</div>
        <div className="hl-speed-value">
          <AnimatedCounter target={s.avgLatencyMs} suffix="ms" duration={1200} />
        </div>
        <div className="hl-champion-detail">
          Average latency &middot; {s.percentage}% accuracy
        </div>
      </div>
    </section>
  );
}

function SlideBestValue({ data }: { data: Highlights }) {
  const { ref, visible } = useInView();
  const v = data.bestValue;
  if (!v) return null;
  return (
    <section className="hl-slide" ref={ref}>
      <div className={`hl-slide-inner ${visible ? 'hl-visible' : ''}`}>
        <div className="hl-label">Best Bang for Buck</div>
        <div className="hl-big-emoji">&#128176;</div>
        <div className="hl-champion-name">{v.modelName}</div>
        <div className="hl-champion-provider">{v.provider}</div>
        <div className="hl-numbers-grid" style={{ marginTop: '2rem' }}>
          <div className="hl-number-card">
            <span className="hl-counter" style={{ color: '#fbbf24' }}>
              ${v.costUsd < 0.01 ? (v.costUsd * 100).toFixed(1) + 'c' : v.costUsd.toFixed(3)}
            </span>
            <div className="hl-number-label">Cost per run</div>
          </div>
          <div className="hl-number-card">
            <span className="hl-counter">{v.percentage}%</span>
            <div className="hl-number-label">Score</div>
          </div>
          <div className="hl-number-card">
            <AnimatedCounter target={v.scorePerDollar} prefix="" suffix=" pts/$" />
            <div className="hl-number-label">Score per dollar</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SlideHardest({ data }: { data: Highlights }) {
  const { ref, visible } = useInView();
  if (!data.hardestChallenge) return null;
  return (
    <section className="hl-slide hl-slide-dark" ref={ref}>
      <div className={`hl-slide-inner ${visible ? 'hl-visible' : ''}`}>
        <div className="hl-label">The Toughest Challenge</div>
        <div className="hl-big-emoji">&#128128;</div>
        <div className="hl-hardest-id">{data.hardestChallenge.id}</div>
        <div className="hl-hardest-rate">
          <AnimatedCounter target={data.hardestChallenge.passRate} suffix="%" duration={1500} />
        </div>
        <div className="hl-champion-detail">
          pass rate across {data.hardestChallenge.total} models
        </div>
        {data.easiestChallenge && (
          <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(34,197,94,0.1)', borderRadius: 8 }}>
            <div style={{ fontSize: '0.8rem', color: '#737373', marginBottom: 4 }}>Easiest challenge</div>
            <div style={{ fontWeight: 700 }}>{data.easiestChallenge.id}</div>
            <div style={{ fontFamily: 'var(--font-mono)', color: '#22c55e', fontSize: '1.25rem' }}>
              {data.easiestChallenge.passRate}% pass rate
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function SlideSkillUplift({ data }: { data: Highlights }) {
  const { ref, visible } = useInView();
  const u = data.biggestUplift;
  if (!u) return null;
  return (
    <section className="hl-slide hl-slide-accent" ref={ref}>
      <div className={`hl-slide-inner ${visible ? 'hl-visible' : ''}`}>
        <div className="hl-label">Biggest Skill Uplift</div>
        <div className="hl-champion-name">{u.modelName}</div>
        <div className="hl-champion-provider">{u.provider}</div>
        <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center', margin: '2rem 0', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: '#737373', marginBottom: 4 }}>Baseline</div>
            <div style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#00bfae' }}>
              {u.baseline}%
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', fontSize: '2rem', color: '#737373' }}>
            &#8594;
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: '#737373', marginBottom: 4 }}>With Skills</div>
            <div style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#a855f7' }}>
              {u.withSkills}%
            </div>
          </div>
        </div>
        <div className="skill-uplift skill-uplift-positive" style={{ fontSize: '1.5rem', padding: '0.5rem 1.5rem' }}>
          +{u.uplift}% uplift
        </div>
      </div>
    </section>
  );
}

function SlideGrades({ data }: { data: Highlights }) {
  const { ref, visible } = useInView();
  const grades = ['S', 'A', 'B', 'C', 'D', 'F'];
  const maxCount = Math.max(...Object.values(data.gradeDistribution), 1);
  return (
    <section className="hl-slide" ref={ref}>
      <div className={`hl-slide-inner ${visible ? 'hl-visible' : ''}`}>
        <div className="hl-label">Grade Distribution</div>
        <p className="hl-subtitle" style={{ marginBottom: '2rem' }}>
          How did all {data.totalModels} models score?
        </p>
        <div className="hl-grade-chart">
          {grades.map((g, i) => {
            const count = data.gradeDistribution[g] ?? 0;
            const height = (count / maxCount) * 180;
            return (
              <div key={g} className="hl-grade-bar-col">
                <div className="hl-grade-bar-count">{count}</div>
                <div
                  className="hl-grade-bar"
                  style={{
                    height: visible ? `${height}px` : '0px',
                    background: GRADE_COLORS[g],
                    transitionDelay: `${i * 0.1}s`,
                  }}
                />
                <div
                  className="hl-grade-bar-letter"
                  style={{ color: GRADE_COLORS[g] }}
                >
                  {g}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function SlideProviders({ data }: { data: Highlights }) {
  const { ref, visible } = useInView();
  const sorted = Object.entries(data.providerCounts).sort((a, b) => b[1] - a[1]);
  return (
    <section className="hl-slide hl-slide-dark" ref={ref}>
      <div className={`hl-slide-inner ${visible ? 'hl-visible' : ''}`}>
        <div className="hl-label">Provider Landscape</div>
        <p className="hl-subtitle" style={{ marginBottom: '2rem' }}>
          {sorted.length} providers represented
        </p>
        <div className="hl-providers-list">
          {sorted.map(([provider, count], i) => (
            <div
              key={provider}
              className={`hl-provider-row ${visible ? 'hl-visible' : ''}`}
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <span className="hl-provider-name">{provider}</span>
              <span className="hl-provider-count">{count} model{count !== 1 ? 's' : ''}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SlideCTA() {
  return (
    <section className="hl-slide hl-slide-title">
      <div className="hl-slide-inner">
        <div className="hl-big-emoji">&#127942;</div>
        <h2 className="hl-title" style={{ fontSize: '2.5rem' }}>
          Think your model<br/>can do better?
        </h2>
        <div style={{ marginTop: '2rem' }}>
          <div className="install-box" style={{ fontSize: '0.85rem' }}>
            <span className="prompt">$</span>
            <code>npx elastic-quest benchmark --pick</code>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <a href="/leaderboard" className="compare-bar-btn">
            View Leaderboard
          </a>
          <a href="/leaderboard/scenarios" className="compare-bar-btn" style={{ background: '#a855f7' }}>
            View Scenarios
          </a>
        </div>
      </div>
    </section>
  );
}

// --- Main Page ---

export default function HighlightsPage() {
  const [data, setData] = useState<Highlights | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/highlights')
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="hl-loading">
        <div className="hl-loading-spinner" />
        <p>Crunching the numbers...</p>
      </div>
    );
  }

  if (!data || data.empty) {
    return (
      <div className="hl-loading">
        <p>No benchmark data yet.</p>
        <div style={{ marginTop: '1rem' }}>
          <div className="install-box" style={{ fontSize: '0.85rem' }}>
            <span className="prompt">$</span>
            <code>npx elastic-quest benchmark --pick</code>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hl-container">
      <SlideTitle />
      <SlideNumbers data={data} />
      <SlideChampion data={data} />
      <SlidePodium data={data} />
      <SlideDomainChampions data={data} />
      <SlideSpeedDemon data={data} />
      <SlideBestValue data={data} />
      <SlideGrades data={data} />
      <SlideHardest data={data} />
      <SlideSkillUplift data={data} />
      <SlideProviders data={data} />
      <SlideCTA />
    </div>
  );
}
