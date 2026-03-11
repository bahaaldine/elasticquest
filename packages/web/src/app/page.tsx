const DOMAINS = [
  {
    icon: '&#128269;',
    name: 'Full-Text Search',
    count: 14,
    desc: 'match, bool, phrase, fuzzy, dis_max, boosting, nested queries, function_score, field boosting',
  },
  {
    icon: '&#128230;',
    name: 'Ingest & Indexing',
    count: 6,
    desc: 'Field types, sort, pagination, date ranges, conditional counts, terms queries',
  },
  {
    icon: '&#128202;',
    name: 'Aggregations',
    count: 10,
    desc: 'terms, avg, sum, stats, cardinality, date_histogram, percentiles, percentile_ranks, filters agg, 3-level nested aggs',
  },
  {
    icon: '&#128065;',
    name: 'Observability',
    count: 5,
    desc: 'Log filtering, service error analysis, HTTP status codes, message pattern search',
  },
  {
    icon: '&#129302;',
    name: 'Vector Search',
    count: 4,
    desc: 'kNN search, filtered kNN, hybrid text+vector, semantic search with aggregations',
  },
  {
    icon: '&#128274;',
    name: 'Security / SIEM',
    count: 5,
    desc: 'IP range filtering, brute force detection, DNS threat hunting, alert triage, account correlation',
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="hero">
        <h1>How well does your AI know Elasticsearch?</h1>
        <p>
          44 challenges across 6 domains. Benchmark any LLM on real Elasticsearch
          query tasks. Compare models on the public leaderboard.
        </p>
        <div className="install-box">
          <span className="prompt">$</span>
          <code>OPENROUTER_API_KEY=sk-or-... npx elastic-quest benchmark --pick</code>
        </div>
        <p style={{ fontSize: '0.85rem', color: '#737373' }}>
          Get your free API key at{' '}
          <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" style={{ color: '#00bfae' }}>
            openrouter.ai/keys
          </a>
          {' '}&mdash; one key, 300+ models.
        </p>
      </section>

      {/* How it works */}
      <section className="how-section">
        <h2>How it works</h2>
        <div className="how-steps">
          <div className="how-step">
            <div className="step-num">1</div>
            <h3>Pick models</h3>
            <p>
              Choose from 300+ models via OpenRouter. GPT-4o, Claude, Gemini,
              Llama, DeepSeek, Mistral, and more.
            </p>
          </div>
          <div className="how-step">
            <div className="step-num">2</div>
            <h3>Run the benchmark</h3>
            <p>
              Each model gets 31 Elasticsearch challenges. The query response is
              executed and validated against expected results.
            </p>
          </div>
          <div className="how-step">
            <div className="step-num">3</div>
            <h3>Compare results</h3>
            <p>
              Scores are broken down by domain and difficulty. Results are submitted
              to the public leaderboard automatically.
            </p>
          </div>
        </div>
      </section>

      {/* Domains */}
      <section className="domains-section">
        <h2>6 Domains, 44 Challenges</h2>
        <p className="subtitle">
          From beginner match queries to expert-level hybrid vector search with nested aggregations
        </p>
        <div className="domains-grid">
          {DOMAINS.map((d) => (
            <div key={d.name} className="domain-card">
              <h3>
                <span dangerouslySetInnerHTML={{ __html: d.icon }} />
                {d.name}
                <span className="badge">{d.count}</span>
              </h3>
              <p>{d.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="hero" style={{ paddingTop: '2rem' }}>
        <h2 style={{ fontSize: '1.8rem', marginBottom: '1rem' }}>Ready to benchmark?</h2>
        <div className="install-box">
          <span className="prompt">$</span>
          <code>
            OPENROUTER_API_KEY=sk-or-... npx elastic-quest benchmark --pick
          </code>
        </div>
        <p style={{ fontSize: '0.85rem', color: '#737373', marginTop: '1rem' }}>
          Set your OpenRouter API key and pick models interactively.
          <br />
          Or run directly:{' '}
          <code style={{ color: '#00bfae' }}>
            npx elastic-quest benchmark -m openrouter:openai/gpt-4o
          </code>
        </p>
      </section>
    </>
  );
}
