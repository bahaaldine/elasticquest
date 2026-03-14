/**
 * Observability scenarios — aligned to the observability-logs-search skill.
 *
 * These scenarios test a model's ability to analyze logs using ES|QL,
 * following the funnel workflow pattern from the logs-search skill.
 *
 * Data: 2500 microservice logs with an embedded payment gateway incident.
 * The model must funnel through noise to find the root cause.
 */

import type { Scenario, EsqlResponse } from '../types';
import { generateLogs, getLogFacts, logsMapping } from './generators';

// Generate data once (deterministic)
const logsDocs = generateLogs(2500, 99); // different seed from esql.ts
const logFacts = getLogFacts(logsDocs);

// --- Helpers ---

function esqlHasColumn(resp: EsqlResponse, name: string): boolean {
  return resp.columns.some((c) => c.name === name);
}

function esqlColumnIndex(resp: EsqlResponse, name: string): number {
  return resp.columns.findIndex((c) => c.name === name);
}

function esqlGetValues(resp: EsqlResponse, columnName: string): unknown[] {
  const idx = esqlColumnIndex(resp, columnName);
  if (idx === -1) return [];
  return resp.values.map((row) => row[idx]);
}

// --- Scenarios ---

export const observabilityScenarios: Scenario[] = [
  // 1. Error log investigation
  {
    id: 'obs-esql-1-error-investigation',
    skillId: 'observability-logs-search',
    domain: 'observability',
    difficulty: 'intermediate',
    title: 'Log Error Investigation with ES|QL',
    description:
      'You are investigating a service disruption. Write an ES|QL query to find ' +
      'all error-level logs, showing the timestamp, service name, message, and error message. ' +
      'Sort by timestamp ascending to understand the error timeline. ' +
      `The index contains ${logFacts.totalCount} log entries from 8 microservices ` +
      `with ${logFacts.errorCount} error entries across the affected services.`,
    hints: [
      'Use FROM with the index name',
      'Filter WHERE log.level == "error"',
      'KEEP only the relevant fields to minimize output',
      'SORT by @timestamp ascending',
    ],
    indexName: 'eq-obs-logs',
    seedData: logsDocs,
    mapping: logsMapping,
    responseFormat: 'esql',
    maxScore: 100,
    timeLimitMs: 30000,
    skillPaths: ['observability/logs-search/SKILL.md'],
    validate: async (response) => {
      const resp = response as EsqlResponse;

      if (!resp.columns || !resp.values) {
        return { correct: false, score: 0, maxScore: 100, feedback: 'No ES|QL results returned.' };
      }

      let score = 0;
      const feedback: string[] = [];

      // Should return error logs
      if (resp.values.length > 0) {
        score += 15;
      } else {
        feedback.push('No results returned.');
      }

      // Should have relevant columns
      if (esqlHasColumn(resp, 'service.name')) score += 15;
      else feedback.push('Missing service.name column.');

      if (esqlHasColumn(resp, 'message')) score += 10;
      else feedback.push('Missing message column.');

      // Sorted by timestamp ascending
      const tsValues = esqlGetValues(resp, '@timestamp');
      if (tsValues.length >= 2) {
        const sorted = tsValues.every(
          (v, i) => i === 0 || String(v) >= String(tsValues[i - 1]),
        );
        if (sorted) {
          score += 20;
        } else {
          feedback.push('Results not sorted by timestamp ascending.');
        }
      }

      // Should include the incident services
      const services = new Set(esqlGetValues(resp, 'service.name'));
      if (
        services.has('checkout-service') &&
        services.has('payment-gateway')
      ) {
        score += 25;
      } else if (services.has('payment-gateway') || services.has('checkout-service')) {
        score += 10;
        feedback.push(
          'Should include errors from both checkout-service and payment-gateway.',
        );
      } else {
        feedback.push(
          'Expected to find errors from checkout-service and payment-gateway.',
        );
      }

      // Should have found a reasonable number of errors
      if (resp.values.length >= 10) {
        score += 15;
      } else {
        feedback.push(
          `Expected many errors (there are ${logFacts.errorCount}), got ${resp.values.length}.`,
        );
      }

      return {
        correct: score >= 70,
        score,
        maxScore: 100,
        feedback: score >= 70
          ? 'Correct! Error timeline investigation across incident services.'
          : feedback.join(' '),
      };
    },
  },

  // 2. Service error count breakdown
  {
    id: 'obs-esql-2-error-breakdown',
    skillId: 'observability-logs-search',
    domain: 'observability',
    difficulty: 'intermediate',
    title: 'Service Error Count Breakdown',
    description:
      'Write an ES|QL query to count the number of log entries per service, grouped by ' +
      'log level. This gives you a quick overview of which services are producing errors ' +
      'versus normal operations. Sort by count descending. ' +
      `The index contains ${logFacts.totalCount} log entries.`,
    hints: [
      'Use STATS with COUNT(*)',
      'Group BY service.name, log.level',
      'SORT by count descending',
    ],
    indexName: 'eq-obs-logs',
    seedData: logsDocs,
    mapping: logsMapping,
    responseFormat: 'esql',
    maxScore: 100,
    timeLimitMs: 30000,
    skillPaths: ['observability/logs-search/SKILL.md'],
    validate: async (response) => {
      const resp = response as EsqlResponse;

      if (!resp.columns || !resp.values) {
        return { correct: false, score: 0, maxScore: 100, feedback: 'No ES|QL results returned.' };
      }

      let score = 0;
      const feedback: string[] = [];

      // Should group by service.name and log.level
      if (esqlHasColumn(resp, 'service.name')) score += 20;
      else feedback.push('Missing service.name grouping.');

      if (esqlHasColumn(resp, 'log.level')) score += 20;
      else feedback.push('Missing log.level grouping.');

      // Should have a count column
      const hasCount = resp.columns.some((c) =>
        c.name.toLowerCase().includes('count'),
      );
      if (hasCount) {
        score += 20;
      } else {
        feedback.push('Missing count aggregation.');
      }

      // Should have many rows (8 services x 2-3 levels each)
      if (resp.values.length >= 10) {
        score += 20;
      } else if (resp.values.length >= 5) {
        score += 10;
        feedback.push(
          `Expected many service/level combinations, got ${resp.values.length}.`,
        );
      } else {
        feedback.push(
          `Expected many service/level combinations, got ${resp.values.length}.`,
        );
      }

      // Sorted by count descending
      const countIdx = resp.columns.findIndex((c) =>
        c.name.toLowerCase().includes('count'),
      );
      if (countIdx >= 0 && resp.values.length >= 2) {
        const counts = resp.values.map((r) => r[countIdx] as number);
        const sorted = counts.every(
          (v, i) => i === 0 || v <= counts[i - 1],
        );
        if (sorted) {
          score += 20;
        } else {
          feedback.push('Results not sorted by count descending.');
        }
      }

      return {
        correct: score >= 70,
        score,
        maxScore: 100,
        feedback: score >= 70
          ? 'Correct! Service error breakdown by log level.'
          : feedback.join(' '),
      };
    },
  },

  // 3. Multi-turn: discover log schema, then investigate root cause
  {
    id: 'obs-esql-3-root-cause',
    skillId: 'observability-logs-search',
    domain: 'observability',
    difficulty: 'advanced',
    title: 'Root Cause Investigation (Multi-Turn)',
    description:
      'Based on your analysis of the log data, write an ES|QL query to identify the ' +
      'root cause of the payment failures. Find the distinct error messages from the ' +
      'payment-gateway service, along with the count of each and the affected hosts. ' +
      'This should help identify whether the issue is a specific upstream dependency failure.',
    hints: [
      'Filter to payment-gateway errors',
      'Use STATS to count and find distinct values',
      'The error.message field contains the root cause details',
      'Use VALUES() to see affected hosts',
    ],
    indexName: 'eq-obs-logs',
    seedData: logsDocs,
    mapping: logsMapping,
    responseFormat: 'esql',
    maxScore: 100,
    timeLimitMs: 60000,
    multiTurn: true,
    discoveryPrompt:
      'Examine this log index and describe: (1) what services are present, ' +
      '(2) what log levels exist, (3) what fields are available including error-specific ' +
      'fields, and (4) any patterns you notice. ' +
      `The index contains ${logFacts.totalCount} log entries.`,
    skillPaths: ['observability/logs-search/SKILL.md'],
    validate: async (response) => {
      const resp = response as EsqlResponse;

      if (!resp.columns || !resp.values) {
        return { correct: false, score: 0, maxScore: 100, feedback: 'No ES|QL results returned.' };
      }

      let score = 0;
      const feedback: string[] = [];

      // Should return results
      if (resp.values.length > 0) {
        score += 15;
      } else {
        feedback.push('No results returned.');
      }

      // Should have a count
      const hasCount = resp.columns.some((c) =>
        c.name.toLowerCase().includes('count'),
      );
      if (hasCount) {
        score += 20;
      } else {
        feedback.push('Missing count of error occurrences.');
      }

      // Should include host information
      const hasHost = resp.columns.some(
        (c) =>
          c.name.includes('host') ||
          c.name.includes('VALUES') ||
          c.name.includes('values'),
      );
      if (hasHost) {
        score += 20;
      } else {
        score += 5;
        feedback.push('Including affected hosts would show blast radius.');
      }

      // The root cause should be visible: ECONNREFUSED / stripe-api / connection refused
      let foundRootCause = false;
      for (const row of resp.values) {
        for (const val of row) {
          const s = String(val).toLowerCase();
          if (
            s.includes('econnrefused') ||
            s.includes('stripe') ||
            s.includes('connection refused') ||
            s.includes('unreachable')
          ) {
            foundRootCause = true;
            break;
          }
        }
        if (foundRootCause) break;
      }
      if (foundRootCause) {
        score += 45;
      } else {
        feedback.push(
          'Root cause (stripe-api connection refused) not found in results.',
        );
      }

      return {
        correct: score >= 70,
        score,
        maxScore: 100,
        feedback: score >= 70
          ? 'Correct! Root cause identified: upstream stripe-api dependency failure.'
          : feedback.join(' '),
      };
    },
  },
];
