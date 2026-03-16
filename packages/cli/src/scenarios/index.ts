import type { Scenario } from '../types';
import { esqlScenarios } from './esql';
import { observabilityScenarios } from './observability';
import { securityScenarios } from './security';
import { cloudScenarios } from './cloud';
import { kibanaScenarios } from './kibana';
import { elasticsearchSecurityScenarios } from './elasticsearch-security';
import { observabilityExtendedScenarios } from './observability-extended';
import { securityExtendedScenarios } from './security-extended';

export function getAllScenarios(): Scenario[] {
  return [
    ...esqlScenarios,
    ...observabilityScenarios,
    ...securityScenarios,
    ...cloudScenarios,
    ...kibanaScenarios,
    ...elasticsearchSecurityScenarios,
    ...observabilityExtendedScenarios,
    ...securityExtendedScenarios,
  ];
}

export function getScenariosByDomain(domain: string): Scenario[] {
  return getAllScenarios().filter((s) => s.domain === domain);
}

export function getScenariosBySkill(skillId: string): Scenario[] {
  return getAllScenarios().filter((s) => s.skillId === skillId);
}

export {
  esqlScenarios,
  observabilityScenarios,
  securityScenarios,
  cloudScenarios,
  kibanaScenarios,
  elasticsearchSecurityScenarios,
  observabilityExtendedScenarios,
  securityExtendedScenarios,
};
