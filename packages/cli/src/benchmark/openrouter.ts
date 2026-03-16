import type { ModelAdapter, ModelResponse } from './types';
import * as readline from 'readline';

// --- OpenRouter model info ---

export interface OpenRouterModel {
  id: string;
  name: string;
  created?: number;  // unix timestamp
  pricing: {
    prompt: string;   // cost per token
    completion: string;
  };
  context_length: number;
  top_provider?: {
    max_completion_tokens?: number;
  };
}

// --- Fetch available models from OpenRouter ---

export async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  const response = await fetch('https://openrouter.ai/api/v1/models');
  if (!response.ok) {
    throw new Error(`Failed to fetch OpenRouter models: ${response.status}`);
  }
  const data = (await response.json()) as { data: OpenRouterModel[] };
  return data.data;
}

// --- Providers we care about for benchmarking ---

const BENCHMARK_PROVIDERS = new Set([
  'anthropic', 'openai', 'google', 'meta-llama',
  'deepseek', 'x-ai', 'qwen', 'mistralai',
  'cohere', 'ai21', 'nvidia', 'microsoft',
]);

/**
 * Build the popular models list dynamically from the OpenRouter catalog.
 * For each provider, takes the N most recent models (by created timestamp).
 * Falls back to a static list if the dynamic fetch fails.
 */
export function buildPopularList(
  allModels: OpenRouterModel[],
  maxPerProvider = 3,
): string[] {
  // Filter out non-generative, non-benchmark-worthy models
  const EXCLUDED_PATTERNS = [
    'guard', 'shield', 'embed', 'rerank', 'tts', 'whisper',
    'moderation', 'safety', 'classifier', 'vision-preview',
  ];

  const candidates = allModels.filter((m) => {
    const provider = m.id.split('/')[0];
    if (!BENCHMARK_PROVIDERS.has(provider)) return false;
    if (m.id.includes(':free')) return false;
    if (m.id.includes(':extended')) return false;
    if (m.id.includes(':beta') && !m.id.includes('grok')) return false;
    // Must have a prompt price (not free/zero)
    const price = parseFloat(m.pricing.prompt);
    if (isNaN(price) || price <= 0) return false;
    // Exclude non-generative models (safety classifiers, embedders, etc.)
    const idLower = m.id.toLowerCase();
    if (EXCLUDED_PATTERNS.some((p) => idLower.includes(p))) return false;
    return true;
  });

  // Group by provider, sort each group by created (newest first)
  const byProvider = new Map<string, OpenRouterModel[]>();
  for (const m of candidates) {
    const provider = m.id.split('/')[0];
    if (!byProvider.has(provider)) byProvider.set(provider, []);
    byProvider.get(provider)!.push(m);
  }

  // Sort each provider's models by created desc (newest first)
  for (const models of byProvider.values()) {
    models.sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  }

  // Take top N per provider, ordered by provider importance
  const providerOrder = [
    'anthropic', 'openai', 'google', 'meta-llama',
    'deepseek', 'x-ai', 'qwen', 'mistralai',
    'cohere', 'ai21', 'nvidia', 'microsoft',
  ];

  const result: string[] = [];
  for (const provider of providerOrder) {
    const models = byProvider.get(provider);
    if (!models) continue;
    for (const m of models.slice(0, maxPerProvider)) {
      result.push(m.id);
    }
  }

  return result;
}

/** Static fallback if API fetch fails. */
export function getPopularModels(): string[] {
  return [
    'anthropic/claude-opus-4.6',
    'anthropic/claude-sonnet-4.6',
    'anthropic/claude-haiku-4.5',
    'openai/o3',
    'openai/gpt-4.1',
    'openai/gpt-4.1-mini',
    'google/gemini-2.5-pro',
    'google/gemini-2.0-flash-001',
    'meta-llama/llama-4-maverick',
    'meta-llama/llama-4-scout',
    'deepseek/deepseek-r1-0528',
    'deepseek/deepseek-chat-v3-0324',
    'x-ai/grok-4',
    'x-ai/grok-3',
    'qwen/qwen3-235b-a22b',
    'qwen/qwen3-max',
    'mistralai/mistral-large-2512',
    'mistralai/devstral-2512',
    'cohere/command-a',
  ];
}

