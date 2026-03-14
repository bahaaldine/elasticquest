import type { Scenario } from '../types';
import { esqlScenarios } from './esql';
import { observabilityScenarios } from './observability';
import { securityScenarios } from './security';

export function getAllScenarios(): Scenario[] {
  return [
    ...esqlScenarios,
    ...observabilityScenarios,
    ...securityScenarios,
  ];
}

export function getScenariosByDomain(domain: string): Scenario[] {
  return getAllScenarios().filter((s) => s.domain === domain);
}

export function getScenariosBySkill(skillId: string): Scenario[] {
  return getAllScenarios().filter((s) => s.skillId === skillId);
}

export { esqlScenarios, observabilityScenarios, securityScenarios };
