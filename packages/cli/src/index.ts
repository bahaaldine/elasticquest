#!/usr/bin/env node

import { SimulatedBackend, RealBackend } from './elastic';
import type { RealBackendConfig } from './elastic';
import type { ElasticBackend, Domain, Difficulty } from './types';
import { GameEngine } from './engine/game-engine';
import { GameServer } from './protocol/game-server';
import { getAllChallenges } from './challenges';
import {
  BenchmarkRunner,
  BenchmarkStore,
  createModelAdapter,
  formatLeaderboard,
  formatResult,
  formatComparison,
  OpenRouterAdapter,
  pickModels,
} from './benchmark';
import type { BenchmarkConfig, BenchmarkResult } from './benchmark';
import { createDeployment, destroyDeployment } from './cloud';

const DEFAULT_API_URL = process.env.ELASTIC_QUEST_API_URL ?? 'https://elastic-quest-web-2t3s3mceqa-uc.a.run.app';

interface ParsedArgs {
  command: 'play' | 'benchmark' | 'leaderboard' | 'compare' | 'help';
  mode: 'simulated' | 'real';
  esConfig?: RealBackendConfig;
  modelIds?: string[];          // supports multiple models
  apiKey?: string;
  baseUrl?: string;
  domains?: Domain[];
  difficulties?: Difficulty[];
  verbose?: boolean;
  compareModels?: [string, string];
  interactive?: boolean;        // --pick flag for interactive selection
  apiUrl?: string;              // leaderboard API URL
  noSubmit?: boolean;           // skip leaderboard submission
  realEs?: boolean;             // auto-provision Elastic Cloud
  essApiKey?: string;           // Elastic Cloud API key
  essRegion?: string;           // Elastic Cloud region
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const result: ParsedArgs = {
    command: 'play',
    mode: 'simulated',
    modelIds: [],
  };

  // Detect command
  if (args.length > 0 && !args[0].startsWith('-')) {
    const cmd = args[0];
    switch (cmd) {
      case 'benchmark': result.command = 'benchmark'; break;
      case 'leaderboard': result.command = 'leaderboard'; break;
      case 'compare': result.command = 'compare'; break;
      case 'help': result.command = 'help'; break;
      case 'play': result.command = 'play'; break;
    }
  }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--model': case '-m':
        result.modelIds!.push(args[++i]);
        break;
      case '--api-key':
        result.apiKey = args[++i];
        break;
      case '--base-url':
        result.baseUrl = args[++i];
        break;
      case '--domain':
        result.domains = result.domains ?? [];
        result.domains.push(args[++i] as Domain);
        break;
      case '--difficulty':
        result.difficulties = result.difficulties ?? [];
        result.difficulties.push(args[++i] as Difficulty);
        break;
      case '--verbose': case '-v':
        result.verbose = true;
        break;
      case '--pick': case '-p':
        result.interactive = true;
        break;
      case '--api-url':
        result.apiUrl = args[++i];
        break;
      case '--no-submit':
        result.noSubmit = true;
        break;
      case '--real-es':
        result.realEs = true;
        break;
      case '--ess-api-key':
        result.essApiKey = args[++i];
        break;
      case '--ess-region':
        result.essRegion = args[++i];
        break;
      case '--mode':
        result.mode = args[++i] as 'simulated' | 'real';
        break;
      case '--es-node':
        result.esConfig = result.esConfig ?? { node: '' };
        result.esConfig.node = args[++i];
        break;
      case '--es-api-key':
        result.esConfig = result.esConfig ?? { node: 'http://localhost:9200' };
        result.esConfig.apiKey = args[++i];
        break;
      case '--es-cloud-id':
        result.esConfig = result.esConfig ?? { node: '' };
        result.esConfig.cloudId = args[++i];
        break;
      case '--leaderboard':
        result.command = 'leaderboard';
        break;
      case '--help': case '-h':
        result.command = 'help';
        break;
    }
  }

  // Handle compare: elastic-quest compare model-a model-b
  if (result.command === 'compare') {
    const nonFlags = args.filter((a) => !a.startsWith('-'));
    if (nonFlags.length >= 3) {
      result.compareModels = [nonFlags[1], nonFlags[2]];
    }
  }

  return result;
}

