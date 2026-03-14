// Core types for ElasticQuest

// --- Elasticsearch-like types ---

export interface Document {
  _id: string;
  _index: string;
  _source: Record<string, unknown>;
  _score?: number;
}

export interface SearchHit {
  _id: string;
  _index: string;
  _score: number;
  _source: Record<string, unknown>;
  highlight?: Record<string, string[]>;
}

export interface SearchResponse {
  hits: {
    total: { value: number; relation: string };
    max_score: number | null;
    hits: SearchHit[];
  };
  aggregations?: Record<string, AggregationResult>;
  took: number;
}

export interface AggregationResult {
  buckets?: AggBucket[];
  value?: number;
  doc_count?: number;
  [key: string]: unknown;
}

export interface AggBucket {
  key: string | number;
  doc_count: number;
  [key: string]: unknown;
}

export interface IndexMapping {
  properties: Record<string, MappingProperty>;
}

export interface MappingProperty {
  type: string;
  analyzer?: string;
  fields?: Record<string, MappingProperty>;
  dims?: number;
  similarity?: string;
  format?: string;
  properties?: Record<string, MappingProperty>;
}

export interface IngestPipeline {
  description: string;
  processors: PipelineProcessor[];
}

export interface PipelineProcessor {
  [type: string]: {
    field?: string;
    target_field?: string;
    value?: unknown;
    patterns?: string[];
    [key: string]: unknown;
  };
}

export interface BulkOperation {
  index?: { _index: string; _id?: string };
  create?: { _index: string; _id?: string };
  update?: { _index: string; _id: string };
  delete?: { _index: string; _id: string };
}

// --- ES|QL types ---

export interface EsqlResponse {
  columns: Array<{ name: string; type: string }>;
  values: unknown[][];
}

// --- Game types ---

export type Domain =
  | 'full-text-search'
  | 'ingest-indexing'
  | 'aggregations'
  | 'observability'
  | 'vector-search'
  | 'security'
  | 'esql';

export type Difficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface Challenge {
  id: string;
  domain: Domain;
  difficulty: Difficulty;
  title: string;
  description: string;
  hints: string[];
  indexName: string;
  seedData: Document[];
  mapping?: IndexMapping;
  pipeline?: IngestPipeline;
  validate: (response: SearchResponse, backend: ElasticBackend) => Promise<ValidationResult>;
  maxScore: number;
  timeLimitMs: number;
  multiTurn?: boolean;
  discoveryPrompt?: string;
}

// --- Scenario type (skill-aligned challenges) ---

/** Expected response format from the model */
export type ResponseFormat = 'query-dsl' | 'esql' | 'api-call';

/**
 * A Scenario is a skill-aligned challenge that can be run with or without
 * skill context injected into the prompt. Scenarios require a real Elasticsearch
 * backend (cloud or start-local) because they test ES|QL, Kibana APIs, etc.
 * that the simulated backend cannot handle.
 */
export interface Scenario {
  id: string;
  skillId: string;               // maps to agent-skills skill name
  domain: Domain;
  difficulty: Difficulty;
  title: string;
  description: string;           // task description (what the user would ask)
  hints: string[];

  // Index setup
  indexName: string;
  seedData: Document[];
  mapping?: IndexMapping;
  pipeline?: IngestPipeline;

  // Expected response format from the model
  responseFormat: ResponseFormat;

  // Validation — receives raw ES|QL or DSL response depending on format
  validate: (
    response: SearchResponse | EsqlResponse,
    backend: ElasticBackend,
  ) => Promise<ValidationResult>;

  // Scoring
  maxScore: number;
  timeLimitMs: number;

  // Multi-turn support
  multiTurn?: boolean;
  discoveryPrompt?: string;

  // Skill content paths (relative to skills repo root)
  skillPaths?: string[];         // e.g. ['elasticsearch/elasticsearch-esql/SKILL.md']
  skillReferencePaths?: string[]; // e.g. ['elasticsearch/elasticsearch-esql/references/esql-reference.md']
}

