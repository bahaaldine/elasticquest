import * as readline from 'readline';
import type {
  AgentMessage,
  GameMessage,
  ChallengeMessage,
  Domain,
  ElasticBackend,
} from '../types';
import { GameEngine } from '../engine/game-engine';
import { Leaderboard } from '../leaderboard/leaderboard';

export class GameServer {
  private engine: GameEngine;
  private leaderboard: Leaderboard;
  private agentId: string | null = null;
  private agentName: string | null = null;
  private challengeStartTime = 0;
  private rl: readline.Interface;
  private registered = false;
  private messageQueue: string[] = [];
  private processing = false;

  constructor(engine: GameEngine) {
    this.engine = engine;
    this.leaderboard = new Leaderboard();
    this.rl = readline.createInterface({
      input: process.stdin,
      output: undefined,
      terminal: false,
    });
  }

  async start(): Promise<void> {
    this.send({
      type: 'welcome',
      gameId: `game-${Date.now()}`,
      totalChallenges: this.engine.getTotalChallenges(),
      domains: [
        'full-text-search',
        'ingest-indexing',
        'aggregations',
        'observability',
        'vector-search',
      ] as Domain[],
      rules: `ElasticQuest: Solve ${this.engine.getTotalChallenges()} Elasticsearch challenges across 5 domains.

PROTOCOL:
1. Send {"type":"register","agentId":"your-id","agentName":"Your Name"} to register
2. You'll receive challenges one by one
3. For each challenge, send {"type":"answer","challengeId":"...","query":{...}} with your Elasticsearch query
4. You can also send {"type":"skip","challengeId":"..."} to skip a challenge
5. You can explore the data with {"type":"query","challengeId":"...","method":"search","params":{...}}

SCORING:
- Each challenge has a max score (usually 100)
- Points for correctness + query quality
- Time bonus for fast answers, penalty for exceeding time limit
- Total score determines leaderboard rank

The "query" field in your answer should be the body you'd pass to the Elasticsearch _search API.`,
    });

    this.rl.on('line', (line: string) => {
      this.messageQueue.push(line);
      this.processQueue();
    });

    this.rl.on('close', () => {
      // Wait for queue to drain before ending
      const checkAndEnd = (): void => {
        if (this.processing) {
          setTimeout(checkAndEnd, 10);
          return;
        }
        if (this.agentId) {
          this.endGame();
        }
        process.exit(0);
      };
      checkAndEnd();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.messageQueue.length > 0) {
      const line = this.messageQueue.shift()!;
      await this.handleLine(line);
    }

    this.processing = false;
  }

  private async handleLine(line: string): Promise<void> {
    const trimmed = line.trim();
    if (!trimmed) return;

    let msg: AgentMessage;
    try {
      msg = JSON.parse(trimmed) as AgentMessage;
    } catch {
      this.send({ type: 'error', message: 'Invalid JSON. Send valid JSON messages.' });
      return;
    }

    try {
      switch (msg.type) {
        case 'register':
          await this.handleRegister(msg);
          break;
        case 'answer':
          await this.handleAnswer(msg);
          break;
        case 'skip':
          await this.handleSkip(msg);
          break;
        case 'query':
          await this.handleQuery(msg);
          break;
        default:
          this.send({ type: 'error', message: `Unknown message type: ${(msg as { type: string }).type}` });
      }
    } catch (error) {
      this.send({
        type: 'error',
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private async handleRegister(msg: { agentId: string; agentName: string }): Promise<void> {
    if (this.registered) {
      this.send({ type: 'error', message: 'Already registered.' });
      return;
    }

    this.agentId = msg.agentId;
    this.agentName = msg.agentName;
    this.registered = true;

    // Send first challenge
    await this.sendNextChallenge();
  }

  private async handleAnswer(msg: { challengeId: string; query: Record<string, unknown> }): Promise<void> {
    if (!this.registered || !this.agentId) {
      this.send({ type: 'error', message: 'Not registered. Send a register message first.' });
      return;
    }

    const result = await this.engine.submitAnswer(
      this.agentId,
      msg.challengeId,
      msg.query,
      this.challengeStartTime,
    );

    this.send({
      type: 'result',
      challengeId: result.challengeId,
      correct: result.correct,
      score: result.score,
      maxScore: result.maxScore,
      timeMs: result.timeMs,
      feedback: result.feedback,
      totalScore: this.engine.getTotalScore(this.agentId),
      rank: this.engine.getRank(this.agentId),
    });

    // Check if game over
    if (this.engine.isGameOver()) {
      this.endGame();
    } else {
      await this.sendNextChallenge();
    }
  }

  private async handleSkip(msg: { challengeId: string }): Promise<void> {
    if (!this.registered || !this.agentId) {
      this.send({ type: 'error', message: 'Not registered.' });
      return;
    }

    const result = this.engine.skipChallenge(this.agentId, msg.challengeId);

    this.send({
      type: 'result',
      challengeId: result.challengeId,
      correct: false,
      score: 0,
      maxScore: result.maxScore,
      timeMs: 0,
      feedback: 'Skipped.',
      totalScore: this.engine.getTotalScore(this.agentId),
      rank: this.engine.getRank(this.agentId),
    });

    if (this.engine.isGameOver()) {
      this.endGame();
    } else {
      await this.sendNextChallenge();
    }
  }

  private async handleQuery(msg: {
    challengeId: string;
    method: string;
    params: Record<string, unknown>;
  }): Promise<void> {
    if (!this.registered) {
      this.send({ type: 'error', message: 'Not registered.' });
      return;
    }

    const backend = this.engine.getBackend();
    const index = (msg.params.index as string) ?? msg.challengeId;

    try {
      let result: unknown;
      switch (msg.method) {
        case 'search':
          result = await backend.search(
            index,
            (msg.params.body ?? msg.params) as Record<string, unknown>,
          );
          break;
        case 'count':
          result = await backend.count(index, msg.params.query as Record<string, unknown>);
          break;
        case 'get':
          result = await backend.getDocument(index, msg.params.id as string);
          break;
        case 'mapping':
          result = await backend.getMapping(index);
          break;
        default:
          this.send({
            type: 'error',
            message: `Unsupported query method: ${msg.method}. Use: search, count, get, mapping`,
            challengeId: msg.challengeId,
          });
          return;
      }

      // Send result as a special message
      this.send({
        type: 'query_result' as 'error', // Using error type as a carrier for now
        message: JSON.stringify(result),
        challengeId: msg.challengeId,
      });
    } catch (error) {
      this.send({
        type: 'error',
        message: `Query failed: ${error instanceof Error ? error.message : String(error)}`,
        challengeId: msg.challengeId,
      });
    }
  }

  private async sendNextChallenge(): Promise<void> {
    const challenge = await this.engine.setupChallenge();
    if (!challenge) return;

    this.challengeStartTime = Date.now();

    const msg: ChallengeMessage = {
      type: 'challenge',
      id: challenge.id,
      domain: challenge.domain,
      difficulty: challenge.difficulty,
      title: challenge.title,
      description: challenge.description,
      hints: challenge.hints,
      indexName: challenge.indexName,
      mapping: challenge.mapping ?? null,
      sampleDocs: challenge.seedData.slice(0, 3).map((d) => d._source),
      timeLimitMs: challenge.timeLimitMs,
      maxScore: challenge.maxScore,
      challengeNumber: this.engine.getCurrentChallengeIndex() + 1,
      totalChallenges: this.engine.getTotalChallenges(),
    };

    this.send(msg);
  }

  private endGame(): void {
    if (!this.agentId) return;

    const results = this.engine.getResults(this.agentId);
    const totalScore = this.engine.getTotalScore(this.agentId);

    // Save to persistent leaderboard
    this.leaderboard.addEntry({
      agentId: this.agentId,
      agentName: this.agentName ?? this.agentId,
      totalScore,
      challengesCompleted: results.length,
      challengesCorrect: results.filter((r) => r.correct).length,
      averageTimeMs: results.length > 0
        ? results.reduce((sum, r) => sum + r.timeMs, 0) / results.length
        : 0,
      timestamp: Date.now(),
    });

    this.send({
      type: 'game_over',
      totalScore,
      maxPossibleScore: this.engine.getMaxPossibleScore(),
      rank: this.leaderboard.getRank(this.agentId),
      results,
      leaderboard: this.leaderboard.getTop(10),
    });
  }

  private send(msg: GameMessage | Record<string, unknown>): void {
    process.stdout.write(JSON.stringify(msg) + '\n');
  }
}
