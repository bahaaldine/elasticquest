'use client';

import { useState } from 'react';

interface EvalStep {
  name: string;
  description: string;
  status: 'success' | 'failure' | 'skipped';
  durationMs?: number;
  detail?: string;
  error?: string;
}

const STEP_ICONS: Record<string, string> = {
  setup: '1',
  prompt: '2',
  discovery_call: '2',
  model_call: '3',
  parse: '4',
  execute: '5',
  validate: '6',
  speed_adjust: '7',
  error: '!',
};

export function EvalProcess({ steps, challengeId }: { steps: EvalStep[]; challengeId: string }) {
  const [expanded, setExpanded] = useState(false);

  if (!steps || steps.length === 0) return null;

  const hasFailure = steps.some((s) => s.status === 'failure');
  const failedStep = steps.find((s) => s.status === 'failure');

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          background: 'none',
          border: 'none',
          color: hasFailure ? '#ef4444' : '#00bfae',
          cursor: 'pointer',
          fontSize: '0.75rem',
          fontFamily: 'var(--font-mono)',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
        }}
      >
        <span style={{ transition: 'transform 0.15s', display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'none' }}>
          &#9654;
        </span>
        {expanded ? 'Hide' : 'Show'} eval process ({steps.length} steps)
        {hasFailure && failedStep && !expanded && (
          <span style={{ color: '#ef4444', marginLeft: '0.25rem' }}>
            &mdash; failed at {failedStep.name}
          </span>
        )}
      </button>

      {expanded && (
        <div className="eval-process" style={{ marginTop: '0.75rem' }}>
          {steps.map((step, i) => (
            <div key={`${challengeId}-${step.name}-${i}`} className="eval-step">
              <div className={`eval-step-dot eval-step-dot-${step.status}`}>
                {step.status === 'success' ? '\u2713'
                  : step.status === 'failure' ? '\u2717'
                  : '-'}
              </div>
              <div className="eval-step-content">
                <div className="eval-step-header">
                  <span className="eval-step-name">{step.name}</span>
                  {step.durationMs !== undefined && (
                    <span className="eval-step-duration">{step.durationMs}ms</span>
                  )}
                </div>
                <div className="eval-step-desc">{step.description}</div>
                {step.detail && (
                  <div className="eval-step-detail">{step.detail}</div>
                )}
                {step.error && step.status === 'failure' && (
                  <div className="eval-step-error">{step.error}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
