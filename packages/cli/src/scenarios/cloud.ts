/**
 * Cloud scenarios — aligned to Elastic Cloud API skills.
 *
 * These scenarios test a model's ability to produce correct API request
 * bodies for Elastic Cloud operations (project management, access control,
 * network security). The response format is 'api-call' — the model produces
 * a JSON object representing the request body, and validation checks its
 * structure and required fields.
 *
 * Data: minimal placeholder docs (these scenarios don't query ES data).
 */

import type {
  Scenario,
  SearchResponse,
  EsqlResponse,
  Document,
  IndexMapping,
} from '../types';

// --- Placeholder data (Cloud scenarios don't need real ES data) ---

const placeholderDocs: Document[] = [
  { _id: 'c-1', _index: 'eq-cloud-config', _source: { type: 'placeholder' } },
];

const placeholderMapping: IndexMapping = {
  properties: { type: { type: 'keyword' as const } },
};

// --- Helpers ---

function isNonEmptyString(val: unknown): val is string {
  return typeof val === 'string' && val.length > 0;
}

function isNonEmptyArray(val: unknown): val is unknown[] {
  return Array.isArray(val) && val.length > 0;
}

function hasFields(
  obj: Record<string, unknown>,
  fields: string[],
): { present: string[]; missing: string[] } {
  const present: string[] = [];
  const missing: string[] = [];
  for (const f of fields) {
    if (obj[f] !== undefined && obj[f] !== null) {
      present.push(f);
    } else {
      missing.push(f);
    }
  }
  return { present, missing };
}

// --- Scenarios ---

