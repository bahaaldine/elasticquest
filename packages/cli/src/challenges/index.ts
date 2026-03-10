import type { Challenge } from '../types';
import { fullTextSearchChallenges } from './full-text-search';
import { ingestIndexingChallenges } from './ingest-indexing';
import { aggregationsChallenges } from './aggregations';
import { observabilityChallenges } from './observability';
import { vectorSearchChallenges } from './vector-search';

export function getAllChallenges(): Challenge[] {
  return [
    ...fullTextSearchChallenges,
    ...ingestIndexingChallenges,
    ...aggregationsChallenges,
    ...observabilityChallenges,
    ...vectorSearchChallenges,
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
};
