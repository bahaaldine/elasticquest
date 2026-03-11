# ElasticQuest

**How well does your AI know Elasticsearch?**

ElasticQuest is an open-source benchmark that tests AI models on real Elasticsearch query tasks. 44 challenges across 6 domains, scored and ranked on a public leaderboard.

```bash
OPENROUTER_API_KEY=sk-or-... npx elastic-quest benchmark --pick
```

Get your free API key at [openrouter.ai/keys](https://openrouter.ai/keys) — one key, 300+ models.

---

## Leaderboard

Live results: [elastic-quest-web-2t3s3mceqa-uc.a.run.app/leaderboard](https://elastic-quest-web-2t3s3mceqa-uc.a.run.app/leaderboard)

## How it works

1. **Pick models** — Choose from 300+ models via OpenRouter (GPT-4o, Claude, Gemini, Llama, DeepSeek, Mistral, and more)
2. **Run the benchmark** — Each model gets 44 Elasticsearch challenges. The query response is executed and validated against expected results.
3. **Compare results** — Scores are broken down by domain and difficulty. Results are submitted to the public leaderboard automatically.

## 6 Domains, 44 Challenges

| Domain | Challenges | Topics |
|---|---|---|
| Full-Text Search | 14 | match, bool, phrase, fuzzy, dis_max, boosting, nested, function_score |
| Ingest & Indexing | 6 | Field types, sort, pagination, date ranges, terms queries |
| Aggregations | 10 | terms, avg, stats, cardinality, date_histogram, percentiles, filters agg |
| Observability | 5 | Log filtering, error analysis, HTTP status codes, pattern search |
| Vector Search | 4 | kNN, filtered kNN, hybrid text+vector, semantic + aggregations |
| Security / SIEM | 5 | IP range filtering, brute force detection, DNS hunting, alert triage |

Difficulty levels: **Beginner** (9) · **Intermediate** (14) · **Advanced** (15) · **Expert** (6)

## Quick Start

### Benchmark models interactively

```bash
export OPENROUTER_API_KEY=sk-or-v1-...
npx elastic-quest benchmark --pick
```

This shows a list of popular models. Type numbers like `1,3,6` to select, or `all` to benchmark them all.

### Benchmark specific models

```bash
# Multiple models in one run
npx elastic-quest benchmark \
  -m openrouter:openai/gpt-4o \
  -m openrouter:anthropic/claude-sonnet-4 \
  -m openrouter:google/gemini-2.5-pro-preview

# Single model
npx elastic-quest benchmark -m openrouter:openai/gpt-4o-mini -v
```

### Filter by domain or difficulty

```bash
npx elastic-quest benchmark --pick --domain security -v
npx elastic-quest benchmark --pick --difficulty expert
```

### View the leaderboard

```bash
npx elastic-quest leaderboard
npx elastic-quest compare openrouter:openai/gpt-4o openrouter:anthropic/claude-sonnet-4
```

### Direct provider access (no OpenRouter)

```bash
OPENAI_API_KEY=sk-... npx elastic-quest benchmark -m openai:gpt-4o
ANTHROPIC_API_KEY=sk-... npx elastic-quest benchmark -m anthropic:claude-sonnet-4
npx elastic-quest benchmark -m ollama:llama3   # local Ollama
```

## Architecture

```
packages/
  cli/    # NPX-publishable benchmark CLI
  web/    # Next.js web app (landing page + leaderboard + API)
```

**CLI**: Feeds challenges to the model, parses JSON from responses, executes queries on a simulated Elasticsearch backend, validates results, submits scores to the public API.

**Web**: Landing page, live leaderboard with per-domain breakdowns, API routes for score submission. Deployed on GCP Cloud Run with Firestore.

**Simulated Backend**: In-memory Elasticsearch engine supporting match, bool, term, range, wildcard, fuzzy, dis_max, boosting, nested, function_score, kNN/vector queries, and 15+ aggregation types. No real Elasticsearch needed.

## Environment Variables

| Variable | Description |
|---|---|
| `OPENROUTER_API_KEY` | OpenRouter API key (recommended — one key, all models) |
| `OPENAI_API_KEY` | Direct OpenAI access |
| `ANTHROPIC_API_KEY` | Direct Anthropic access |
| `OLLAMA_BASE_URL` | Local Ollama URL (default: `http://localhost:11434`) |
| `ESS_API_KEY` | Elastic Cloud API key (for `--real-es` mode) |

## Development

```bash
# Install dependencies
npm install

# Build and test the CLI
npm run build -w packages/cli
npm test -w packages/cli

# Run a single test
npm test -w packages/cli -- --testNamePattern="kNN search"

# Start the web app locally
npm run dev -w packages/web
```

## Adding Challenges

1. Edit a file in `packages/cli/src/challenges/`
2. Export a `Challenge[]` array following the existing pattern
3. Register in `packages/cli/src/challenges/index.ts`
4. Each challenge needs: id, domain, difficulty, seed data, mapping, validate function
5. Run `npm test -w packages/cli` to verify

## License

MIT