function printHelp(): void {
  const help = `
ElasticQuest - Elasticsearch Challenge Benchmark for AI Models

COMMANDS:
  elastic-quest benchmark --model <provider:model>   Run benchmark against a model
  elastic-quest benchmark --pick                     Pick models interactively (OpenRouter)
  elastic-quest leaderboard                          Show model leaderboard
  elastic-quest compare <modelA> <modelB>            Compare two models
  elastic-quest play                                 Play via JSON stdin/stdout protocol
  elastic-quest help                                 Show this help

BENCHMARK OPTIONS:
  --model, -m <id>       Model to benchmark (can be repeated for multiple models)
                         Direct providers:
                           openai:gpt-4o
                           anthropic:claude-sonnet-4
                           ollama:llama3
                         Via OpenRouter (any model, one API key):
                           openrouter:openai/gpt-4o
                           openrouter:anthropic/claude-sonnet-4
                           openrouter:google/gemini-2.5-flash-preview
  --pick, -p             Interactive model picker (uses OpenRouter)
  --api-key <key>        API key (or use env vars below)
  --base-url <url>       Custom API base URL (for OpenAI-compatible providers)
  --domain <name>        Filter to domain (can repeat). Options:
                           full-text-search, ingest-indexing, aggregations,
                           observability, vector-search
  --difficulty <level>   Filter to difficulty (can repeat). Options:
                           beginner, intermediate, advanced, expert
  --verbose, -v          Show detailed feedback for failed challenges
  --real-es              Auto-provision Elastic Cloud (requires ESS_API_KEY)
  --ess-api-key <key>    Elastic Cloud API key
  --ess-region <region>  Elastic Cloud region (default: gcp-us-central1)
  --no-submit            Skip submitting results to the public leaderboard

PLAY MODE OPTIONS:
  --mode <simulated|real>  Backend mode (default: simulated)
  --es-node <url>          Elasticsearch URL (for real mode)

ENVIRONMENT VARIABLES:
  OPENROUTER_API_KEY     OpenRouter API key (recommended - one key, all models)
  OPENAI_API_KEY         OpenAI API key (direct)
  ANTHROPIC_API_KEY      Anthropic API key (direct)
  OLLAMA_BASE_URL        Ollama base URL (default: http://localhost:11434)
  ESS_API_KEY            Elastic Cloud API key (for --real-es)
  ELASTIC_QUEST_API_URL  Leaderboard API URL (default: http://localhost:3000)

EXAMPLES:
  # Interactive: pick models from a list
  elastic-quest benchmark --pick

  # Benchmark multiple models at once via OpenRouter
  elastic-quest benchmark -m openrouter:openai/gpt-4o -m openrouter:anthropic/claude-sonnet-4

  # Direct provider benchmark
  elastic-quest benchmark --model openai:gpt-4o

  # Filter to specific domain
  elastic-quest benchmark --pick --domain aggregations -v

  # View results
  elastic-quest leaderboard
  elastic-quest compare openrouter:openai/gpt-4o openrouter:anthropic/claude-sonnet-4
`;
  process.stderr.write(help);
}

