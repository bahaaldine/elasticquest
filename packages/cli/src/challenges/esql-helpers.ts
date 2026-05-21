import type { EsqlResponse, ValidationResult } from '../types';

/**
 * Score based on whether the ES|QL response columns match expectations.
 * Partial credit for subset matches.
 */
export function scoreEsqlColumns(
  response: EsqlResponse,
  expectedColumns: string[],
  opts: { maxScore?: number } = {},
): { score: number; feedback: string } {
  const maxScore = opts.maxScore ?? 30;
  const actual = response.columns.map((c) => c.name);
  const matched = expectedColumns.filter((c) => actual.includes(c));
  const missing = expectedColumns.filter((c) => !actual.includes(c));

  if (matched.length === expectedColumns.length) {
    return { score: maxScore, feedback: `All ${expectedColumns.length} expected columns present.` };
  }

  const score = Math.round((matched.length / expectedColumns.length) * maxScore);
  return {
    score,
    feedback: `Columns: ${matched.length}/${expectedColumns.length}. Missing: [${missing.join(', ')}].`,
  };
}

/**
 * Score based on whether the ES|QL response has the expected number of rows.
 */
export function scoreEsqlRowCount(
  response: EsqlResponse,
  expectedCount: number,
  opts: { maxScore?: number; tolerance?: number } = {},
): { score: number; feedback: string } {
  const maxScore = opts.maxScore ?? 20;
  const tolerance = opts.tolerance ?? 0;
  const actual = response.values.length;

  if (Math.abs(actual - expectedCount) <= tolerance) {
    return { score: maxScore, feedback: `Row count correct: ${actual}.` };
  }

  const ratio = Math.max(0, 1 - Math.abs(actual - expectedCount) / Math.max(expectedCount, 1));
  const score = Math.round(ratio * maxScore);
  return {
    score,
    feedback: `Expected ${expectedCount} rows (±${tolerance}), got ${actual}.`,
  };
}

/**
 * Score based on whether specific values appear in the ES|QL response.
 * Checks that expectedValues are a subset of the actual response values.
 */
export function scoreEsqlValues(
  response: EsqlResponse,
  expectedValues: unknown[][],
  opts: { maxScore?: number; orderMatters?: boolean } = {},
): { score: number; feedback: string } {
  const maxScore = opts.maxScore ?? 50;
  const orderMatters = opts.orderMatters ?? false;

  if (expectedValues.length === 0) {
    return { score: maxScore, feedback: 'No expected values to check.' };
  }

  const actualStrs = response.values.map((row) => JSON.stringify(row));
  const expectedStrs = expectedValues.map((row) => JSON.stringify(row));

  let matchCount = 0;
  if (orderMatters) {
    for (let i = 0; i < expectedStrs.length; i++) {
      if (i < actualStrs.length && actualStrs[i] === expectedStrs[i]) {
        matchCount++;
      }
    }
  } else {
    for (const expected of expectedStrs) {
      if (actualStrs.includes(expected)) {
        matchCount++;
      }
    }
  }

  const score = Math.round((matchCount / expectedValues.length) * maxScore);
  return {
    score,
    feedback: matchCount === expectedValues.length
      ? `All ${expectedValues.length} expected rows found.`
      : `Found ${matchCount}/${expectedValues.length} expected rows.`,
  };
}

/**
 * Validate that the ES|QL query string contains required patterns.
 * Useful for checking that the model used the correct ES|QL commands.
 */
export function scoreEsqlQuery(
  query: string,
  requiredPatterns: Array<{ pattern: RegExp; points: number; label: string }>,
  opts: { maxScore?: number } = {},
): { score: number; feedback: string; matchedPatterns: string[] } {
  const maxScore = opts.maxScore ?? 100;
  const totalPoints = requiredPatterns.reduce((sum, p) => sum + p.points, 0);
  let earnedPoints = 0;
  const matched: string[] = [];
  const missed: string[] = [];

  for (const { pattern, points, label } of requiredPatterns) {
    if (pattern.test(query)) {
      earnedPoints += points;
      matched.push(label);
    } else {
      missed.push(label);
    }
  }

  const score = totalPoints > 0
    ? Math.round((earnedPoints / totalPoints) * maxScore)
    : maxScore;

  const feedback = missed.length === 0
    ? `Query uses all expected ES|QL constructs: [${matched.join(', ')}].`
    : `Missing ES|QL constructs: [${missed.join(', ')}]. Used: [${matched.join(', ')}].`;

  return { score, feedback, matchedPatterns: matched };
}

/**
 * Combined validator for ES|QL challenges.
 * Checks query structure, column names, row count, and optionally values.
 */
export function validateEsqlChallenge(
  response: EsqlResponse,
  query: string,
  opts: {
    expectedColumns?: string[];
    expectedRowCount?: number;
    rowCountTolerance?: number;
    expectedValues?: unknown[][];
    orderMatters?: boolean;
    requiredPatterns?: Array<{ pattern: RegExp; points: number; label: string }>;
    maxScore?: number;
  },
): ValidationResult {
  const maxScore = opts.maxScore ?? 100;
  let totalScore = 0;
  const feedbackParts: string[] = [];

  const hasColumns = opts.expectedColumns !== undefined;
  const hasRowCount = opts.expectedRowCount !== undefined;
  const hasValues = opts.expectedValues !== undefined;
  const hasPatterns = opts.requiredPatterns !== undefined && opts.requiredPatterns.length > 0;

  const enabledChecks = [hasColumns, hasRowCount, hasValues, hasPatterns].filter(Boolean).length;
  if (enabledChecks === 0) {
    return { correct: response.values.length > 0, score: response.values.length > 0 ? maxScore : 0, maxScore, feedback: 'No validation criteria specified.' };
  }

  const pointsPerCheck = Math.floor(maxScore / enabledChecks);

  if (hasPatterns) {
    const result = scoreEsqlQuery(query, opts.requiredPatterns!, { maxScore: pointsPerCheck });
    totalScore += result.score;
    feedbackParts.push(result.feedback);
  }

  if (hasColumns) {
    const result = scoreEsqlColumns(response, opts.expectedColumns!, { maxScore: pointsPerCheck });
    totalScore += result.score;
    feedbackParts.push(result.feedback);
  }

  if (hasRowCount) {
    const result = scoreEsqlRowCount(response, opts.expectedRowCount!, {
      maxScore: pointsPerCheck,
      tolerance: opts.rowCountTolerance ?? 0,
    });
    totalScore += result.score;
    feedbackParts.push(result.feedback);
  }

  if (hasValues) {
    const result = scoreEsqlValues(response, opts.expectedValues!, {
      maxScore: pointsPerCheck,
      orderMatters: opts.orderMatters ?? false,
    });
    totalScore += result.score;
    feedbackParts.push(result.feedback);
  }

  totalScore = Math.min(totalScore, maxScore);
  const correct = totalScore >= maxScore * 0.8;

  return {
    correct,
    score: totalScore,
    maxScore,
    feedback: feedbackParts.join(' '),
  };
}
