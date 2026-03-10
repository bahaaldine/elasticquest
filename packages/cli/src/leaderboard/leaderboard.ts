import type { LeaderboardEntry } from '../types';
import * as fs from 'fs';
import * as path from 'path';

const LEADERBOARD_FILE = path.join(process.cwd(), '.elastic-quest-leaderboard.json');

export class Leaderboard {
  private entries: LeaderboardEntry[] = [];

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(LEADERBOARD_FILE)) {
        const data = fs.readFileSync(LEADERBOARD_FILE, 'utf-8');
        this.entries = JSON.parse(data);
      }
    } catch {
      this.entries = [];
    }
  }

  private save(): void {
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(this.entries, null, 2));
  }

  addEntry(entry: LeaderboardEntry): void {
    // Replace existing entry for same agent or add new
    const existingIdx = this.entries.findIndex((e) => e.agentId === entry.agentId);
    if (existingIdx >= 0) {
      // Keep the best score
      if (entry.totalScore > this.entries[existingIdx].totalScore) {
        this.entries[existingIdx] = entry;
      }
    } else {
      this.entries.push(entry);
    }

    this.entries.sort((a, b) => b.totalScore - a.totalScore);
    this.save();
  }

  getEntries(): LeaderboardEntry[] {
    return [...this.entries];
  }

  getRank(agentId: string): number {
    const idx = this.entries.findIndex((e) => e.agentId === agentId);
    return idx >= 0 ? idx + 1 : this.entries.length + 1;
  }

  getTop(n: number): LeaderboardEntry[] {
    return this.entries.slice(0, n);
  }
}