export const cloudScenarios: Scenario[] = [
  // 1. Cloud setup — beginner
  {
    id: 'cloud-1-setup',
    skillId: 'cloud-setup',
    domain: 'cloud',
    difficulty: 'beginner',
    title: 'Cloud API Configuration',
    description:
      'Produce a JSON configuration object for connecting to the Elastic Cloud API. ' +
      'The configuration must include: ' +
      '(1) an "apiKey" field with a placeholder API key string, ' +
      '(2) a "region" field set to "us-east-1", and ' +
      '(3) a "baseUrl" field set to "https://api.elastic-cloud.com". ' +
      'This configuration will be used to authenticate subsequent API calls.',
    hints: [
      'The response should be a flat JSON object with three fields',
      'apiKey should be a non-empty string (use a placeholder value)',
      'region should be exactly "us-east-1"',
      'baseUrl should be the Elastic Cloud API endpoint',
    ],
    indexName: 'eq-cloud-config',
    seedData: placeholderDocs,
    mapping: placeholderMapping,
    responseFormat: 'api-call',
    maxScore: 100,
    timeLimitMs: 30000,
    skillPaths: ['cloud/cloud-setup/SKILL.md'],
    validate: async (response) => {
      const body = response as unknown as Record<string, unknown>;

      let score = 0;
      const feedback: string[] = [];

      // apiKey present and is a string
      if (isNonEmptyString(body.apiKey)) {
        score += 30;
      } else {
        feedback.push('Missing or empty "apiKey" field (expected a non-empty string).');
      }

      // region is "us-east-1"
      if (body.region === 'us-east-1') {
        score += 35;
      } else if (isNonEmptyString(body.region)) {
        score += 10;
        feedback.push('Region should be "us-east-1".');
      } else {
        feedback.push('Missing "region" field.');
      }

      // baseUrl is correct
      if (body.baseUrl === 'https://api.elastic-cloud.com') {
        score += 35;
      } else if (isNonEmptyString(body.baseUrl) && String(body.baseUrl).includes('elastic-cloud')) {
        score += 15;
        feedback.push('baseUrl should be exactly "https://api.elastic-cloud.com".');
      } else {
        feedback.push('Missing or incorrect "baseUrl" field.');
      }

      return {
        correct: score >= 80,
        score,
        maxScore: 100,
        feedback: score >= 80
          ? 'Correct! Valid Cloud API configuration with apiKey, region, and baseUrl.'
          : feedback.join(' '),
      };
    },
  },

  // 2. Create Serverless project — intermediate
  {
    id: 'cloud-2-create-project',
    skillId: 'cloud-create-project',
    domain: 'cloud',
    difficulty: 'intermediate',
    title: 'Create a Serverless Project',
    description:
      'Produce the JSON request body for a POST request to create a new Elastic Cloud ' +
      'Serverless project. The body must include: ' +
      '(1) "name" set to "my-search-project", ' +
      '(2) "type" set to one of "elasticsearch", "observability", or "security" — use "elasticsearch", and ' +
      '(3) "region_id" set to "aws-us-east-1". ' +
      'This corresponds to the POST /api/v1/serverless/projects endpoint.',
    hints: [
      'The body is a flat JSON object with three required fields',
      'Valid project types are: "elasticsearch", "observability", "security"',
      'region_id follows the pattern "provider-region" (e.g., "aws-us-east-1")',
      'The name should be a descriptive project identifier',
    ],
    indexName: 'eq-cloud-config',
    seedData: placeholderDocs,
    mapping: placeholderMapping,
    responseFormat: 'api-call',
    maxScore: 100,
    timeLimitMs: 30000,
    skillPaths: ['cloud/cloud-create-project/SKILL.md'],
    validate: async (response) => {
      const body = response as unknown as Record<string, unknown>;

      let score = 0;
      const feedback: string[] = [];

      // name field
      if (body.name === 'my-search-project') {
        score += 30;
      } else if (isNonEmptyString(body.name)) {
        score += 15;
        feedback.push('Project name should be "my-search-project".');
      } else {
        feedback.push('Missing "name" field.');
      }

      // type field — must be one of the valid types
      const validTypes = ['elasticsearch', 'observability', 'security'];
      if (body.type === 'elasticsearch') {
        score += 40;
      } else if (validTypes.includes(body.type as string)) {
        score += 20;
        feedback.push('Type should be "elasticsearch" as specified.');
      } else if (isNonEmptyString(body.type)) {
        score += 5;
        feedback.push(
          `Invalid type "${body.type}". Must be one of: ${validTypes.join(', ')}.`,
        );
      } else {
        feedback.push('Missing "type" field.');
      }

      // region_id
      if (body.region_id === 'aws-us-east-1') {
        score += 30;
      } else if (isNonEmptyString(body.region_id)) {
        score += 10;
        feedback.push('region_id should be "aws-us-east-1".');
      } else {
        feedback.push('Missing "region_id" field.');
      }

      return {
        correct: score >= 80,
        score,
        maxScore: 100,
        feedback: score >= 80
          ? 'Correct! Valid Serverless project creation request.'
          : feedback.join(' '),
      };
    },
  },

  // 3. Manage (update) project — intermediate
  {
    id: 'cloud-3-manage-project',
    skillId: 'cloud-manage-project',
    domain: 'cloud',
    difficulty: 'intermediate',
    title: 'Update a Serverless Project',
    description:
      'Produce the JSON request body for a PATCH request to update an existing ' +
      'Elastic Cloud Serverless project. The update should: ' +
      '(1) change the "name" to "production-search", ' +
      '(2) set "search_power" to 100 (boost search performance), and ' +
      '(3) include an "alias" field set to "prod-search-alias". ' +
      'This corresponds to the PATCH /api/v1/serverless/projects/elasticsearch/{id} endpoint.',
    hints: [
      'Only include the fields you want to update',
      'search_power is a numeric field controlling search performance',
      'alias is a string identifier for the project',
      'name is the updated display name for the project',
    ],
    indexName: 'eq-cloud-config',
    seedData: placeholderDocs,
    mapping: placeholderMapping,
    responseFormat: 'api-call',
    maxScore: 100,
    timeLimitMs: 30000,
    skillPaths: ['cloud/cloud-manage-project/SKILL.md'],
    validate: async (response) => {
      const body = response as unknown as Record<string, unknown>;

      let score = 0;
      const feedback: string[] = [];

      // name
      if (body.name === 'production-search') {
        score += 30;
      } else if (isNonEmptyString(body.name)) {
        score += 10;
        feedback.push('Name should be "production-search".');
      } else {
        feedback.push('Missing "name" field.');
      }

      // search_power
      if (body.search_power === 100) {
        score += 35;
      } else if (typeof body.search_power === 'number' && body.search_power > 0) {
        score += 15;
        feedback.push('search_power should be 100.');
      } else {
        feedback.push('Missing or invalid "search_power" field (expected number 100).');
      }

      // alias
      if (body.alias === 'prod-search-alias') {
        score += 35;
      } else if (isNonEmptyString(body.alias)) {
        score += 15;
        feedback.push('alias should be "prod-search-alias".');
      } else {
        feedback.push('Missing "alias" field.');
      }

      return {
        correct: score >= 80,
        score,
        maxScore: 100,
        feedback: score >= 80
          ? 'Correct! Valid project update request with name, search_power, and alias.'
          : feedback.join(' '),
      };
    },
  },

  // 4. Access management — advanced
  {
    id: 'cloud-4-access-management',
    skillId: 'cloud-access-management',
    domain: 'cloud',
    difficulty: 'advanced',
    title: 'Invite a User to the Organization',
    description:
      'Produce the JSON request body for a POST request to invite a user to an ' +
      'Elastic Cloud organization. The body must include: ' +
      '(1) "email" set to "analyst@example.com", and ' +
      '(2) "role_assignments" — an object with an "organization" array containing ' +
      'one entry with "organization_id" set to "org-abc-123" and "role_id" set to "billing-admin". ' +
      'This corresponds to the POST /api/v1/organizations/{id}/invitations endpoint.',
    hints: [
      'role_assignments is an object, not an array',
      'role_assignments.organization is an array of role assignment objects',
      'Each role assignment needs both organization_id and role_id',
      'Common role_ids: "organization-admin", "billing-admin", "viewer"',
    ],
    indexName: 'eq-cloud-config',
    seedData: placeholderDocs,
    mapping: placeholderMapping,
    responseFormat: 'api-call',
    maxScore: 100,
    timeLimitMs: 30000,
    skillPaths: ['cloud/cloud-access-management/SKILL.md'],
    validate: async (response) => {
      const body = response as unknown as Record<string, unknown>;

      let score = 0;
      const feedback: string[] = [];

      // email
      if (body.email === 'analyst@example.com') {
        score += 25;
      } else if (isNonEmptyString(body.email) && String(body.email).includes('@')) {
        score += 10;
        feedback.push('Email should be "analyst@example.com".');
      } else {
        feedback.push('Missing or invalid "email" field.');
      }

      // role_assignments is an object
      const ra = body.role_assignments;
      if (ra && typeof ra === 'object' && !Array.isArray(ra)) {
        score += 15;

        const raObj = ra as Record<string, unknown>;
        const orgArr = raObj.organization;

        // organization is an array
        if (isNonEmptyArray(orgArr)) {
          score += 15;

          const firstEntry = orgArr[0] as Record<string, unknown>;

          // organization_id
          if (firstEntry.organization_id === 'org-abc-123') {
            score += 25;
          } else if (isNonEmptyString(firstEntry.organization_id)) {
            score += 10;
            feedback.push('organization_id should be "org-abc-123".');
          } else {
            feedback.push('Missing "organization_id" in role assignment.');
          }

          // role_id
          if (firstEntry.role_id === 'billing-admin') {
            score += 20;
          } else if (isNonEmptyString(firstEntry.role_id)) {
            score += 8;
            feedback.push('role_id should be "billing-admin".');
          } else {
            feedback.push('Missing "role_id" in role assignment.');
          }
        } else {
          feedback.push(
            'role_assignments.organization should be an array of role assignment objects.',
          );
        }
      } else {
        feedback.push(
          'Missing or invalid "role_assignments" field (expected an object with "organization" array).',
        );
      }

      return {
        correct: score >= 75,
        score,
        maxScore: 100,
        feedback: score >= 75
          ? 'Correct! Valid user invitation with nested role assignments.'
          : feedback.join(' '),
      };
    },
  },

  // 5. Network security (IP filter) — advanced
  {
    id: 'cloud-5-network-security',
    skillId: 'cloud-network-security',
    domain: 'cloud',
    difficulty: 'advanced',
    title: 'Create an IP Filter Rule Set',
    description:
      'Produce the JSON request body for a POST request to create an IP filter ' +
      'rule set for an Elastic Cloud deployment. The body must include: ' +
      '(1) "name" set to "office-only", ' +
      '(2) "type" set to "ip", and ' +
      '(3) "rules" — an array with at least one rule object containing ' +
      '"source" set to "203.0.113.0/24" (office CIDR block) and "description" set to "Office network". ' +
      'This corresponds to the POST /api/v1/deployments/ip-filtering/rulesets endpoint.',
    hints: [
      'The top-level object has name, type, and rules',
      'type must be exactly "ip"',
      'rules is an array of objects, each with at least source and description',
      'source should be in CIDR notation (e.g., "203.0.113.0/24")',
    ],
    indexName: 'eq-cloud-config',
    seedData: placeholderDocs,
    mapping: placeholderMapping,
    responseFormat: 'api-call',
    maxScore: 100,
    timeLimitMs: 30000,
    skillPaths: ['cloud/cloud-network-security/SKILL.md'],
    validate: async (response) => {
      const body = response as unknown as Record<string, unknown>;

      let score = 0;
      const feedback: string[] = [];

      // name
      if (body.name === 'office-only') {
        score += 20;
      } else if (isNonEmptyString(body.name)) {
        score += 8;
        feedback.push('Name should be "office-only".');
      } else {
        feedback.push('Missing "name" field.');
      }

      // type must be "ip"
      if (body.type === 'ip') {
        score += 25;
      } else if (isNonEmptyString(body.type)) {
        score += 5;
        feedback.push('Type must be exactly "ip".');
      } else {
        feedback.push('Missing "type" field (expected "ip").');
      }

      // rules array
      if (isNonEmptyArray(body.rules)) {
        score += 15;

        const firstRule = body.rules[0] as Record<string, unknown>;

        // source CIDR
        if (firstRule.source === '203.0.113.0/24') {
          score += 25;
        } else if (
          isNonEmptyString(firstRule.source) &&
          String(firstRule.source).includes('/')
        ) {
          score += 10;
          feedback.push('Source should be "203.0.113.0/24".');
        } else {
          feedback.push('Missing or invalid "source" in rule (expected CIDR notation).');
        }

        // description
        if (firstRule.description === 'Office network') {
          score += 15;
        } else if (isNonEmptyString(firstRule.description)) {
          score += 8;
          feedback.push('Rule description should be "Office network".');
        } else {
          feedback.push('Missing "description" in rule.');
        }
      } else {
        feedback.push(
          'Missing or empty "rules" array (expected at least one rule with source and description).',
        );
      }

      return {
        correct: score >= 75,
        score,
        maxScore: 100,
        feedback: score >= 75
          ? 'Correct! Valid IP filter rule set with CIDR source.'
          : feedback.join(' '),
      };
    },
  },
];
