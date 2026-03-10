# AGENTS.md - ElasticQuest Coding Guidelines

ElasticQuest is an Elasticsearch benchmark for AI models. Monorepo with a CLI
(packages/cli) and a Next.js web app (packages/web). Models solve 31 ES query
challenges across 5 domains and 4 difficulty levels. Results are scored and
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
      challenges/                 # 31 challenges across 5 domains
        full-text-search.ts       # 9 challenges
        ingest-indexing.ts        # 6 challenges
        aggregations.ts           # 7 challenges
        observability.ts          # 5 challenges
        vector-search.ts          # 4 challenges
      benchmark/
        types.ts                  # ModelAdapter, BenchmarkResult types
        model-adapters.ts         # OpenAI, Anthropic, Ollama adapters
        openrouter.ts             # OpenRouter adapter + interactive model picker
        runner.ts                 # BenchmarkRunner orchestrator
        store.ts                  # Local results storage + formatting
      protocol/game-server.ts     # JSON stdin/stdout for agent play mode
      index.ts                    # CLI entry point
      __tests__/game.test.ts      # 21 tests
  web/                            # Next.js web app
    src/
      app/
        page.tsx                  # Landing page
        layout.tsx                # Root layout + nav
        globals.css               # Dark theme styles
        leaderboard/page.tsx      # Leaderboard page
        api/scores/route.ts       # POST /api/scores
        api/leaderboard/route.ts  # GET /api/leaderboard
      lib/store.ts                # Score storage (file-based, swap for Firestore)
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
executes the query, validates the result. After scoring, results are submitted to the
web API via `POST /api/scores`.

### CLI: Model Adapters

`createModelAdapter("provider:model")` returns an adapter:
- `openrouter:openai/gpt-4o` — uses OpenRouter (recommended, 300+ models)
- `openai:gpt-4o` — direct OpenAI
- `anthropic:claude-sonnet-4` — direct Anthropic
- `ollama:llama3` — local Ollama

### Web: Data Flow

CLI submits scores -> `POST /api/scores` -> file-based store (`.data/scores.json`)
-> `GET /api/leaderboard` -> leaderboard page. The store is designed to be swapped
for Firestore with minimal changes (same interface in `lib/store.ts`).

---

## 5. Adding New Challenges

1. Edit a file in `packages/cli/src/challenges/`
2. Export a `Challenge[]` array following the existing pattern
3. Register in `packages/cli/src/challenges/index.ts` `getAllChallenges()`
4. Each challenge needs: id, domain, difficulty, seed data, mapping, validate function
5. Test: `npm test -w packages/cli`

---

## 6. Testing & Git

- Tests in `packages/cli/src/__tests__/`, Jest with ts-jest
- Follow AAA pattern: Arrange, Act, Assert
- Run `npm run typecheck -w packages/cli` before committing
- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `test:`
