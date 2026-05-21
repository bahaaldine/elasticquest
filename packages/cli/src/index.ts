#!/usr/bin/env node

import {
  SimulatedBackend, RealBackend, startLocal, stopLocal,
  getLicense, uploadLicense, startTrialLicense, buildAuthHeader,
} from './elastic';
import type { RealBackendConfig, StartLocalResult, LicenseInfo } from './elastic';
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
  noHints?: boolean;            // strip hints from prompts
  realEs?: boolean;             // auto-provision Elastic Cloud
  essApiKey?: string;           // Elastic Cloud API key
  essRegion?: string;           // Elastic Cloud region
  skillContextPath?: string;    // path to SKILL.md for A/B benchmarking
  language?: 'dsl' | 'esql';    // query language mode

  // Scenario mode flags
  scenarios?: boolean;          // --scenarios: run skill-aligned scenarios
  skills?: boolean;             // --skills: inject skill content into prompts
  skillsPath?: string;          // --skills-path: path to agent-skills repo
  compareSkills?: boolean;      // --compare-skills: run with and without skills
  startLocal?: boolean;         // --start-local: use Docker for local ES
  runs?: number;                // --runs N: run each scenario N times for consistency
  licenseFile?: string;         // --license-file: path to ES license JSON
  startTrial?: boolean;         // --start-trial: activate 30-day trial license
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
      case '--no-hints':
        result.noHints = true;
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
      case '--skill-context':
        result.skillContextPath = args[++i];
        break;
      case '--language':
        result.language = args[++i] as 'dsl' | 'esql';
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
      case '--scenarios':
        result.scenarios = true;
        break;
      case '--skills':
        result.skills = true;
        break;
      case '--skills-path':
        result.skillsPath = args[++i];
        break;
      case '--compare-skills':
        result.compareSkills = true;
        result.scenarios = true; // implies scenario mode
        break;
      case '--start-local':
        result.startLocal = true;
        break;
      case '--runs':
        result.runs = parseInt(args[++i], 10) || 1;
        break;
      case '--license-file':
        result.licenseFile = args[++i];
        break;
      case '--start-trial':
        result.startTrial = true;
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
                           observability, vector-search, security, esql
  --difficulty <level>   Filter to difficulty (can repeat). Options:
                           beginner, intermediate, advanced, expert
  --verbose, -v          Show detailed feedback for failed challenges
  --real-es              Auto-provision Elastic Cloud (requires ESS_API_KEY)
  --start-local          Use Docker/Podman for local Elasticsearch (start-local)
  --ess-api-key <key>    Elastic Cloud API key
  --ess-region <region>  Elastic Cloud region (default: gcp-us-central1)
  --no-submit            Skip submitting results to the public leaderboard
  --no-hints             Strip all hints from prompts (raw difficulty mode)
  --language <dsl|esql>  Query language mode (default: dsl)
                         In esql mode, existing DSL challenges are run using ES|QL
  --skill-context <path> Path to SKILL.md to inject as reference context
                         (for A/B benchmarking with/without skill)

SCENARIO OPTIONS (skill-aligned challenges):
  --scenarios            Run skill-aligned scenarios (requires real ES)
  --skills               Inject Elastic Agent Skills into prompts
  --skills-path <path>   Path to agent-skills repo or installation
  --compare-skills       Run scenarios with and without skills for comparison
  --runs <N>             Run each scenario N times to measure consistency

LICENSE OPTIONS (for enterprise-gated scenarios):
  --license-file <path>  Upload an Enterprise/Platinum license to ES before benchmarking
  --start-trial          Activate a 30-day trial license (once per major version)

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

  # ES|QL language mode: run existing challenges using ES|QL
  elastic-quest benchmark --pick --language esql
  elastic-quest benchmark --pick --language esql --skill-context /path/to/SKILL.md

  # ES|QL-only challenges (DISSECT, CATEGORIZE, etc.)
  elastic-quest benchmark --pick --domain esql

  # Skill-aligned scenarios (requires Docker or Elastic Cloud)
  elastic-quest benchmark -m openrouter:openai/gpt-4o --scenarios --start-local
  elastic-quest benchmark -m openrouter:openai/gpt-4o --scenarios --real-es
  elastic-quest benchmark -m openrouter:openai/gpt-4o --scenarios --skills --start-local
  elastic-quest benchmark -m openrouter:openai/gpt-4o --scenarios --compare-skills --start-local