async function submitToLeaderboard(result: BenchmarkResult, apiUrl?: string): Promise<void> {
  const url = apiUrl ?? DEFAULT_API_URL;
  try {
    const response = await fetch(`${url}/api/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelId: result.modelId,
        modelName: result.modelName,
        provider: result.provider,
        totalScore: result.totalScore,
        maxPossibleScore: result.maxPossibleScore,
        percentage: result.percentage,
        totalChallenges: result.totalChallenges,
        correctChallenges: result.correctChallenges,
        avgLatencyMs: result.avgLatencyMs,
        totalInputTokens: result.totalInputTokens,
        totalOutputTokens: result.totalOutputTokens,
        domainScores: result.domainScores,
        difficultyScores: result.difficultyScores,
        challengeScores: result.challengeScores.map((cs) => ({
          challengeId: cs.challengeId,
          domain: cs.domain,
          difficulty: cs.difficulty,
          title: cs.title,
          score: cs.score,
          maxScore: cs.maxScore,
          correct: cs.correct,
          feedback: cs.feedback,
          latencyMs: cs.latencyMs,
        })),
      }),
    });
    if (response.ok) {
      process.stderr.write(`  Submitted to leaderboard at ${url}\n`);
    } else {
      process.stderr.write(`  Could not submit to leaderboard (${response.status})\n`);
    }
  } catch {
    // Silently skip if API is not reachable
    process.stderr.write(`  Leaderboard API not reachable at ${url} (skipping submission)\n`);
  }
}

async function runBenchmark(parsed: ParsedArgs): Promise<void> {
  let modelIds = parsed.modelIds ?? [];

  // Interactive picker mode
  if (parsed.interactive) {
    try {
      const selected = await pickModels(parsed.apiKey);
      modelIds = selected.map((id) => `openrouter:${id}`);
    } catch (err) {
      process.stderr.write(`\nError: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  }

  if (modelIds.length === 0) {
    process.stderr.write('Error: No models specified.\n');
    process.stderr.write('Usage:\n');
    process.stderr.write('  elastic-quest benchmark --pick                    (interactive)\n');
    process.stderr.write('  elastic-quest benchmark --model openrouter:openai/gpt-4o  (direct)\n');
    process.exit(1);
  }

  // Auto-provision Elastic Cloud if requested
  let cloudDeploymentId: string | undefined;
  let essApiKey: string | undefined;

  if (parsed.realEs) {
    essApiKey = parsed.essApiKey ?? process.env.ESS_API_KEY ?? '';
    if (!essApiKey) {
      process.stderr.write('Error: --real-es requires ESS_API_KEY env var or --ess-api-key flag.\n');
      process.stderr.write('Get an API key from https://cloud.elastic.co/account/keys\n');
      process.exit(1);
    }
    try {
      const deployment = await createDeployment({
        apiKey: essApiKey,
        region: parsed.essRegion,
      });
      cloudDeploymentId = deployment.id;
      // Override ES config for the benchmark runner to use
      parsed.esConfig = {
        node: deployment.esUrl,
        username: 'elastic',
        password: deployment.esPassword,
      };
      parsed.mode = 'real';
      process.stderr.write(`  Elasticsearch URL: ${deployment.esUrl}\n\n`);
    } catch (error) {
      process.stderr.write(
        `\nFailed to provision Elastic Cloud: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exit(1);
    }
  }

  const store = new BenchmarkStore();
  const results: BenchmarkResult[] = [];

  try {
    for (let i = 0; i < modelIds.length; i++) {
      const modelId = modelIds[i];
      const progress = modelIds.length > 1 ? ` [Model ${i + 1}/${modelIds.length}]` : '';

      process.stderr.write(`\n${'═'.repeat(70)}\n`);
      process.stderr.write(`  ElasticQuest Benchmark${progress}\n`);
      process.stderr.write(`  Model: ${modelId}\n`);
      process.stderr.write(`  Backend: ${parsed.realEs ? 'Elastic Cloud' : 'Simulated'}\n`);
      if (parsed.domains) process.stderr.write(`  Domains: ${parsed.domains.join(', ')}\n`);
      if (parsed.difficulties) process.stderr.write(`  Difficulties: ${parsed.difficulties.join(', ')}\n`);
      process.stderr.write(`${'═'.repeat(70)}\n\n`);

      try {
        const model = createModelAdapter(modelId, parsed.apiKey, parsed.baseUrl);
        const config: BenchmarkConfig = {
          modelId,
          domains: parsed.domains,
          difficulties: parsed.difficulties,
          verbose: parsed.verbose,
        };

        const runner = new BenchmarkRunner(model, config);
        const result = await runner.run();

        store.addResult(result);
        results.push(result);

        process.stderr.write(formatResult(result));

        // Submit to public leaderboard
        if (!parsed.noSubmit) {
          await submitToLeaderboard(result, parsed.apiUrl);
        }
      } catch (error) {
        process.stderr.write(
          `\nError benchmarking ${modelId}: ${error instanceof Error ? error.message : String(error)}\n`,
        );
        // Continue to next model
      }
    }
  } finally {
    // Always tear down Elastic Cloud deployment if we created one
    if (cloudDeploymentId && essApiKey) {
      await destroyDeployment(essApiKey, cloudDeploymentId);
    }
  }

  // Show leaderboard if multiple models
  if (results.length > 1) {
    process.stderr.write('\n');
    process.stderr.write(formatLeaderboard(store.getLeaderboard()));
  }

  // Output all results as JSON to stdout
  const output = results.length === 1 ? results[0] : results;
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

function showLeaderboard(): void {
  const store = new BenchmarkStore();
  const rows = store.getLeaderboard();
  process.stderr.write(formatLeaderboard(rows));
}

function showComparison(models?: [string, string]): void {
  if (!models || models.length < 2) {
    process.stderr.write('Usage: elastic-quest compare <modelA> <modelB>\n');
    process.stderr.write('Example: elastic-quest compare openrouter:openai/gpt-4o openrouter:anthropic/claude-sonnet-4\n');
    process.exit(1);
  }

  const store = new BenchmarkStore();
  const { a, b } = store.getModelComparison(models[0], models[1]);

  if (!a) {
    process.stderr.write(`No results found for "${models[0]}". Run benchmark first.\n`);
    process.exit(1);
  }
  if (!b) {
    process.stderr.write(`No results found for "${models[1]}". Run benchmark first.\n`);
    process.exit(1);
  }

  process.stderr.write(formatComparison(a, b));
}

async function runPlay(parsed: ParsedArgs): Promise<void> {
  let backend: ElasticBackend;
  if (parsed.mode === 'real') {
    if (!parsed.esConfig) {
      process.stderr.write('Error: Real mode requires --es-node or --es-cloud-id\n');
      process.exit(1);
    }
    backend = new RealBackend(parsed.esConfig);
    process.stderr.write('[ElasticQuest] Using real Elasticsearch backend\n');
  } else {
    backend = new SimulatedBackend();
    process.stderr.write('[ElasticQuest] Using simulated Elasticsearch backend\n');
  }

  const challenges = getAllChallenges();
  const engine = new GameEngine(backend, challenges);
  const server = new GameServer(engine);
  await server.start();
}

async function main(): Promise<void> {
  const parsed = parseArgs();

  switch (parsed.command) {
    case 'benchmark':
      await runBenchmark(parsed);
      break;
    case 'leaderboard':
      showLeaderboard();
      break;
    case 'compare':
      showComparison(parsed.compareModels);
      break;
    case 'help':
      printHelp();
      break;
    case 'play':
    default:
      await runPlay(parsed);
      break;
  }
}

main().catch((error) => {
  process.stderr.write(`Fatal error: ${error}\n`);
  process.exit(1);
});