// --- OpenRouter adapter (OpenAI-compatible) ---

export class OpenRouterAdapter implements ModelAdapter {
  name: string;
  provider: string;
  private apiKey: string;
  private modelId: string;

  constructor(modelId: string, apiKey?: string) {
    this.modelId = modelId;
    // e.g. "openai/gpt-4o" -> provider="openai", name="gpt-4o"
    const parts = modelId.split('/');
    this.provider = parts[0] ?? 'unknown';
    this.name = parts.slice(1).join('/') || modelId;
    this.apiKey = apiKey ?? process.env.OPENROUTER_API_KEY ?? '';

    if (!this.apiKey) {
      throw new Error(
        'OPENROUTER_API_KEY is not set.\n\n' +
        '  Get a free API key at: https://openrouter.ai/keys\n' +
        '  Then run:\n\n' +
        '    export OPENROUTER_API_KEY=sk-or-v1-...\n' +
        '    npx elastic-quest benchmark --pick\n',
      );
    }
  }

  async complete(prompt: string): Promise<ModelResponse> {
    const start = Date.now();
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'X-Title': 'ElasticQuest Benchmark',
      },
      body: JSON.stringify({
        model: this.modelId,
        messages: [
          {
            role: 'system',
            content:
              'You are an Elasticsearch expert. When given a challenge, respond ONLY with a valid JSON object containing the Elasticsearch query body. No explanation, no markdown, just the JSON query object.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0,
        max_tokens: 2048,
      }),
    });

    const latencyMs = Date.now() - start;

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${error}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    return {
      content: data.choices[0]?.message?.content ?? '',
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
      latencyMs,
    };
  }
}

// --- Interactive model picker ---

