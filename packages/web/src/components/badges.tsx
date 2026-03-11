'use client';

import type { Badge } from './badges-logic';

export function BadgeDisplay({ badges }: { badges: Badge[] }) {
  if (badges.length === 0) return null;

  return (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
      {badges.map((badge) => (
        <div
          key={badge.id}
          title={badge.description}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            background: '#141414',
            border: `1px solid ${badge.color}40`,
            borderRadius: 20,
            padding: '0.3rem 0.65rem',
            fontSize: '0.8rem',
            cursor: 'default',
          }}
        >
          <span style={{ fontSize: '0.9rem' }}>{badge.icon}</span>
          <span style={{ color: badge.color, fontWeight: 600 }}>{badge.name}</span>
        </div>
      ))}
    </div>
  );
}
