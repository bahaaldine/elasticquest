import type { SearchResponse, AggregationResult } from '../types';

/**
 * Helpers for writing challenge validation functions.
 * These reduce boilerplate and standardize scoring.
 */

export interface ValidationResult {
  correct: boolean;
  score: number;
  maxScore: number;
  feedback: string;
}

/**
 * Check which expected document IDs were found in the response.
 */
export function checkHits(
  response: SearchResponse,
  expectedIds: string[],
): { found: string[]; missing: string[]; falsePositives: string[]; hitIds: string[] } {
  const hitIds = response.hits.hits.map((h) => h._id);
  const found = expectedIds.filter((id) => hitIds.includes(id));
  const missing = expectedIds.filter((id) => !hitIds.includes(id));
  const falsePositives = hitIds.filter((id) => !expectedIds.includes(id));
  return { found, missing, falsePositives, hitIds };
}

/**
 * Score based on how many expected documents were found.
 * Penalizes false positives.
 */
export function scoreHits(
  response: SearchResponse,
  expectedIds: string[],
  opts: { maxScore?: number; fpPenalty?: number } = {},
): ValidationResult {
  const maxScore = opts.maxScore ?? 100;
  const fpPenalty = opts.fpPenalty ?? 15;
  const { found, falsePositives } = checkHits(response, expectedIds);
  const correct = found.length === expectedIds.length && falsePositives.length === 0;
  const score = Math.max(
    0,
    Math.min(
      maxScore,
      Math.floor((found.length / expectedIds.length) * 85) - falsePositives.length * fpPenalty,
    ),
  );
  return {
    correct,
    score,
    maxScore,
    feedback: correct
      ? `Found all ${expectedIds.length} expected documents.`
      : `Found ${found.length}/${expectedIds.length}. ${falsePositives.length} false positive(s).`,
  };
}

/**
 * Score based on correct sort order of results.
 */
export function scoreOrder(
  response: SearchResponse,
  expectedOrder: string[],
  opts: { maxScore?: number } = {},
): ValidationResult {
  const maxScore = opts.maxScore ?? 100;
  const hitIds = response.hits.hits.map((h) => h._id);
  const correctSize = hitIds.length === expectedOrder.length;
  const correctOrder = expectedOrder.every((id, i) => hitIds[i] === id);
  let score = 0;
  if (correctSize) score += 40;
  if (correctOrder) score += 60;
  return {
    correct: correctSize && correctOrder,
    score: Math.min(maxScore, score),
    maxScore,
    feedback: correctSize && correctOrder
      ? `Correct order: [${expectedOrder.join(', ')}]`
      : `Expected [${expectedOrder.join(', ')}], got [${hitIds.join(', ')}]`,
  };
}

/**
 * Check that size is 0 (no hits returned) — used for agg-only queries.
 */
export function checkNoHits(response: SearchResponse): { ok: boolean; score: number } {
  return { ok: response.hits.hits.length === 0, score: response.hits.hits.length === 0 ? 20 : 0 };
}

/**
 * Get a named aggregation from the response, returning null if missing.
 */
export function getAgg(
  response: SearchResponse,
  name: string,
): AggregationResult | null {
  return response.aggregations?.[name] ?? null;
}

/**
 * Get bucket counts from a terms-like aggregation as a Map.
 */
export function getBucketCounts(
  agg: AggregationResult,
): Map<string, number> {
  const counts = new Map<string, number>();
  if (agg.buckets) {
    for (const b of agg.buckets) {
      counts.set(String(b.key), b.doc_count);
    }
  }
  return counts;
}