export async function pickModels(apiKey?: string): Promise<string[]> {
  const key = apiKey ?? process.env.OPENROUTER_API_KEY ?? '';
  if (!key) {
    process.stderr.write('\nError: OPENROUTER_API_KEY is not set.\n\n');
    process.stderr.write('  Get a free API key at: https://openrouter.ai/keys\n');
    process.stderr.write('  Then run:\n\n');
    process.stderr.write('    export OPENROUTER_API_KEY=sk-or-v1-...\n');
    process.stderr.write('    npx elastic-quest benchmark --pick\n\n');
    process.exit(1);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
    terminal: true,
  });

  const ask = (question: string): Promise<string> =>
    new Promise((resolve) => rl.question(question, resolve));

  process.stderr.write('\nFetching available models from OpenRouter...\n');

  let allModels: OpenRouterModel[];
  try {
    allModels = await fetchOpenRouterModels();
  } catch (err) {
    rl.close();
    throw new Error(`Failed to fetch models: ${err}`);
  }

  const allModelIds = new Set(allModels.map((m) => m.id));

  // Build dynamic popular list from live API data (newest per provider)
  const popular = buildPopularList(allModels, 3);
  // Fall back to static list if dynamic produces too few
  const fallback = getPopularModels().filter((id) => allModelIds.has(id));
  const displayList = popular.length >= 10 ? popular : fallback;

  const formatCost = (id: string): string => {
    const model = allModels.find((m) => m.id === id);
    return model ? `$${(parseFloat(model.pricing.prompt) * 1_000_000).toFixed(2)}/M tok` : '';
  };

  const formatAge = (id: string): string => {
    const model = allModels.find((m) => m.id === id);
    if (!model?.created) return '';
    const days = Math.floor((Date.now() / 1000 - model.created) / 86400);
    if (days === 0) return 'today';
    if (days === 1) return '1d ago';
    if (days < 30) return `${days}d ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  };

  // Group by provider for clean display
  process.stderr.write(`\n${allModels.length} models available on OpenRouter.\n`);
  process.stderr.write(`\nLatest models by provider (newest first):\n\n`);

  let currentProvider = '';
  for (let i = 0; i < displayList.length; i++) {
    const id = displayList[i];
    const provider = id.split('/')[0];
    if (provider !== currentProvider) {
      if (currentProvider) process.stderr.write('\n');
      currentProvider = provider;
    }
    const age = formatAge(id);
    const cost = formatCost(id);
    const agePad = age ? `  ${age}` : '';
    process.stderr.write(
      `  ${String(i + 1).padStart(3)}. ${id.padEnd(45)} ${cost.padEnd(15)}${agePad}\n`,
    );
  }

  process.stderr.write(`\nHow to select:\n`);
  process.stderr.write(`  Numbers:    1,3,5          (pick from list above)\n`);
  process.stderr.write(`  Model IDs:  openai/gpt-4o  (any OpenRouter model ID)\n`);
  process.stderr.write(`  Search:     opus           (fuzzy match across all ${allModels.length} models)\n`);
  process.stderr.write(`  Provider:   anthropic       (latest 5 from that provider)\n`);
  process.stderr.write(`  All:        all            (benchmark all listed models)\n\n`);

  const input = await ask('  Models to benchmark: ');
  rl.close();

  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error('No models selected.');
  }

  if (trimmed.toLowerCase() === 'all') {
    return popular;
  }

  const selected: string[] = [];
  const parts = trimmed.split(',').map((s) => s.trim()).filter(Boolean);

  for (const part of parts) {
    // Check if it's a number (index into popular list)
    const num = parseInt(part, 10);
    if (!isNaN(num) && num >= 1 && num <= popular.length) {
      selected.push(popular[num - 1]);
    } else if (part.includes('/')) {
      // Direct model ID
      if (allModelIds.has(part)) {
        selected.push(part);
      } else {
        process.stderr.write(`  Warning: model "${part}" not found on OpenRouter, skipping.\n`);
      }
    } else {
      // Check if it's a provider name (e.g., "anthropic", "openai")
      const isProvider = BENCHMARK_PROVIDERS.has(part.toLowerCase()) ||
        allModels.some((m) => m.id.split('/')[0].toLowerCase() === part.toLowerCase());

      if (isProvider) {
        // Show latest 5 from that provider
        const providerModels = allModels
          .filter((m) => m.id.split('/')[0].toLowerCase() === part.toLowerCase())
          .filter((m) => !m.id.includes(':free') && parseFloat(m.pricing.prompt) > 0)
          .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
          .slice(0, 5);
        if (providerModels.length > 0) {
          process.stderr.write(`\n  Latest from ${part}:\n`);
          for (const m of providerModels) {
            process.stderr.write(`    + ${m.id.padEnd(45)} ${formatCost(m.id)}\n`);
            selected.push(m.id);
          }
        } else {
          process.stderr.write(`  No models found for provider "${part}".\n`);
        }
      } else {
        // Fuzzy match: find all models matching the search term
        const matches = allModels.filter(
          (m) => m.id.toLowerCase().includes(part.toLowerCase()),
        );
        if (matches.length === 1) {
          selected.push(matches[0].id);
        } else if (matches.length > 1 && matches.length <= 15) {
          // Sort by newest first
          matches.sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
          process.stderr.write(`\n  Multiple matches for "${part}" (newest first):\n`);
          for (let j = 0; j < matches.length; j++) {
            process.stderr.write(`    ${String(j + 1).padStart(3)}. ${matches[j].id.padEnd(45)} ${formatCost(matches[j].id)}\n`);
          }
          for (const m of matches) {
            selected.push(m.id);
          }
          process.stderr.write(`  (Added all ${matches.length} matches.)\n`);
        } else if (matches.length > 15) {
          // Sort and show top 10
          matches.sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
          process.stderr.write(`  "${part}" matched ${matches.length} models. Showing newest 10:\n`);
          for (const m of matches.slice(0, 10)) {
            process.stderr.write(`    ${m.id.padEnd(45)} ${formatCost(m.id)}\n`);
          }
          process.stderr.write(`  Be more specific, or type a model ID directly.\n`);
        } else {
          process.stderr.write(`  Warning: no match for "${part}", skipping.\n`);
        }
      }
    }
  }

  // Deduplicate
  const unique = [...new Set(selected)];

  if (unique.length === 0) {
    throw new Error('No valid models selected.');
  }

  process.stderr.write(`\n  Selected ${unique.length} model(s):\n`);
  for (const id of unique) {
    process.stderr.write(`    - ${id.padEnd(45)} ${formatCost(id)}\n`);
  }
  process.stderr.write('\n');

  return unique;
}