export interface ValidationResult {
  correct: boolean;
  score: number;
  maxScore: number;
  feedback: string;
  details?: Record<string, unknown>;
}

export interface ChallengeResult {
  challengeId: string;
  agentId: string;
  correct: boolean;
  score: number;
  maxScore: number;
  timeMs: number;
  feedback: string;
  timestamp: number;
}

// --- Protocol types (agent <-> game) ---

export type GameMessage =
  | WelcomeMessage
  | ChallengeMessage
  | ResultMessage
  | LeaderboardMessage
  | ErrorMessage
  | GameOverMessage;

export type AgentMessage =
  | RegisterMessage
  | AnswerMessage
  | SkipMessage
  | QueryMessage;

export interface WelcomeMessage {
  type: 'welcome';
  gameId: string;
  totalChallenges: number;
  domains: Domain[];
  rules: string;
}

export interface ChallengeMessage {
  type: 'challenge';
  id: string;
  domain: Domain;
  difficulty: Difficulty;
  title: string;
  description: string;
  hints: string[];
  indexName: string;
  mapping: IndexMapping | null;
  sampleDocs: Record<string, unknown>[];
  timeLimitMs: number;
  maxScore: number;
  challengeNumber: number;
  totalChallenges: number;
}

export interface ResultMessage {
  type: 'result';
  challengeId: string;
  correct: boolean;
  score: number;
  maxScore: number;
  timeMs: number;
  feedback: string;
  totalScore: number;
  rank: number;
}

export interface LeaderboardMessage {
  type: 'leaderboard';
  entries: LeaderboardEntry[];
}

export interface ErrorMessage {
  type: 'error';
  message: string;
  challengeId?: string;
}

export interface GameOverMessage {
  type: 'game_over';
  totalScore: number;
  maxPossibleScore: number;
  rank: number;
  results: ChallengeResult[];
  leaderboard: LeaderboardEntry[];
}

export interface RegisterMessage {
  type: 'register';
  agentId: string;
  agentName: string;
}

export interface AnswerMessage {
  type: 'answer';
  challengeId: string;
  query: Record<string, unknown>;
}

export interface SkipMessage {
  type: 'skip';
  challengeId: string;
}

export interface QueryMessage {
  type: 'query';
  challengeId: string;
  method: 'search' | 'index' | 'bulk' | 'get' | 'count' | 'mapping';
  params: Record<string, unknown>;
}

// --- Leaderboard ---

export interface LeaderboardEntry {
  agentId: string;
  agentName: string;
  totalScore: number;
  challengesCompleted: number;
  challengesCorrect: number;
  averageTimeMs: number;
  timestamp: number;
}

// --- Elastic backend interface ---

export interface ElasticBackend {
  mode: 'simulated' | 'real';

  createIndex(name: string, mapping?: IndexMapping): Promise<void>;
  deleteIndex(name: string): Promise<void>;
  indexExists(name: string): Promise<boolean>;
  getMapping(name: string): Promise<IndexMapping | null>;

  indexDocument(index: string, id: string, doc: Record<string, unknown>): Promise<void>;
  bulkIndex(operations: Array<{ index: string; id: string; doc: Record<string, unknown> }>): Promise<void>;
  getDocument(index: string, id: string): Promise<Document | null>;

  search(index: string, query: Record<string, unknown>): Promise<SearchResponse>;
  count(index: string, query?: Record<string, unknown>): Promise<number>;

  /** Execute an ES|QL query. Only available on real backends. */
  esql?(query: string): Promise<EsqlResponse>;

  putPipeline(id: string, pipeline: IngestPipeline): Promise<void>;
  simulatePipeline(id: string, docs: Record<string, unknown>[]): Promise<Record<string, unknown>[]>;

  reset(): Promise<void>;
}
