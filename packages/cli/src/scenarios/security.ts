/**
 * Security scenarios — aligned to the security skills
 * (alert-triage, detection-rule-management).
 *
 * Data: 1500 security events with an attack chain buried in normal activity.
 * Normal traffic: SSH logins, process execution, cron jobs, network connections.
 * Attack: brute force from 10.0.0.50 -> successful login -> C2 download -> execution.
 * Noise: scattered scanner IPs with single failed logins.
 */

import type { Scenario, EsqlResponse } from '../types';
import {
  generateSecurityEvents,
  getSecurityFacts,
  securityEventsMapping,
} from './generators';

const secDocs = generateSecurityEvents(1500, 42);
const secFacts = getSecurityFacts(secDocs);

// --- Helpers ---

function esqlHasColumn(resp: EsqlResponse, name: string): boolean {
  return resp.columns.some((c) => c.name === name);
}

function esqlGetValues(resp: EsqlResponse, columnName: string): unknown[] {
  const idx = resp.columns.findIndex((c) => c.name === columnName);
  if (idx === -1) return [];
  return resp.values.map((row) => row[idx]);
}

// --- Scenarios ---

export const securityScenarios: Scenario[] = [
  // 1. Brute force detection
  {
    id: 'sec-esql-1-brute-force',
    skillId: 'security-alert-triage',
    domain: 'security',
    difficulty: 'intermediate',
    title: 'Brute Force Detection with ES|QL',
    description:
      'Write an ES|QL query to detect potential brute force attacks. Find source IPs ' +
      'that have 3 or more failed authentication attempts. Return the source IP, the ' +
      'count of failed attempts, the targeted user names (as a list), and the target host. ' +
      'Sort by failure count descending. ' +
      `The index contains ${secFacts.totalCount} security events over a 24-hour period, ` +
      'including authentication, process, and network events from multiple hosts. ' +
      'There are both legitimate users and potential attackers.',
    hints: [
      'Filter for authentication events with failure outcome',
      'Use STATS with COUNT(*) grouped by source.ip',
      'Use VALUES() to collect targeted user names',
      'Filter with WHERE after STATS for count >= 3',
    ],
    indexName: 'eq-sec-events',
    seedData: secDocs,
    mapping: securityEventsMapping,
    responseFormat: 'esql',
    maxScore: 100,
    timeLimitMs: 45000,
    skillPaths: ['security/alert-triage/SKILL.md'],
    validate: async (response) => {
      const resp = response as EsqlResponse;

      if (!resp.columns || !resp.values) {
        return { correct: false, score: 0, maxScore: 100, feedback: 'No ES|QL results returned.' };
      }

      let score = 0;
      const feedback: string[] = [];

      // Should have source.ip
      if (esqlHasColumn(resp, 'source.ip')) {
        score += 15;
      } else {
        feedback.push('Missing source.ip column.');
      }

      // Should have a count column
      const hasCount = resp.columns.some((c) =>
        c.name.toLowerCase().includes('count') ||
        c.name.toLowerCase().includes('fail'),
      );
      if (hasCount) {
        score += 15;
      } else {
        feedback.push('Missing failure count column.');
      }

      // Should find 10.0.0.50 (12 brute force failures)
      const ips = esqlGetValues(resp, 'source.ip');
      if (ips.includes(secFacts.attackerIp)) {
        score += 30;
      } else {
        feedback.push(
          `Expected ${secFacts.attackerIp} as a brute force source ` +
            `(${secFacts.bruteForceAttempts} failed attempts).`,
        );
      }

      // 10.0.0.50 should be the top result (most failures)
      if (ips.length > 0 && ips[0] === secFacts.attackerIp) {
        score += 15;
      } else if (ips.includes(secFacts.attackerIp)) {
        score += 5;
        feedback.push(`${secFacts.attackerIp} should be the top result.`);
      }

      // Should have user names (VALUES)
      const hasUsers = resp.columns.some(
        (c) =>
          c.name.includes('user') ||
          c.name.toLowerCase().includes('values'),
      );
      if (hasUsers) {
        score += 15;
      } else {
        feedback.push('Including targeted user names helps assess attack scope.');
      }

      // Scanner IPs should mostly be filtered out (< 3 attempts each)
      const scannerFound = ips.filter(
        (ip) =>
          ip !== secFacts.attackerIp &&
          !['192.168.', '10.1.'].some((prefix) =>
            String(ip).startsWith(prefix),
          ),
      );
      if (scannerFound.length <= 2) {
        score += 10;
      } else {
        feedback.push(
          'Some scanner IPs with < 3 attempts are included (should be filtered).',
        );
      }

      return {
        correct: score >= 70,
        score,
        maxScore: 100,
        feedback: score >= 70
          ? `Correct! Brute force detected: ${secFacts.attackerIp} with ${secFacts.bruteForceAttempts} attempts.`
          : feedback.join(' '),
      };
    },
  },

  // 2. Post-compromise activity detection
  {
    id: 'sec-esql-2-post-compromise',
    skillId: 'security-alert-triage',
    domain: 'security',
    difficulty: 'advanced',
    title: 'Post-Compromise Activity Analysis',
    description:
      `After identifying the brute force from ${secFacts.attackerIp}, investigate what ` +
      'happened after the successful login. Write an ES|QL query to find all events ' +
      `from ${secFacts.attackerIp} on ${secFacts.targetHost} after the successful ` +
      'authentication, showing the timeline of activity. ' +
      'Return timestamp, event category, process name, command line, and message. ' +
      'Sort by timestamp ascending.',
    hints: [
      `Filter by source.ip == "${secFacts.attackerIp}" and host.name == "${secFacts.targetHost}"`,
      'Focus on events after the brute force window (around 03:00:30 UTC)',
      'Look for process events that indicate post-exploitation',
      'KEEP only the fields relevant to the investigation',
    ],
    indexName: 'eq-sec-events',
    seedData: secDocs,
    mapping: securityEventsMapping,
    responseFormat: 'esql',
    maxScore: 100,
    timeLimitMs: 45000,
    skillPaths: ['security/alert-triage/SKILL.md'],
    validate: async (response) => {
      const resp = response as EsqlResponse;

      if (!resp.columns || !resp.values) {
        return { correct: false, score: 0, maxScore: 100, feedback: 'No ES|QL results returned.' };
      }

      let score = 0;
      const feedback: string[] = [];

      // Should find post-compromise events
      let foundCurl = false;
      let foundBash = false;
      let foundC2 = false;
      let foundCredDump = false;

      for (const row of resp.values) {
        for (const val of row) {
          const s = String(val);
          if (s.includes('curl') && s.includes('payload')) foundCurl = true;
          if (s.includes('bash') && s.includes('payload')) foundBash = true;
          if (s.includes('198.18.0.1') || s.includes('4444')) foundC2 = true;
          if (s.includes('/etc/shadow')) foundCredDump = true;
        }
      }

      if (foundCurl) {
        score += 20;
      } else {
        feedback.push('Expected to find curl downloading payload.sh.');
      }

      if (foundBash) {
        score += 20;
      } else {
        feedback.push('Expected to find bash executing payload.sh.');
      }

      if (foundC2) {
        score += 15;
      } else {
        feedback.push('Expected to find C2 callback to 198.18.0.1:4444.');
      }

      if (foundCredDump) {
        score += 10;
      } else {
        feedback.push('Expected to find credential dump attempt (cat /etc/shadow).');
      }

      // Should have timestamp for timeline
      if (
        esqlHasColumn(resp, '@timestamp') ||
        resp.columns.some((c) => c.name.includes('timestamp'))
      ) {
        score += 10;
      } else {
        feedback.push('Include timestamps for timeline analysis.');
      }

      // Should have process info
      if (esqlHasColumn(resp, 'process.name')) {
        score += 10;
      }

      // Should not include unrelated legitimate activity
      let foundLegitNoise = false;
      for (const row of resp.values) {
        for (const val of row) {
          const s = String(val);
          if (s.includes('git pull') || s.includes('npm install')) {
            foundLegitNoise = true;
          }
        }
      }
      if (!foundLegitNoise) {
        score += 15;
      } else {
        feedback.push(
          'Results include unrelated activity — filter to the attacker IP and target host.',
        );
      }

      return {
        correct: score >= 65,
        score,
        maxScore: 100,
        feedback: score >= 65
          ? 'Correct! Post-compromise: C2 download, execution, reverse shell, credential dump.'
          : feedback.join(' '),
      };
    },
  },

  // 3. Multi-turn: investigate full attack chain
  {
    id: 'sec-esql-3-attack-chain',
    skillId: 'security-alert-triage',
    domain: 'security',
    difficulty: 'expert',
    title: 'Full Attack Chain Investigation (Multi-Turn)',
    description:
      'Based on your analysis, write a single ES|QL query that summarizes the full ' +
      `attack chain from ${secFacts.attackerIp}. For each phase (brute-force, ` +
      'credential success, post-exploitation), show the count of events, the event ' +
      'categories involved, and the time range. Group by a computed "attack_phase" field.',
    hints: [
      'Use EVAL with CASE to classify events into attack phases based on event.category and event.outcome',
      'Brute force = authentication failures, Access = authentication success, ' +
        'Exploitation = process/network events after compromise',
      'STATS to aggregate per phase with COUNT, MIN(@timestamp), MAX(@timestamp)',
      `Filter to source.ip == "${secFacts.attackerIp}" first`,
    ],
    indexName: 'eq-sec-events',
    seedData: secDocs,
    mapping: securityEventsMapping,
    responseFormat: 'esql',
    maxScore: 100,
    timeLimitMs: 90000,
    multiTurn: true,
    discoveryPrompt:
      'Examine this security events index. Identify: (1) what event categories exist, ' +
      '(2) what source IPs are present and how many events each has, ' +
      '(3) the authentication outcomes, and ' +
      '(4) any suspicious patterns such as rapid failed logins followed by success ' +
      'and subsequent process execution from the same IP. ' +
      `The index contains ${secFacts.totalCount} events over 24 hours.`,
    skillPaths: ['security/alert-triage/SKILL.md'],
    validate: async (response) => {
      const resp = response as EsqlResponse;

      if (!resp.columns || !resp.values) {
        return { correct: false, score: 0, maxScore: 100, feedback: 'No ES|QL results returned.' };
      }

      let score = 0;
      const feedback: string[] = [];

      // Should have a phase/classification column
      const hasPhase = resp.columns.some(
        (c) =>
          c.name.includes('phase') ||
          c.name.includes('stage') ||
          c.name.includes('attack') ||
          c.name.includes('classification') ||
          c.name.includes('step'),
      );
      if (hasPhase) {
        score += 20;
      } else {
        feedback.push('Expected a computed attack phase column (e.g., attack_phase).');
      }

      // Should have count
      const hasCount = resp.columns.some((c) =>
        c.name.toLowerCase().includes('count'),
      );
      if (hasCount) {
        score += 15;
      } else {
        feedback.push('Missing event count per phase.');
      }

      // Should have time range (MIN/MAX timestamp)
      const hasTimeRange = resp.columns.some(
        (c) =>
          c.name.toLowerCase().includes('min') ||
          c.name.toLowerCase().includes('max') ||
          c.name.toLowerCase().includes('start') ||
          c.name.toLowerCase().includes('end') ||
          c.name.toLowerCase().includes('first') ||
          c.name.toLowerCase().includes('last'),
      );
      if (hasTimeRange) {
        score += 15;
      } else {
        feedback.push('Including time range per phase helps assess attack duration.');
      }

      // Should show multiple phases (at least 2, ideally 3)
      if (resp.values.length >= 3) {
        score += 20;
      } else if (resp.values.length >= 2) {
        score += 12;
        feedback.push('Expected at least 3 attack phases (brute-force, access, exploitation).');
      } else {
        feedback.push(`Expected multiple attack phases, got ${resp.values.length} rows.`);
      }

      // Results should be scoped to attacker (not thousands of rows)
      if (resp.values.length <= 10) {
        score += 15;
      } else {
        feedback.push('Results not scoped to attacker — too many rows returned.');
      }

      // Check that phase values look reasonable
      let hasReasonablePhases = false;
      for (const row of resp.values) {
        for (const val of row) {
          const s = String(val).toLowerCase();
          if (
            s.includes('brute') || s.includes('recon') ||
            s.includes('access') || s.includes('compromise') ||
            s.includes('exploit') || s.includes('post') ||
            s.includes('initial') || s.includes('lateral')
          ) {
            hasReasonablePhases = true;
            break;
          }
        }
        if (hasReasonablePhases) break;
      }
      if (hasReasonablePhases) {
        score += 15;
      }

      return {
        correct: score >= 60,
        score,
        maxScore: 100,
        feedback: score >= 60
          ? 'Correct! Full attack chain: brute-force -> access -> post-exploitation.'
          : feedback.join(' '),
      };
    },
  },
];