`;
  process.stderr.write(help);
}

async function submitToLeaderboard(result: BenchmarkResult, apiUrl?: string): Promise<void> {
  const adminKey = process.env.ELASTIC_QUEST_ADMIN_KEY ?? '';
  if (!adminKey) {
    // No admin key = no public submission. Results are still saved locally and output to stdout.
    return;
  }

  const url = apiUrl ?? DEFAULT_API_URL;
  try {
    const response = await fetch(`${url}/api/scores`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': adminKey,
      },
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
        costUsd: result.costUsd,
        skillsEnabled: result.skillsEnabled,
        backendType: result.backendType,
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
          evalSteps: cs.evalSteps,
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

  // Validate: scenarios require a real backend
  if (parsed.scenarios && !parsed.realEs && !parsed.startLocal && !parsed.esConfig) {
    process.stderr.write(
      'Error: --scenarios requires a real Elasticsearch backend.\n' +
        'Use --start-local (Docker/Podman) or --real-es (Elastic Cloud).\n',
    );
    process.exit(1);
  }

  // Provision the backend
  let cloudDeploymentId: string | undefined;
  let essApiKey: string | undefined;
  let startLocalResult: StartLocalResult | undefined;
  let realBackend: ElasticBackend | undefined;
  let backendLabel = 'Simulated';

  if (parsed.startLocal) {
    // Docker-based local Elasticsearch
    try {
      startLocalResult = await startLocal();
      realBackend = startLocalResult.backend;
      parsed.mode = 'real';
      backendLabel = 'start-local (Docker)';
      process.stderr.write(`  Elasticsearch URL: ${startLocalResult.esUrl}\n\n`);
    } catch (error) {
      process.stderr.write(
        `\nFailed to start local Elasticsearch: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exit(1);
    }
  } else if (parsed.realEs) {
    // Elastic Cloud
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
      parsed.esConfig = {
        node: deployment.esUrl,
        username: 'elastic',
        password: deployment.esPassword,
      };
      parsed.mode = 'real';
      backendLabel = 'Elastic Cloud';
      process.stderr.write(`  Elasticsearch URL: ${deployment.esUrl}\n\n`);
    } catch (error) {
      process.stderr.write(
        `\nFailed to provision Elastic Cloud: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exit(1);
    }
  } else if (parsed.esConfig) {
    // Direct ES connection (--es-node / --es-api-key)
    realBackend = new RealBackend(parsed.esConfig);
    parsed.mode = 'real';
    backendLabel = `Real ES (${parsed.esConfig.node || 'cloud'})`;
  }

  // Handle license management for real backends
  let licenseLevel = 'basic';
  if (parsed.mode === 'real' && parsed.scenarios) {
    const esUrl = startLocalResult?.esUrl ?? parsed.esConfig?.node ?? '';
    if (esUrl) {
      try {
        const authHeader = buildAuthHeader({
          apiKey: parsed.esConfig?.apiKey ?? startLocalResult?.apiKey,
          username: parsed.esConfig?.username,
          password: parsed.esConfig?.password,
        });

        // Upload license file if provided
        if (parsed.licenseFile) {
          const licenseInfo = await uploadLicense(esUrl, authHeader, parsed.licenseFile);
          licenseLevel = licenseInfo.type.toLowerCase();
          process.stderr.write(`  License: ${licenseInfo.type} (${licenseInfo.status})\n`);
        }
        // Start trial if requested
        else if (parsed.startTrial) {
          const licenseInfo = await startTrialLicense(esUrl, authHeader);
          licenseLevel = licenseInfo.type.toLowerCase();
          process.stderr.write(`  License: ${licenseInfo.type} (${licenseInfo.status})\n`);
        }
        // Just check current license
        else {
          const licenseInfo = await getLicense(esUrl, authHeader);
          licenseLevel = licenseInfo.type.toLowerCase();
          process.stderr.write(`  License: ${licenseInfo.type} (${licenseInfo.status})\n`);
        }
      } catch (err) {
        process.stderr.write(
          `  Warning: could not check license: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.stderr.write('  Assuming basic license. Enterprise scenarios may be skipped.\n');
      }
    }
    process.stderr.write('\n');
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
      process.stderr.write(`  Backend: ${backendLabel}\n`);
      process.stderr.write(`  License: ${licenseLevel}\n`);
      if (parsed.scenarios) process.stderr.write(`  Mode: Scenarios (skill-aligned)\n`);
      if (parsed.skills) process.stderr.write(`  Skills: enabled\n`);
      if (parsed.runs && parsed.runs > 1) process.stderr.write(`  Runs: ${parsed.runs} (consistency mode)\n`);
      if (parsed.domains) process.stderr.write(`  Domains: ${parsed.domains.join(', ')}\n`);
      if (parsed.difficulties) process.stderr.write(`  Difficulties: ${parsed.difficulties.join(', ')}\n`);
      if (parsed.language) process.stderr.write(`  Language: ${parsed.language}\n`);
      if (parsed.noHints) process.stderr.write(`  Hints: disabled\n`);
      if (parsed.skillContextPath) process.stderr.write(`  Skill context: ${parsed.skillContextPath}\n`);
      process.stderr.write(`${'═'.repeat(70)}\n\n`);

      try {
        const model = createModelAdapter(modelId, parsed.apiKey, parsed.baseUrl);
        const config: BenchmarkConfig = {
          modelId,
          domains: parsed.domains,
          difficulties: parsed.difficulties,
          verbose: parsed.verbose,
          backendMode: (parsed.realEs || parsed.esConfig?.node || parsed.startLocal) ? 'real' : 'simulated',
          esNode: parsed.esConfig?.node,
          esApiKey: parsed.esConfig?.apiKey,
          esUsername: parsed.esConfig?.username,
          esPassword: parsed.esConfig?.password,
          skillContextPath: parsed.skillContextPath,
          language: parsed.language,
          noHints: parsed.noHints,
          scenarioMode: parsed.scenarios,
          skillsEnabled: parsed.skills,
          skillsPath: parsed.skillsPath,
          compareSkills: parsed.compareSkills,
          licenseLevel,
        };

        const newResults: BenchmarkResult[] = [];

        if (parsed.scenarios) {
          const numRuns = parsed.runs ?? 1;

          // Scenario mode: run skill-aligned challenges
          if (parsed.compareSkills) {
            // Baseline runs
            process.stderr.write('  --- Baseline (no skills) ---\n\n');
            const baselineConfig = { ...config, skillsEnabled: false };
            const baselineRunner = new BenchmarkRunner(model, baselineConfig, realBackend);
            const baselineResult = numRuns > 1
              ? await baselineRunner.runScenariosWithConsistency(numRuns)
              : await baselineRunner.runScenarios();
            baselineResult.backendType = parsed.startLocal ? 'start-local' : 'cloud';
            results.push(baselineResult);
            newResults.push(baselineResult);
            process.stderr.write(formatResult(baselineResult));

            // Skills runs
            process.stderr.write('\n  --- With Skills ---\n\n');
            const skillsConfig = { ...config, skillsEnabled: true };
            const skillsRunner = new BenchmarkRunner(model, skillsConfig, realBackend);
            const skillsResult = numRuns > 1
              ? await skillsRunner.runScenariosWithConsistency(numRuns)
              : await skillsRunner.runScenarios();
            skillsResult.backendType = parsed.startLocal ? 'start-local' : 'cloud';
            results.push(skillsResult);
            newResults.push(skillsResult);
            process.stderr.write(formatResult(skillsResult));

            // Show comparison
            const uplift = skillsResult.percentage - baselineResult.percentage;
            process.stderr.write(`\n${'─'.repeat(50)}\n`);
            process.stderr.write(`  Skill Uplift: ${uplift >= 0 ? '+' : ''}${uplift}%\n`);
            process.stderr.write(`  Baseline: ${baselineResult.percentage}% | With Skills: ${skillsResult.percentage}%\n`);
            if (baselineResult.consistency && skillsResult.consistency) {
              process.stderr.write(`  Consistency: baseline ${baselineResult.consistency.consistencyPercentage}% vs skills ${skillsResult.consistency.consistencyPercentage}%\n`);
            }
            process.stderr.write(`${'─'.repeat(50)}\n`);
          } else {
            const runner = new BenchmarkRunner(model, config, realBackend);
            const result = numRuns > 1
              ? await runner.runScenariosWithConsistency(numRuns)
              : await runner.runScenarios();
            result.backendType = parsed.startLocal ? 'start-local' : 'cloud';

            store.addResult(result);
            results.push(result);
            newResults.push(result);
            process.stderr.write(formatResult(result));
          }
        } else {
          // Standard challenge mode
          const runner = new BenchmarkRunner(model, config, realBackend);
          const result = await runner.run();

          store.addResult(result);
          results.push(result);
          newResults.push(result);
          process.stderr.write(formatResult(result));
        }

        // Submit new results to public leaderboard
        if (!parsed.noSubmit) {
          for (const result of newResults) {
            await submitToLeaderboard(result, parsed.apiUrl);
          }
        }
      } catch (error) {
        process.stderr.write(
          `\nError benchmarking ${modelId}: ${error instanceof Error ? error.message : String(error)}\n`,
        );
        // Continue to next model
      }
    }
  } finally {
    // Always tear down provisioned infrastructure
    if (cloudDeploymentId && essApiKey) {
      await destroyDeployment(essApiKey, cloudDeploymentId);
    }
    // Note: we don't stop start-local by default — it's reusable across runs
  }

  // Show leaderboard if multiple models
  if (results.length > 1 && !parsed.compareSkills) {
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
