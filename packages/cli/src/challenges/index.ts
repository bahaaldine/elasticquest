import type { Challenge } from '../types';
import { fullTextSearchChallenges } from './full-text-search';
import { ingestIndexingChallenges } from './ingest-indexing';
import { aggregationsChallenges } from './aggregations';
import { observabilityChallenges } from './observability';
import { vectorSearchChallenges } from './vector-search';
import { securityChallenges } from './security';

// Individual challenges can be imported here as they're added.
// Example: import { challenge as fts15Synonym } from './full-text-search/fts-15-synonym';
const individualChallenges: Challenge[] = [
  // Add individual challenge imports here:
  // fts15Synonym,
];

export function getAllChallenges(): Challenge[] {
  return [
    ...fullTextSearchChallenges,
    ...ingestIndexingChallenges,
    ...aggregationsChallenges,
    ...observabilityChallenges,
    ...vectorSearchChallenges,
    ...securityChallenges,
    ...individualChallenges,
  ];
}

export function getChallengesByDomain(domain: string): Challenge[] {
  return getAllChallenges().filter((c) => c.domain === domain);
}

export {
  fullTextSearchChallenges,
  ingestIndexingChallenges,
  aggregationsChallenges,
  observabilityChallenges,
  vectorSearchChallenges,
  securityChallenges,
};
