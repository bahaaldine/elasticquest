// Pure logic — no 'use client'. Safe to import from server components.

export interface Badge {
  id: string;
  name: string;
  icon: string;
  description: string;
  color: string;
}

export interface BadgesProps {
  domainScores: { domain: string; percentage: number }[];
  overallPercentage: number;
  avgLatencyMs: number;
  correctCount: number;
  totalCount: number;
}

const ALL_BADGES: Badge[] = [
  { id: 'flawless', name: 'Flawless', icon: '💎', description: '100% overall score', color: '#00bfae' },
  { id: 'search-master', name: 'Search Master', icon: '🔍', description: '100% on Full-Text Search', color: '#3b82f6' },
  { id: 'agg-wizard', name: 'Agg Wizard', icon: '📊', description: '100% on Aggregations', color: '#a855f7' },
  { id: 'security-expert', name: 'Security Expert', icon: '🛡️', description: '100% on Security', color: '#ef4444' },
  { id: 'vector-ace', name: 'Vector Ace', icon: '🧬', description: '100% on Vector Search', color: '#22c55e' },
  { id: 'ops-hero', name: 'Ops Hero', icon: '👁️', description: '100% on Observability', color: '#f59e0b' },
  { id: 'speed-demon', name: 'Speed Demon', icon: '⚡', description: 'Average latency under 500ms', color: '#fbbf24' },
  { id: 'consistent', name: 'Consistent', icon: '🎯', description: '80%+ on every domain', color: '#06b6d4' },
  { id: 'ace', name: 'Ace', icon: '🏆', description: '90%+ overall score', color: '#eab308' },
  { id: 'solid', name: 'Solid', icon: '✅', description: '70%+ overall score', color: '#22c55e' },
];

const DOMAIN_BADGE_MAP: Record<string, string> = {
  'full-text-search': 'search-master',
  aggregations: 'agg-wizard',
  security: 'security-expert',
  'vector-search': 'vector-ace',
  observability: 'ops-hero',
};

export function computeBadges(props: BadgesProps): Badge[] {
  const earned: Badge[] = [];
  const { domainScores, overallPercentage, avgLatencyMs } = props;

  if (overallPercentage === 100) earned.push(ALL_BADGES.find((b) => b.id === 'flawless')!);
  if (overallPercentage >= 90) earned.push(ALL_BADGES.find((b) => b.id === 'ace')!);
  else if (overallPercentage >= 70) earned.push(ALL_BADGES.find((b) => b.id === 'solid')!);

  if (avgLatencyMs < 500) earned.push(ALL_BADGES.find((b) => b.id === 'speed-demon')!);

  const allAbove80 = domainScores.length >= 4 && domainScores.every((d) => d.percentage >= 80);
  if (allAbove80) earned.push(ALL_BADGES.find((b) => b.id === 'consistent')!);

  for (const ds of domainScores) {
    const badgeId = DOMAIN_BADGE_MAP[ds.domain];
    if (badgeId && ds.percentage === 100) {
      earned.push(ALL_BADGES.find((b) => b.id === badgeId)!);
    }
  }

  return earned.filter(Boolean);
}
