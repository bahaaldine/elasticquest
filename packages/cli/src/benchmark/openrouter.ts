import type { ModelAdapter, ModelResponse } from './types';
import * as readline from 'readline';

// --- OpenRouter model info ---

export interface OpenRouterModel {
  id: string;
  name: string;
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

// --- Popular model presets (curated for benchmarking) ---

export function getPopularModels(): string[] {
  return [
    // Anthropic
    'anthropic/claude-opus-4.6',
    'anthropic/claude-sonnet-4.6',
    'anthropic/claude-opus-4.5',
    'anthropic/claude-sonnet-4.5',
    'anthropic/claude-haiku-4.5',
    'anthropic/claude-opus-4',
    'anthropic/claude-sonnet-4',
    'anthropic/claude-3.5-sonnet',
    'anthropic/claude-3.5-haiku',
    // OpenAI
    'openai/gpt-4.1',
    'openai/gpt-4.1-mini',
    'openai/gpt-4.1-nano',
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    // Google
    'google/gemini-2.5-pro-preview',
    'google/gemini-2.0-flash-001',
    // Meta
    'meta-llama/llama-4-maverick',
    'meta-llama/llama-4-scout',
    'meta-llama/llama-3.3-70b-instruct',
    // DeepSeek
    'deepseek/deepseek-chat-v3-0324',
    'deepseek/deepseek-r1',
    // Others
    'qwen/qwen-2.5-72b-instruct',
    'mistralai/mistral-large-2411',
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
  const popular = getPopularModels().filter((id) => allModelIds.has(id));

  const formatCost = (id: string): string => {
    const model = allModels.find((m) => m.id === id);
    return model ? `$${(parseFloat(model.pricing.prompt) * 1_000_000).toFixed(2)}/M tok` : '';
  };

  // Group popular models by provider for clean display
  process.stderr.write(`\n${allModels.length} models available on OpenRouter.\n`);
  process.stderr.write(`\nPopular models:\n\n`);

  let currentProvider = '';
  for (let i = 0; i < popular.length; i++) {
    const id = popular[i];
    const provider = id.split('/')[0];
    if (provider !== currentProvider) {
      if (currentProvider) process.stderr.write('\n');
      currentProvider = provider;
    }
    process.stderr.write(
      `  ${String(i + 1).padStart(3)}. ${id.padEnd(45)} ${formatCost(id)}\n`,
    );
  }

  process.stderr.write(`\nHow to select:\n`);
  process.stderr.write(`  Numbers:    1,3,5          (pick from list above)\n`);
  process.stderr.write(`  Model IDs:  openai/gpt-4o  (any OpenRouter model ID)\n`);
  process.stderr.write(`  Search:     opus           (fuzzy match across all ${allModels.length} models)\n`);
  process.stderr.write(`  All:        all            (benchmark all popular models)\n\n`);

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
      // Fuzzy match: find all models matching the search term
      const matches = allModels.filter(
        (m) => m.id.toLowerCase().includes(part.toLowerCase()),
      );
      if (matches.length === 1) {
        selected.push(matches[0].id);
      } else if (matches.length > 1 && matches.length <= 15) {
        process.stderr.write(`\n  Multiple matches for "${part}":\n`);
        for (let j = 0; j < matches.length; j++) {
          process.stderr.write(`    ${String(j + 1).padStart(3)}. ${matches[j].id.padEnd(45)} ${formatCost(matches[j].id)}\n`);
        }
        // Pick all matches
        for (const m of matches) {
          selected.push(m.id);
        }
        process.stderr.write(`  (Added all ${matches.length} matches. Remove unwanted ones from the list.)\n`);
      } else if (matches.length > 15) {
        process.stderr.write(`  "${part}" matched ${matches.length} models. Be more specific.\n`);
        process.stderr.write(`  Top 5: ${matches.slice(0, 5).map((m) => m.id).join(', ')}\n`);
      } else {
        process.stderr.write(`  Warning: no match for "${part}", skipping.\n`);
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
