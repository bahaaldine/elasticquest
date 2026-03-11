# AGENTS.md - ElasticQuest Coding Guidelines

ElasticQuest is an Elasticsearch benchmark for AI models. Monorepo with a CLI
(packages/cli) and a Next.js web app (packages/web). Models solve 53 ES query
challenges across 6 domains and 4 difficulty levels. Results are scored and
ranked on a public leaderboard.

---

## 1. Build, Lint, and Test Commands

```bash
# Monorepo-level
npm install                    # Install all workspace dependencies
npm run build                  # Build CLI + web
npm test                       # Run CLI tests

# CLI (packages/cli)
npm run build -w packages/cli  # Compile TypeScript to dist/
npm test -w packages/cli       # Run all tests (Jest, 21 tests)
npm test -w packages/cli -- src/__tests__/game.test.ts          # Single file
npm test -w packages/cli -- --testNamePattern="kNN search"      # Pattern
npm run typecheck -w packages/cli                               # Type check

# Web (packages/web)
npm run dev -w packages/web    # Next.js dev server (port 3000)
npm run build -w packages/web  # Production build
```

### Benchmark CLI

```bash
# Benchmark a model (via OpenRouter - one API key for all models)
node packages/cli/dist/index.js benchmark --pick          # Interactive picker
node packages/cli/dist/index.js benchmark -m openrouter:openai/gpt-4o
node packages/cli/dist/index.js benchmark -m openrouter:anthropic/claude-sonnet-4

# Multiple models at once
node packages/cli/dist/index.js benchmark \
  -m openrouter:openai/gpt-4o \
  -m openrouter:anthropic/claude-sonnet-4

# Direct providers (no OpenRouter)
node packages/cli/dist/index.js benchmark --model openai:gpt-4o

# Filter by domain or difficulty
node packages/cli/dist/index.js benchmark --pick --domain aggregations -v

# Leaderboard and comparison
node packages/cli/dist/index.js leaderboard
node packages/cli/dist/index.js compare openrouter:openai/gpt-4o openrouter:anthropic/claude-sonnet-4

# Play mode (JSON stdin/stdout protocol for agents)
echo '{"type":"register","agentId":"a","agentName":"A"}' | node packages/cli/dist/index.js play
```

### Environment Variables

```bash
OPENROUTER_API_KEY=...          # OpenRouter (recommended - one key, all models)
OPENAI_API_KEY=...              # Direct OpenAI
ANTHROPIC_API_KEY=...           # Direct Anthropic
OLLAMA_BASE_URL=...             # Local Ollama (default http://localhost:11434)
ELASTIC_QUEST_API_URL=...       # Leaderboard API (default http://localhost:3000)
```

---

## 2. Project Structure

```
packages/
  cli/                            # CLI benchmark tool
    src/
      types/index.ts              # ES types, game protocol, interfaces
      elastic/
        simulated-backend.ts      # In-memory ES engine (match, bool, kNN, aggs, pipelines)
        real-backend.ts           # Wraps @elastic/elasticsearch client
      engine/game-engine.ts       # Game loop: setup, validate, score
      challenges/                 # 53 challenges across 6 domains
        full-text-search.ts       # 14 challenges (+ 1 multi-turn)
        ingest-indexing.ts        # 6 challenges
        aggregations.ts           # 10 challenges (+ 1 multi-turn)
        observability.ts          # 10 challenges (+ 1 multi-turn)
        vector-search.ts          # 4 challenges
        security.ts               # 5 challenges (+ 1 multi-turn)
        multi-turn.ts             # 4 multi-turn challenges
        helpers.ts                # Validation helpers (scoreHits, scoreOrder, etc.)
        _template.ts              # Challenge contribution template
      benchmark/
        types.ts                  # ModelAdapter, BenchmarkResult types
        model-adapters.ts         # OpenAI, Anthropic, Ollama adapters
        openrouter.ts             # OpenRouter adapter + interactive model picker
        runner.ts                 # BenchmarkRunner orchestrator (single + multi-turn)
        store.ts                  # Local results storage + formatting
      cloud/
        elastic-cloud.ts          # Elastic Cloud auto-provisioning
      protocol/game-server.ts     # JSON stdin/stdout for agent play mode
      index.ts                    # CLI entry point
      __tests__/game.test.ts      # 21 tests
  web/                            # Next.js web app
    src/
      app/
        page.tsx                  # Landing page
        layout.tsx                # Root layout + nav
        globals.css               # Dark theme styles
        leaderboard/page.tsx      # Leaderboard page (score + efficiency tabs)
        leaderboard/efficiency/   # Cost-efficiency leaderboard
        models/[...slug]/page.tsx # Model card (radar chart, badges, history)
        challenges/page.tsx       # Challenge catalog (searchable, filterable)
        insights/page.tsx         # Failure analysis (hardest/easiest challenges)
        scoring/page.tsx          # Scoring methodology
        compare/[models]/page.tsx # Head-to-head model comparison
        api/scores/route.ts       # POST /api/scores
        api/leaderboard/route.ts  # GET /api/leaderboard (?format=csv)
        api/badge/[modelId]/      # GET /api/badge/:modelId (SVG badge)
        api/scores/[modelId]/     # GET /api/scores/:modelId
      components/
        radar-chart.tsx           # SVG radar/spider chart
        difficulty-curve.tsx      # SVG difficulty curve chart
        badges.tsx                # Badge display component
        badges-logic.ts           # Badge computation logic (server-safe)
        challenge-of-week.tsx     # Weekly featured challenge
      lib/store.ts                # Firestore-backed score storage
```

