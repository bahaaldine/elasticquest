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

---

## Running with Real Elasticsearch

By default, ElasticQuest uses a simulated in-memory Elasticsearch backend. This is
free, instant, and deterministic — great for benchmarking. But you can also run
challenges against a **real Elasticsearch cluster** to validate with the actual engine.

### Option 1: Auto-provision on Elastic Cloud (recommended)

ElasticQuest can automatically create a temporary Elasticsearch deployment on
[Elastic Cloud](https://cloud.elastic.co), run all challenges against it, and
tear it down when done.

**Setup:**

1. Sign up at [cloud.elastic.co](https://cloud.elastic.co) (free trial available)
2. Go to [Account > API Keys](https://cloud.elastic.co/account/keys)
3. Create an API key with deployment create/delete permissions

**Run:**

```bash
export OPENROUTER_API_KEY=sk-or-v1-...
export ESS_API_KEY=your-elastic-cloud-api-key

# Interactive model picker + real ES
npx elastic-quest benchmark --pick --real-es

# Specific model + real ES
npx elastic-quest benchmark -m openrouter:openai/gpt-4o --real-es -v

# Custom region (default: gcp-us-central1)
npx elastic-quest benchmark --pick --real-es --ess-region gcp-europe-west1
```

**What happens:**

1. Creates a small (1GB) Elasticsearch deployment on Elastic Cloud
2. Waits for it to be healthy (~2-3 minutes)
3. For each challenge: creates the index, indexes seed data, runs the model's query,
   validates the result — all on the real cluster
4. Submits scores to the public leaderboard
5. Shuts down and deletes the deployment automatically

**Cost:** A 1GB deployment running for ~30 minutes costs roughly $0.01-0.05. The
deployment is always torn down after the benchmark, even if the run is interrupted.

### Option 2: Use your own Elasticsearch cluster

If you already have an Elasticsearch cluster running (local Docker, self-managed,
or Elastic Cloud):

```bash
# With username/password
npx elastic-quest benchmark --pick \
  --mode real \
  --es-node https://my-cluster.es.us-central1.gcp.cloud.es.io:443 \
  --es-api-key your-es-api-key

# Local cluster (e.g., Docker)
npx elastic-quest benchmark --pick \
  --mode real \
  --es-node http://localhost:9200
```

### Option 3: Docker Compose (local)

Spin up a local Elasticsearch instance:

```bash
# Start Elasticsearch
docker run -d --name elasticsearch \
  -p 9200:9200 \
  -e "discovery.type=single-node" \
  -e "xpack.security.enabled=false" \
  docker.elastic.co/elasticsearch/elasticsearch:8.17.0

# Wait for it to be ready
until curl -s http://localhost:9200 > /dev/null; do sleep 1; done

# Run benchmark against local ES
npx elastic-quest benchmark --pick \
  --mode real \
  --es-node http://localhost:9200

# Clean up
docker rm -f elasticsearch
```

### Simulated vs Real: What's the difference?

| | Simulated (default) | Real Elasticsearch |
|---|---|---|
| **Speed** | Instant | ~2-3 min setup + network latency |
| **Cost** | Free | Elastic Cloud: ~$0.01-0.05/run |
| **Accuracy** | Good (covers most query types) | Exact (real ES engine) |
| **Deterministic** | Yes | Yes (same seed data) |
| **Use case** | Benchmarking models | Validating challenge correctness |

For model benchmarking, simulated mode is recommended — it's faster, free, and
the scoring is identical. Real ES mode is useful for:
- Validating that challenges work correctly against the real engine
- Testing edge cases in query parsing/execution
- Ensuring the simulated backend matches real ES behavior

---

## Architecture

```
packages/
  cli/    # NPX-publishable benchmark CLI
  web/    # Next.js web app (landing page + leaderboard + API)
```

**CLI**: Feeds challenges to the model, parses JSON from responses, executes queries
on a simulated or real Elasticsearch backend, validates results, submits scores to the
public API.

**Web**: Landing page, live leaderboard with per-model drill-down, challenge catalog,
API routes for score submission. Deployed on GCP Cloud Run with Firestore.

**Simulated Backend**: In-memory Elasticsearch engine supporting match, bool, term,
range, wildcard, fuzzy, dis_max, boosting, nested, function_score, kNN/vector queries,
and 15+ aggregation types. No real Elasticsearch needed.

## Environment Variables

| Variable | Description |
|---|---|
| `OPENROUTER_API_KEY` | OpenRouter API key (recommended — one key, all models) |
| `OPENAI_API_KEY` | Direct OpenAI access |
| `ANTHROPIC_API_KEY` | Direct Anthropic access |
| `OLLAMA_BASE_URL` | Local Ollama URL (default: `http://localhost:11434`) |
| `ESS_API_KEY` | Elastic Cloud API key (for `--real-es` auto-provisioning) |
| `ELASTIC_QUEST_API_URL` | Leaderboard API URL (default: production) |

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add new challenges.

The short version:

```bash
# Copy the template
cp packages/cli/src/challenges/_template.ts \
   packages/cli/src/challenges/security/sec-6-my-challenge.ts

# Edit it, register in index.ts, test
npm test -w packages/cli
```

## License

MIT
