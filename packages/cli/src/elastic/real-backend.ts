import { Client } from '@elastic/elasticsearch';
import type {
  ElasticBackend,
  Document,
  SearchResponse,
  IndexMapping,
  IngestPipeline,
} from '../types';

export interface RealBackendConfig {
  node: string;
  apiKey?: string;
  username?: string;
  password?: string;
  cloudId?: string;
}

export class RealBackend implements ElasticBackend {
  mode: 'real' = 'real';
  private client: Client;

  constructor(config: RealBackendConfig) {
    const clientOpts: Record<string, unknown> = {};

    if (config.cloudId) {
      clientOpts.cloud = { id: config.cloudId };
    } else {
      clientOpts.node = config.node;
    }

    if (config.apiKey) {
      clientOpts.auth = { apiKey: config.apiKey };
    } else if (config.username && config.password) {
      clientOpts.auth = { username: config.username, password: config.password };
    }

    this.client = new Client(clientOpts as ConstructorParameters<typeof Client>[0]);
  }

  async createIndex(name: string, mapping?: IndexMapping): Promise<void> {
    const exists = await this.client.indices.exists({ index: name });
    if (exists) {
      await this.client.indices.delete({ index: name });
    }
    const params: { index: string; body?: unknown } = { index: name };
    if (mapping) {
      params.body = { mappings: mapping };
    }
    await this.client.indices.create(params as Parameters<typeof this.client.indices.create>[0]);
  }

  async deleteIndex(name: string): Promise<void> {
    const exists = await this.client.indices.exists({ index: name });
    if (exists) {
      await this.client.indices.delete({ index: name });
    }
  }

  async indexExists(name: string): Promise<boolean> {
    return await this.client.indices.exists({ index: name });
  }

  async getMapping(name: string): Promise<IndexMapping | null> {
    try {
      const response = await this.client.indices.getMapping({ index: name });
      const indexMapping = response[name];
      return (indexMapping?.mappings as IndexMapping) ?? null;
    } catch {
      return null;
    }
  }

  async indexDocument(index: string, id: string, doc: Record<string, unknown>): Promise<void> {
    await this.client.index({
      index,
      id,
      body: doc,
      refresh: 'wait_for',
    });
  }

  async bulkIndex(
    operations: Array<{ index: string; id: string; doc: Record<string, unknown> }>,
  ): Promise<void> {
    if (operations.length === 0) return;

    const body: Array<Record<string, unknown>> = [];
    for (const op of operations) {
      body.push({ index: { _index: op.index, _id: op.id } });
      body.push(op.doc);
    }

    const result = await this.client.bulk({ body, refresh: 'wait_for' });
    if (result.errors) {
      const firstError = result.items.find((item) => item.index?.error);
      throw new Error(`Bulk indexing error: ${JSON.stringify(firstError?.index?.error)}`);
    }
  }

  async getDocument(index: string, id: string): Promise<Document | null> {
    try {
      const result = await this.client.get({ index, id });
      return {
        _id: result._id,
        _index: result._index,
        _source: result._source as Record<string, unknown>,
      };
    } catch {
      return null;
    }
  }

  async search(index: string, body: Record<string, unknown>): Promise<SearchResponse> {
    const result = await this.client.search({
      index,
      body,
    });

    return {
      hits: {
        total: result.hits.total as { value: number; relation: string },
        max_score: result.hits.max_score ?? null,
        hits: result.hits.hits.map((hit) => ({
          _id: hit._id!,
          _index: hit._index,
          _score: hit._score ?? 0,
          _source: hit._source as Record<string, unknown>,
          highlight: hit.highlight as Record<string, string[]> | undefined,
        })),
      },
      aggregations: result.aggregations as Record<string, unknown> as SearchResponse['aggregations'],
      took: result.took,
    };
  }

  async count(index: string, query?: Record<string, unknown>): Promise<number> {
    const result = await this.client.count({
      index,
      body: query ? { query } : undefined,
    });
    return result.count;
  }

  async putPipeline(id: string, pipeline: IngestPipeline): Promise<void> {
    await this.client.ingest.putPipeline({
      id,
      body: pipeline,
    });
  }

  async simulatePipeline(
    id: string,
    docs: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]> {
    const result = await this.client.ingest.simulate({
      id,
      body: {
        docs: docs.map((doc) => ({ _source: doc })),
      },
    });

    return (result.docs as Array<{ doc: { _source: Record<string, unknown> } }>).map(
      (d) => d.doc._source,
    );
  }

  async reset(): Promise<void> {
    // Delete all game-related indices (prefixed with eq-)
    try {
      await this.client.indices.delete({ index: 'eq-*' });
    } catch {
      // Ignore if no indices exist
    }
  }
}