---

## 3. Code Style

### Imports

```typescript
// 1. Node built-ins
import * as readline from 'readline';
// 2. External packages
import { Client } from '@elastic/elasticsearch';
// 3. Internal modules
import { GameEngine } from '../engine/game-engine';
// 4. Types (use `import type` for type-only imports)
import type { Challenge, SearchResponse, ElasticBackend } from '../types';
```

### Formatting

- 2 spaces indentation, semicolons, single quotes, trailing commas
- Max line length: 100 characters
- Files: kebab-case (`simulated-backend.ts`)
- Classes: PascalCase (`GameEngine`, `SimulatedBackend`)
- Functions/variables: camelCase (`executeQuery`, `scoredDocs`)
- Constants: SCREAMING_SNAKE_CASE (`LEADERBOARD_FILE`)
- Interfaces: PascalCase (`ElasticBackend`, `Challenge`)
- Boolean prefixes: `is`, `has`, `can`, `should` (`isGameOver`, `hasStats`)

### Types

- Always define return types for functions
- Use `Record<string, unknown>` instead of `any` for dynamic objects
- Use `import type` for type-only imports
- All ES query/response types are in `packages/cli/src/types/index.ts`
- Benchmark types in `packages/cli/src/benchmark/types.ts`
- Web store types in `packages/web/src/lib/store.ts`

### Error Handling

- Use try/catch for async operations, especially ES query execution
- Return structured `ValidationResult` objects with feedback messages
- Use `process.stderr` for diagnostic output (not stdout in CLI)
- stdout is reserved for JSON protocol messages and benchmark JSON output
- API routes return proper HTTP status codes with JSON error bodies

---

## 4. Architecture Notes

### CLI: Benchmark Flow

`BenchmarkRunner` iterates each challenge: sets up the index on `SimulatedBackend`,
builds a prompt, calls `ModelAdapter.complete()`, extracts JSON from the response,
executes the query, validates the result. Speed multiplier applied to score.
After scoring, results (including cost) are submitted to the web API via `POST /api/scores`.

### CLI: Multi-Turn Challenges

Challenges with `multiTurn: true` use a two-step flow:
1. Discovery prompt sent first (model examines mapping + sample docs)
2. Model's analysis is fed back as context for the query prompt
3. Both API calls' tokens and latency are aggregated

### CLI: Model Adapters

`createModelAdapter("provider:model")` returns an adapter:
- `openrouter:openai/gpt-4o` — uses OpenRouter (recommended, 300+ models)
- `openai:gpt-4o` — direct OpenAI
- `anthropic:claude-sonnet-4` — direct Anthropic
- `ollama:llama3` — local Ollama

### Web: Data Flow

CLI submits scores -> `POST /api/scores` -> Firestore (`elastic-quest` database)
-> `GET /api/leaderboard` -> leaderboard page. Model cards, insights, and
comparison pages all read from the same Firestore collection.

---

## 5. Adding New Challenges

1. Edit a file in `packages/cli/src/challenges/`
2. Export a `Challenge[]` array following the existing pattern
3. Register in `packages/cli/src/challenges/index.ts` `getAllChallenges()`
4. Each challenge needs: id, domain, difficulty, seed data, mapping, validate function
5. For multi-turn: set `multiTurn: true` and provide `discoveryPrompt`
6. Test: `npm test -w packages/cli`

---

## 6. Testing & Git

- Tests in `packages/cli/src/__tests__/`, Jest with ts-jest
- Follow AAA pattern: Arrange, Act, Assert
- Run `npm run typecheck -w packages/cli` before committing
- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `test:`
