export default function ScoringPage() {
  return (
    <div className="leaderboard-page">
      <h1>Scoring Methodology</h1>
      <p className="subtitle">How ElasticQuest calculates scores</p>

      {/* Overview */}
      <section style={{ marginBottom: '3rem' }}>
        <p style={{ color: '#a3a3a3', lineHeight: 1.8, maxWidth: 700 }}>
          Each model is scored on 53 Elasticsearch challenges across 6 domains and 4 difficulty
          levels. The final score combines <strong style={{ color: '#e5e5e5' }}>query correctness</strong> and{' '}
          <strong style={{ color: '#e5e5e5' }}>response speed</strong>.
        </p>
      </section>

      {/* Step 1: Correctness */}
      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', color: '#00bfae', marginBottom: '1rem' }}>
          1. Correctness Score (0-100 per challenge)
        </h2>
        <div style={{ background: '#141414', border: '1px solid #262626', borderRadius: 12, padding: '1.5rem', maxWidth: 700 }}>
          <p style={{ color: '#a3a3a3', lineHeight: 1.7, marginBottom: '1rem' }}>
            For each challenge, the model receives a prompt describing the task, the index mapping,
            and sample documents. It must respond with a valid JSON Elasticsearch query body.
          </p>
          <p style={{ color: '#a3a3a3', lineHeight: 1.7, marginBottom: '1rem' }}>
            The query is executed against the backend, and the result is validated:
          </p>
          <ul style={{ color: '#a3a3a3', lineHeight: 2, paddingLeft: '1.5rem' }}>
            <li><strong style={{ color: '#e5e5e5' }}>Search challenges:</strong> Checks which expected documents were returned.
              Points for correct hits, penalties for false positives (-15 each).</li>
            <li><strong style={{ color: '#e5e5e5' }}>Aggregation challenges:</strong> Checks aggregation structure, bucket counts,
              metric values, and sub-aggregation nesting.</li>
            <li><strong style={{ color: '#e5e5e5' }}>Sort/order challenges:</strong> Additional points for correct result ordering.</li>
            <li><strong style={{ color: '#e5e5e5' }}>Partial credit:</strong> Models get proportional points for partially correct answers
              (e.g., finding 3 of 4 expected documents).</li>
          </ul>
          <p style={{ color: '#a3a3a3', lineHeight: 1.7, marginTop: '1rem' }}>
            If the model&apos;s response is not valid JSON, or if the query throws an execution error,
            the score is <strong style={{ color: '#ef4444' }}>0</strong>.
          </p>
        </div>
      </section>

      {/* Step 2: Speed */}
      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', color: '#00bfae', marginBottom: '1rem' }}>
          2. Speed Multiplier
        </h2>
        <div style={{ background: '#141414', border: '1px solid #262626', borderRadius: 12, padding: '1.5rem', maxWidth: 700 }}>
          <p style={{ color: '#a3a3a3', lineHeight: 1.7, marginBottom: '1rem' }}>
            The correctness score is multiplied by a speed factor based on the model&apos;s
            response latency. This rewards models that are both accurate and fast.
          </p>
          <table className="lb-table" style={{ maxWidth: 400 }}>
            <thead>
              <tr>
                <th>Latency</th>
                <th>Multiplier</th>
                <th>Effect</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontFamily: 'var(--font-mono)' }}>&lt; 2s</td>
                <td style={{ fontFamily: 'var(--font-mono)', color: '#22c55e', fontWeight: 700 }}>1.15x</td>
                <td style={{ color: '#22c55e' }}>+15% bonus</td>
              </tr>
              <tr>
                <td style={{ fontFamily: 'var(--font-mono)' }}>2-5s</td>
                <td style={{ fontFamily: 'var(--font-mono)', color: '#e5e5e5' }}>1.00x</td>
                <td style={{ color: '#737373' }}>Neutral</td>
              </tr>
              <tr>
                <td style={{ fontFamily: 'var(--font-mono)' }}>5-10s</td>
                <td style={{ fontFamily: 'var(--font-mono)', color: '#fbbf24' }}>0.95x</td>
                <td style={{ color: '#fbbf24' }}>-5% penalty</td>
              </tr>
              <tr>
                <td style={{ fontFamily: 'var(--font-mono)' }}>10-30s</td>
                <td style={{ fontFamily: 'var(--font-mono)', color: '#f97316' }}>0.90x</td>
                <td style={{ color: '#f97316' }}>-10% penalty</td>
              </tr>
              <tr>
                <td style={{ fontFamily: 'var(--font-mono)' }}>&gt; 30s</td>
                <td style={{ fontFamily: 'var(--font-mono)', color: '#ef4444' }}>0.80x</td>
                <td style={{ color: '#ef4444' }}>-20% penalty</td>
              </tr>
            </tbody>
          </table>
          <p style={{ color: '#737373', fontSize: '0.85rem', marginTop: '1rem' }}>
            Final challenge score = min(100, round(correctness_score &times; speed_multiplier))
          </p>
        </div>
      </section>

      {/* Step 3: Aggregation */}
      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', color: '#00bfae', marginBottom: '1rem' }}>
          3. Overall Score
        </h2>
        <div style={{ background: '#141414', border: '1px solid #262626', borderRadius: 12, padding: '1.5rem', maxWidth: 700 }}>
          <ul style={{ color: '#a3a3a3', lineHeight: 2, paddingLeft: '1.5rem' }}>
            <li><strong style={{ color: '#e5e5e5' }}>Total score</strong> = sum of all challenge scores</li>
            <li><strong style={{ color: '#e5e5e5' }}>Max possible</strong> = 53 challenges &times; 100 = 5,300</li>
            <li><strong style={{ color: '#e5e5e5' }}>Percentage</strong> = total / max &times; 100</li>
            <li><strong style={{ color: '#e5e5e5' }}>Leaderboard rank</strong> = sorted by percentage (ties broken by avg latency)</li>
          </ul>
        </div>
      </section>

      {/* Domain breakdown */}
      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', color: '#00bfae', marginBottom: '1rem' }}>
          4. Domain & Difficulty Breakdown
        </h2>
        <div style={{ background: '#141414', border: '1px solid #262626', borderRadius: 12, padding: '1.5rem', maxWidth: 700 }}>
          <p style={{ color: '#a3a3a3', lineHeight: 1.7, marginBottom: '1rem' }}>
            Scores are also broken down by domain and difficulty level:
          </p>
          <table className="lb-table" style={{ maxWidth: 500 }}>
            <thead>
              <tr>
                <th>Domain</th>
                <th>Challenges</th>
                <th>Max Score</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: 'Full-Text Search', count: 15 },
                { name: 'Ingest & Indexing', count: 6 },
                { name: 'Aggregations', count: 11 },
                { name: 'Observability', count: 11 },
                { name: 'Vector Search', count: 4 },
                { name: 'Security / SIEM', count: 6 },
              ].map((d) => (
                <tr key={d.name}>
                  <td>{d.name}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{d.count}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{d.count * 100}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid #262626' }}>
                <td style={{ fontWeight: 700 }}>Total</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>53</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>5,300</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Badges */}
      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', color: '#00bfae', marginBottom: '1rem' }}>
          5. Badges
        </h2>
        <div style={{ background: '#141414', border: '1px solid #262626', borderRadius: 12, padding: '1.5rem', maxWidth: 700 }}>
          <p style={{ color: '#a3a3a3', lineHeight: 1.7, marginBottom: '1rem' }}>
            Models earn badges based on their performance:
          </p>
          <table className="lb-table" style={{ maxWidth: 550 }}>
            <thead>
              <tr>
                <th>Badge</th>
                <th>Criteria</th>
              </tr>
            </thead>
            <tbody>
              {[
                { icon: '💎', name: 'Flawless', criteria: '100% overall score' },
                { icon: '🏆', name: 'Ace', criteria: '90%+ overall score' },
                { icon: '✅', name: 'Solid', criteria: '70%+ overall score' },
                { icon: '⚡', name: 'Speed Demon', criteria: 'Average latency under 500ms' },
                { icon: '🎯', name: 'Consistent', criteria: '80%+ on every domain' },
                { icon: '🔍', name: 'Search Master', criteria: '100% on Full-Text Search' },
                { icon: '📊', name: 'Agg Wizard', criteria: '100% on Aggregations' },
                { icon: '🛡️', name: 'Security Expert', criteria: '100% on Security' },
                { icon: '🧬', name: 'Vector Ace', criteria: '100% on Vector Search' },
                { icon: '👁️', name: 'Ops Hero', criteria: '100% on Observability' },
              ].map((b) => (
                <tr key={b.name}>
                  <td>{b.icon} {b.name}</td>
                  <td style={{ color: '#a3a3a3' }}>{b.criteria}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Fairness */}
      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', color: '#00bfae', marginBottom: '1rem' }}>
          6. Fairness & Reproducibility
        </h2>
        <div style={{ background: '#141414', border: '1px solid #262626', borderRadius: 12, padding: '1.5rem', maxWidth: 700 }}>
          <ul style={{ color: '#a3a3a3', lineHeight: 2, paddingLeft: '1.5rem' }}>
            <li>All models receive the <strong style={{ color: '#e5e5e5' }}>same prompt</strong> for each challenge (system prompt + challenge description + mapping + sample docs)</li>
            <li>Temperature is set to <strong style={{ color: '#e5e5e5' }}>0</strong> for all models (deterministic output)</li>
            <li>The simulated backend is <strong style={{ color: '#e5e5e5' }}>deterministic</strong> — same query always produces the same result</li>
            <li>Latency is measured <strong style={{ color: '#e5e5e5' }}>end-to-end</strong> (API call round-trip), not just model inference time</li>
            <li>The leaderboard shows the <strong style={{ color: '#e5e5e5' }}>best run</strong> per model if multiple runs are submitted</li>
            <li>Anyone can reproduce results by running the same benchmark: <code style={{ color: '#00bfae' }}>npx elastic-quest benchmark -m openrouter:model-name -v</code></li>
          </ul>
        </div>
      </section>
    </div>
  );
}
