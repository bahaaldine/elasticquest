import type { ModelAdapter, ModelResponse } from './types';
import { OpenRouterAdapter } from './openrouter';

// --- OpenAI-compatible adapter (works with OpenAI, Azure, OpenRouter, etc.) ---

export class OpenAIAdapter implements ModelAdapter {
  name: string;
  provider = 'openai';
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(model: string, apiKey?: string, baseUrl?: string) {
    this.model = model;
    this.name = model;
    this.apiKey = apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.baseUrl = baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';

    if (!this.apiKey) {
      throw new Error('OpenAI API key required. Set OPENAI_API_KEY env var or pass --api-key.');
    }
  }

  async complete(prompt: string): Promise<ModelResponse> {
    const start = Date.now();
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an Elasticsearch expert. When given a challenge, respond ONLY with a valid JSON object containing the Elasticsearch query body. No explanation, no markdown, just the JSON query object.',
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
      throw new Error(`OpenAI API error (${response.status}): ${error}`);
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

// --- Anthropic adapter ---

export class AnthropicAdapter implements ModelAdapter {
  name: string;
  provider = 'anthropic';
  private apiKey: string;
  private model: string;

  constructor(model: string, apiKey?: string) {
    this.model = model;
    this.name = model;
    this.apiKey = apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';

    if (!this.apiKey) {
      throw new Error('Anthropic API key required. Set ANTHROPIC_API_KEY env var or pass --api-key.');
    }
  }

  async complete(prompt: string): Promise<ModelResponse> {
    const start = Date.now();
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2048,
        temperature: 0,
        system: 'You are an Elasticsearch expert. When given a challenge, respond ONLY with a valid JSON object containing the Elasticsearch query body. No explanation, no markdown, just the JSON query object.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const latencyMs = Date.now() - start;

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${error}`);
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
      usage?: { input_tokens: number; output_tokens: number };
    };

    const text = data.content.find((c) => c.type === 'text')?.text ?? '';

    return {
      content: text,
      inputTokens: data.usage?.input_tokens,
      outputTokens: data.usage?.output_tokens,
      latencyMs,
    };
  }
}

// --- Ollama adapter (local models) ---

export class OllamaAdapter implements ModelAdapter {
  name: string;
  provider = 'ollama';
  private model: string;
  private baseUrl: string;

  constructor(model: string, baseUrl?: string) {
    this.model = model;
    this.name = model;
    this.baseUrl = baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  }

  async complete(prompt: string): Promise<ModelResponse> {
    const start = Date.now();
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt: `You are an Elasticsearch expert. When given a challenge, respond ONLY with a valid JSON object containing the Elasticsearch query body. No explanation, no markdown, just the JSON query object.\n\n${prompt}`,
        stream: false,
        options: { temperature: 0 },
      }),
    });

    const latencyMs = Date.now() - start;

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${error}`);
    }

    const data = (await response.json()) as {
      response: string;
      prompt_eval_count?: number;
      eval_count?: number;
    };

    return {
      content: data.response,
      inputTokens: data.prompt_eval_count,
      outputTokens: data.eval_count,
      latencyMs,
    };
  }
}

// --- Factory ---

export function createModelAdapter(
  modelId: string,
  apiKey?: string,
  baseUrl?: string,
): ModelAdapter {
  const [provider, ...rest] = modelId.split(':');
  const model = rest.join(':');

  if (!model) {
    throw new Error(
      `Invalid model ID "${modelId}". Use format: provider:model (e.g. openai:gpt-4o, anthropic:claude-sonnet-4, ollama:llama3)`,
    );
  }

  switch (provider) {
    case 'openai':
      return new OpenAIAdapter(model, apiKey, baseUrl);
    case 'anthropic':
      return new AnthropicAdapter(model, apiKey);
    case 'ollama':
      return new OllamaAdapter(model, baseUrl);
    case 'openrouter': {
      // openrouter:openai/gpt-4o -> OpenRouter with model "openai/gpt-4o"
      return new OpenRouterAdapter(model, apiKey);
    }
    default:
      // Treat unknown providers as OpenAI-compatible
      const adapter = new OpenAIAdapter(model, apiKey, baseUrl);
      adapter.provider = provider;
      return adapter;
  }
}
