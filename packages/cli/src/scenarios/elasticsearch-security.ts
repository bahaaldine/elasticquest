/**
 * Elasticsearch Security scenarios — aligned to ES audit, authentication,
 * authorization, and security troubleshooting skills.
 *
 * Scenarios:
 * 1. elasticsearch-audit: ES|QL query over audit log entries
 * 2. elasticsearch-authn: API call to create an API key
 * 3. elasticsearch-authz: API call to create a role with document-level security
 * 4. elasticsearch-security-troubleshooting: Diagnose a 401 error + diagnostic query
 *
 * Data: ~200 deterministic audit log entries with mixed event types.
 */

import type {
  Scenario,
  EsqlResponse,
  SearchResponse,
  Document,
  IndexMapping,
} from '../types';

// ---------------------------------------------------------------------------
// Seeded PRNG
// ---------------------------------------------------------------------------

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// ---------------------------------------------------------------------------
// Audit log generator
// ---------------------------------------------------------------------------

const AUDIT_USERS = [
  'elastic', 'kibana_system', 'logstash_internal', 'beats_system',
  'apm_system', 'developer', 'analyst', 'deploy-bot', 'admin',
  'service-account-ingest',
];

const AUDIT_IPS = [
  '10.0.1.10', '10.0.1.11', '10.0.1.20', '10.0.1.30',
  '10.0.2.5', '10.0.2.10', '192.168.1.50', '192.168.1.51',
  '203.0.113.77', '198.51.100.22',
];

const AUDIT_EVENT_TYPES: Array<{
  type: string;
  weight: number;
  outcomeWeights: { success: number; failure: number };
}> = [
  { type: 'authentication_success', weight: 0.35, outcomeWeights: { success: 1, failure: 0 } },
  { type: 'authentication_failed', weight: 0.20, outcomeWeights: { success: 0, failure: 1 } },
  { type: 'access_granted', weight: 0.30, outcomeWeights: { success: 1, failure: 0 } },
  { type: 'access_denied', weight: 0.15, outcomeWeights: { success: 0, failure: 1 } },
];

const AUDIT_REALMS = ['native', 'file', 'pki', 'token', 'api_key'];
const AUDIT_INDICES = [
  'my-app-logs', '.kibana', '.security', 'metrics-*', 'apm-*',
  'filebeat-*', 'metricbeat-*', 'fleet-actions',
];
const AUDIT_ACTIONS = [
  'indices:data/read/search', 'indices:data/write/index',
  'indices:data/write/bulk', 'indices:admin/create',
  'cluster:monitor/health', 'cluster:admin/settings/update',
  'indices:data/read/scroll', 'indices:admin/mapping/put',
];

export const auditLogsMapping: IndexMapping = {
  properties: {
    '@timestamp': { type: 'date' },
    'event.type': { type: 'keyword' },
    'event.outcome': { type: 'keyword' },
    'user.name': { type: 'keyword' },
    'source.ip': { type: 'ip' },
    'authentication.realm': { type: 'keyword' },
    'action': { type: 'keyword' },
    'indices': { type: 'keyword' },
    message: { type: 'text' },
  },
};

export function generateAuditLogs(count = 200, seed = 42): Document[] {
  const rng = seededRng(seed);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const docs: Document[] = [];

  // Use recent timestamps so time-based queries (NOW() - 24h) work
  const baseTime = Date.now() - 12 * 60 * 60 * 1000; // 12 hours ago
  const durationMs = 24 * 60 * 60 * 1000;

  // Cumulative weights for event type selection
  const totalWeight = AUDIT_EVENT_TYPES.reduce((sum, e) => sum + e.weight, 0);

  for (let i = 0; i < count; i++) {
    const offsetMs = Math.floor(rng() * durationMs);
    const ts = new Date(baseTime + offsetMs).toISOString();

    // Select event type by weighted random
    let roll = rng() * totalWeight;
    let eventDef = AUDIT_EVENT_TYPES[0];
    for (const def of AUDIT_EVENT_TYPES) {
      roll -= def.weight;
      if (roll <= 0) {
        eventDef = def;
        break;
      }
    }

    const outcome = eventDef.outcomeWeights.success > 0 ? 'success' : 'failure';
    const user = pick(AUDIT_USERS);
    const ip = pick(AUDIT_IPS);
    const realm = pick(AUDIT_REALMS);
    const action = pick(AUDIT_ACTIONS);
    const index = pick(AUDIT_INDICES);

    let message: string;
    switch (eventDef.type) {
      case 'authentication_success':
        message = `User [${user}] authenticated successfully via [${realm}] realm from [${ip}]`;
        break;
      case 'authentication_failed':
        message = `Failed to authenticate user [${user}] via [${realm}] realm from [${ip}]`;
        break;
      case 'access_granted':
        message = `Access granted for user [${user}] action [${action}] on indices [${index}]`;
        break;
      case 'access_denied':
        message = `Access denied for user [${user}] action [${action}] on indices [${index}]`;
        break;
      default:
        message = `Audit event: ${eventDef.type} for user [${user}]`;
    }

    docs.push({
      _id: `audit-${i + 1}`,
      _index: 'eq-audit-logs',
      _source: {
        '@timestamp': ts,
        'event.type': eventDef.type,
        'event.outcome': outcome,
        'user.name': user,
        'source.ip': ip,
        'authentication.realm': realm,
        action,
        indices: index,
        message,
      },
    });
  }

  docs.sort((a, b) =>
    (a._source['@timestamp'] as string).localeCompare(
      b._source['@timestamp'] as string,
    ),
  );

  return docs;
}

export function getAuditFacts(docs: Document[]): {
  totalCount: number;
  failedAuthCount: number;
  accessDeniedCount: number;
  usersWithFailedAuth: string[];
  ipsWithFailedAuth: string[];
} {
  let failedAuthCount = 0;
  let accessDeniedCount = 0;
  const failedAuthUsers = new Set<string>();
  const failedAuthIps = new Set<string>();

  for (const doc of docs) {
    const eventType = doc._source['event.type'] as string;
    if (eventType === 'authentication_failed') {
      failedAuthCount++;
      failedAuthUsers.add(doc._source['user.name'] as string);
      failedAuthIps.add(doc._source['source.ip'] as string);
    }
    if (eventType === 'access_denied') {
      accessDeniedCount++;
    }
  }

  return {
    totalCount: docs.length,
    failedAuthCount,
    accessDeniedCount,
    usersWithFailedAuth: [...failedAuthUsers],
    ipsWithFailedAuth: [...failedAuthIps],
  };
}

// ---------------------------------------------------------------------------
// Placeholder data for API-call scenarios (no ES query needed)
// ---------------------------------------------------------------------------

const placeholderDocs: Document[] = [
  { _id: 'p-1', _index: 'eq-placeholder', _source: { type: 'placeholder' } },
];
const placeholderMapping: IndexMapping = {
  properties: { type: { type: 'keyword' } },
};

// ---------------------------------------------------------------------------
// Generated data
// ---------------------------------------------------------------------------

const auditDocs = generateAuditLogs(200, 42);
const auditFacts = getAuditFacts(auditDocs);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esqlHasColumn(resp: EsqlResponse, name: string): boolean {
  return resp.columns.some((c) => c.name === name);
}

function esqlGetValues(resp: EsqlResponse, columnName: string): unknown[] {
  const idx = resp.columns.findIndex((c) => c.name === columnName);
  if (idx === -1) return [];
  return resp.values.map((row) => row[idx]);
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

export const elasticsearchSecurityScenarios: Scenario[] = [
  // 1. Audit — ES|QL query to find failed authentication events
  {
    id: 'es-sec-1-audit-failed-auth',
    skillId: 'elasticsearch-audit',
    domain: 'security',
    difficulty: 'intermediate',
    title: 'Audit Log: Failed Authentication Analysis',
    description:
      'Write an ES|QL query to find all failed authentication events in the audit logs. ' +
      'Return the timestamp, user name, source IP, authentication realm, and message. ' +
      'Group by user name and source IP, showing the count of failures for each combination. ' +
      'Sort by failure count descending. ' +
      `The index contains ${auditFacts.totalCount} audit log entries with ` +
      `${auditFacts.failedAuthCount} failed authentication events and ` +
      `${auditFacts.accessDeniedCount} access denied events.`,
    hints: [
      'Use FROM with the audit logs index',
      'Filter WHERE event.type == "authentication_failed"',
      'Use STATS with COUNT(*) grouped BY user.name, source.ip',
      'SORT by the count descending',
    ],
    indexName: 'eq-audit-logs',
    seedData: auditDocs,
    mapping: auditLogsMapping,
    responseFormat: 'esql',
    maxScore: 100,
    timeLimitMs: 30000,
    skillPaths: ['elasticsearch/elasticsearch-audit/SKILL.md'],
    validate: async (response) => {
      const resp = response as EsqlResponse;

      if (!resp.columns || !resp.values) {
        return {
          correct: false,
          score: 0,
          maxScore: 100,
          feedback: 'No ES|QL results returned.',
        };
      }

      let score = 0;
      const feedback: string[] = [];

      // Should have user.name column
      if (esqlHasColumn(resp, 'user.name')) {
        score += 15;
      } else {
        feedback.push('Missing user.name column.');
      }

      // Should have source.ip column
      if (esqlHasColumn(resp, 'source.ip')) {
        score += 15;
      } else {
        feedback.push('Missing source.ip column.');
      }

      // Should have a count column
      const hasCount = resp.columns.some((c) =>
        c.name.toLowerCase().includes('count'),
      );
      if (hasCount) {
        score += 15;
      } else {
        feedback.push('Missing failure count column.');
      }

      // Should return results (failed auth events exist)
      if (resp.values.length > 0) {
        score += 15;
      } else {
        feedback.push('No results returned — expected failed authentication events.');
      }

      // Should include known users with failed auth
      const users = new Set(esqlGetValues(resp, 'user.name'));
      const matchedUsers = auditFacts.usersWithFailedAuth.filter((u) =>
        users.has(u),
      );
      if (matchedUsers.length >= 3) {
        score += 20;
      } else if (matchedUsers.length >= 1) {
        score += 10;
        feedback.push(
          `Found ${matchedUsers.length} of ${auditFacts.usersWithFailedAuth.length} ` +
            'users with failed auth.',
        );
      } else {
        feedback.push('Expected to find users with failed authentication attempts.');
      }

      // Should be sorted by count descending
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
          feedback.push('Results not sorted by failure count descending.');
        }
      }

      return {
        correct: score >= 70,
        score,
        maxScore: 100,
        feedback:
          score >= 70
            ? `Correct! Found ${auditFacts.failedAuthCount} failed auth events across ` +
              `${auditFacts.usersWithFailedAuth.length} users.`
            : feedback.join(' '),
      };
    },
  },

  // 2. Authentication — API call to create an API key
  {
    id: 'es-sec-2-create-api-key',
    skillId: 'elasticsearch-authn',
    domain: 'security',
    difficulty: 'intermediate',
    title: 'Create an Elasticsearch API Key',
    description:
      'Produce a JSON API call body for POST /_security/api_key to create an API key ' +
      'with the following requirements:\n' +
      '- Name: "ingest-pipeline-key"\n' +
      '- Expiration: 30 days ("30d")\n' +
      '- Role descriptors: a role called "ingest_role" with:\n' +
      '  - cluster privileges: ["monitor", "manage_ingest_pipelines"]\n' +
      '  - index privileges on "logs-*" with privileges ["create_doc", "create_index"]\n' +
      'Return ONLY the JSON body (not the HTTP method or URL).',
    hints: [
      'The top-level fields are: name, expiration, role_descriptors',
      'role_descriptors is an object keyed by role name',
      'Each role has cluster (array of strings) and indices (array of objects)',
      'Each index entry has names (array) and privileges (array)',
    ],
    indexName: 'eq-placeholder',
    seedData: placeholderDocs,
    mapping: placeholderMapping,
    responseFormat: 'api-call',
    maxScore: 100,
    timeLimitMs: 30000,
    skillPaths: ['elasticsearch/elasticsearch-authn/SKILL.md'],
    validate: async (response) => {
      // For api-call scenarios the runner passes the parsed JSON body
      // as a SearchResponse with the raw body in aggregations._raw
      const raw = response as unknown as Record<string, unknown>;
      let body: Record<string, unknown>;

      try {
        // The response may arrive as-is (object) or wrapped
        body =
          typeof raw === 'object' && raw !== null
            ? (raw as Record<string, unknown>)
            : JSON.parse(String(raw));
      } catch {
        return {
          correct: false,
          score: 0,
          maxScore: 100,
          feedback: 'Response is not valid JSON.',
        };
      }

      let score = 0;
      const feedback: string[] = [];

      // name
      if (body.name === 'ingest-pipeline-key') {
        score += 15;
      } else {
        feedback.push(
          `Expected name "ingest-pipeline-key", got "${String(body.name)}".`,
        );
      }

      // expiration
      if (body.expiration === '30d') {
        score += 10;
      } else {
        feedback.push(`Expected expiration "30d", got "${String(body.expiration)}".`);
      }

      // role_descriptors
      const rd = body.role_descriptors as Record<string, unknown> | undefined;
      if (rd && typeof rd === 'object') {
        score += 10;

        const ingestRole = rd.ingest_role as Record<string, unknown> | undefined;
        if (ingestRole && typeof ingestRole === 'object') {
          score += 10;

          // cluster privileges
          const cluster = ingestRole.cluster as string[] | undefined;
          if (
            Array.isArray(cluster) &&
            cluster.includes('monitor') &&
            cluster.includes('manage_ingest_pipelines')
          ) {
            score += 20;
          } else {
            feedback.push(
              'Cluster privileges should include "monitor" and "manage_ingest_pipelines".',
            );
          }

          // indices
          const indices = ingestRole.indices as Array<Record<string, unknown>> | undefined;
          if (Array.isArray(indices) && indices.length >= 1) {
            const idx = indices[0];
            const names = idx.names as string[] | undefined;
            const privs = idx.privileges as string[] | undefined;

            if (Array.isArray(names) && names.includes('logs-*')) {
              score += 15;
            } else {
              feedback.push('Index names should include "logs-*".');
            }

            if (
              Array.isArray(privs) &&
              privs.includes('create_doc') &&
              privs.includes('create_index')
            ) {
              score += 20;
            } else {
              feedback.push(
                'Index privileges should include "create_doc" and "create_index".',
              );
            }
          } else {
            feedback.push('Missing indices array in ingest_role.');
          }
        } else {
          feedback.push('Missing "ingest_role" in role_descriptors.');
        }
      } else {
        feedback.push('Missing role_descriptors object.');
      }

      return {
        correct: score >= 70,
        score,
        maxScore: 100,
        feedback:
          score >= 70
            ? 'Correct! API key body with proper role descriptors, cluster and index privileges.'
            : feedback.join(' '),
      };
    },
  },

  // 3. Authorization — API call to create a role with document-level security
  {
    id: 'es-sec-3-create-role-dls',
    skillId: 'elasticsearch-authz',
    domain: 'security',
    difficulty: 'advanced',
    title: 'Create a Role with Document-Level Security',
    description:
      'Produce a JSON API call body for POST /_security/role/regional_analyst to create ' +
      'a role with document-level security. Requirements:\n' +
      '- Cluster privileges: ["monitor"]\n' +
      '- Index privileges on "sales-*" with:\n' +
      '  - privileges: ["read"]\n' +
      '  - Document-level security (query): only documents where region == "eu-west-1"\n' +
      '  - Field-level security (field_security.grant): ["@timestamp", "product", "revenue", "region"]\n' +
      'Return ONLY the JSON body.',
    hints: [
      'Document-level security uses a "query" field inside the index privilege',
      'The query is a standard ES query DSL object (e.g., {"term": {"region": "eu-west-1"}})',
      'Field-level security uses field_security with a "grant" array',
      'The role body has cluster and indices at the top level',
    ],
    indexName: 'eq-placeholder',
    seedData: placeholderDocs,
    mapping: placeholderMapping,
    responseFormat: 'api-call',
    maxScore: 100,
    timeLimitMs: 45000,
    skillPaths: ['elasticsearch/elasticsearch-authz/SKILL.md'],
    validate: async (response) => {
      const raw = response as unknown as Record<string, unknown>;
      let body: Record<string, unknown>;

      try {
        body =
          typeof raw === 'object' && raw !== null
            ? (raw as Record<string, unknown>)
            : JSON.parse(String(raw));
      } catch {
        return {
          correct: false,
          score: 0,
          maxScore: 100,
          feedback: 'Response is not valid JSON.',
        };
      }

      let score = 0;
      const feedback: string[] = [];

      // cluster privileges
      const cluster = body.cluster as string[] | undefined;
      if (Array.isArray(cluster) && cluster.includes('monitor')) {
        score += 10;
      } else {
        feedback.push('Cluster privileges should include "monitor".');
      }

      // indices
      const indices = body.indices as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(indices) && indices.length >= 1) {
        score += 5;
        const idx = indices[0];

        // names
        const names = idx.names as string[] | undefined;
        if (Array.isArray(names) && names.includes('sales-*')) {
          score += 10;
        } else {
          feedback.push('Index names should include "sales-*".');
        }

        // privileges
        const privs = idx.privileges as string[] | undefined;
        if (Array.isArray(privs) && privs.includes('read')) {
          score += 10;
        } else {
          feedback.push('Index privileges should include "read".');
        }

        // Document-level security (query)
        const query = idx.query as Record<string, unknown> | string | undefined;
        if (query) {
          score += 15;
          // Check the query references region and eu-west-1
          const queryStr =
            typeof query === 'string' ? query : JSON.stringify(query);
          if (
            queryStr.includes('region') &&
            queryStr.includes('eu-west-1')
          ) {
            score += 20;
          } else {
            feedback.push(
              'DLS query should filter documents where region == "eu-west-1".',
            );
          }
        } else {
          feedback.push('Missing document-level security query.');
        }

        // Field-level security
        const fls = idx.field_security as Record<string, unknown> | undefined;
        if (fls && typeof fls === 'object') {
          score += 10;
          const grant = fls.grant as string[] | undefined;
          if (Array.isArray(grant)) {
            const required = ['@timestamp', 'product', 'revenue', 'region'];
            const hasAll = required.every((f) => grant.includes(f));
            if (hasAll) {
              score += 20;
            } else {
              const missing = required.filter((f) => !grant.includes(f));
              feedback.push(
                `Field-level security grant missing: ${missing.join(', ')}.`,
              );
              score += 5;
            }
          } else {
            feedback.push('field_security.grant should be an array of field names.');
          }
        } else {
          feedback.push('Missing field_security for field-level security.');
        }
      } else {
        feedback.push('Missing indices array.');
      }

      return {
        correct: score >= 70,
        score,
        maxScore: 100,
        feedback:
          score >= 70
            ? 'Correct! Role with DLS (region filter) and FLS (field grant list).'
            : feedback.join(' '),
      };
    },
  },

  // 4. Security troubleshooting — diagnose 401 + diagnostic ES|QL query
  {
    id: 'es-sec-4-troubleshoot-401',
    skillId: 'elasticsearch-security-troubleshooting',
    domain: 'security',
    difficulty: 'advanced',
    title: 'Security Troubleshooting: 401 Unauthorized',
    description:
      'A service is receiving HTTP 401 responses from Elasticsearch with the error:\n' +
      '"security_exception: missing authentication credentials for REST request [/_bulk]"\n\n' +
      'The service account "logstash_internal" was working yesterday but started failing ' +
      'today at around 08:00 UTC. The service uses an API key for authentication.\n\n' +
      'Write an ES|QL query against the audit logs index to investigate this issue. ' +
      'Find all authentication events (both successes and failures) for "logstash_internal" ' +
      'within the last 24 hours, showing the timestamp, event type, outcome, source IP, ' +
      'and authentication realm. Sort by timestamp descending.\n\n' +
      `The audit index contains ${auditFacts.totalCount} entries.`,
    hints: [
      'Filter for user.name == "logstash_internal"',
      'Include both authentication_success and authentication_failed event types',
      'KEEP relevant fields: @timestamp, event.type, event.outcome, source.ip, authentication.realm',
      'SORT by @timestamp DESC to see the most recent events first',
    ],
    indexName: 'eq-audit-logs',
    seedData: auditDocs,
    mapping: auditLogsMapping,
    responseFormat: 'esql',
    maxScore: 100,
    timeLimitMs: 45000,
    skillPaths: ['elasticsearch/elasticsearch-security-troubleshooting/SKILL.md'],
    validate: async (response) => {
      const resp = response as EsqlResponse;

      if (!resp.columns || !resp.values) {
        return {
          correct: false,
          score: 0,
          maxScore: 100,
          feedback: 'No ES|QL results returned.',
        };
      }

      let score = 0;
      const feedback: string[] = [];

      // Should have timestamp column
      if (
        esqlHasColumn(resp, '@timestamp') ||
        resp.columns.some((c) => c.name.includes('timestamp'))
      ) {
        score += 10;
      } else {
        feedback.push('Missing timestamp column.');
      }

      // Should have event.type
      if (esqlHasColumn(resp, 'event.type')) {
        score += 10;
      } else {
        feedback.push('Missing event.type column.');
      }

      // Should have event.outcome
      if (esqlHasColumn(resp, 'event.outcome')) {
        score += 10;
      } else {
        feedback.push('Missing event.outcome column.');
      }

      // Should have source.ip
      if (esqlHasColumn(resp, 'source.ip')) {
        score += 10;
      } else {
        feedback.push('Missing source.ip column.');
      }

      // Should have authentication.realm
      if (esqlHasColumn(resp, 'authentication.realm')) {
        score += 10;
      } else {
        feedback.push('Missing authentication.realm column.');
      }

      // Results should be scoped to logstash_internal
      const users = esqlGetValues(resp, 'user.name');
      const allLogstash =
        users.length > 0 &&
        users.every((u) => u === 'logstash_internal');
      // If user.name isn't in the output, check the filter worked via row count
      if (allLogstash) {
        score += 20;
      } else if (users.length === 0 && resp.values.length > 0) {
        // user.name might have been omitted from KEEP but filter still applied
        // Give partial credit if row count is reasonable (not all 200)
        if (resp.values.length < auditFacts.totalCount * 0.5) {
          score += 10;
          feedback.push(
            'Include user.name in output to confirm filter is correct.',
          );
        } else {
          feedback.push(
            'Results not filtered to logstash_internal — too many rows.',
          );
        }
      } else {
        feedback.push('Results should be filtered to user.name == "logstash_internal".');
      }

      // Should return results
      if (resp.values.length > 0) {
        score += 10;
      } else {
        feedback.push('No results returned.');
      }

      // Sorted by timestamp descending
      const tsValues = esqlGetValues(
        resp,
        resp.columns.find(
          (c) => c.name === '@timestamp' || c.name.includes('timestamp'),
        )?.name ?? '@timestamp',
      );
      if (tsValues.length >= 2) {
        const sorted = tsValues.every(
          (v, i) => i === 0 || String(v) <= String(tsValues[i - 1]),
        );
        if (sorted) {
          score += 20;
        } else {
          feedback.push('Results should be sorted by timestamp descending.');
        }
      }

      return {
        correct: score >= 70,
        score,
        maxScore: 100,
        feedback:
          score >= 70
            ? 'Correct! Diagnostic query scoped to logstash_internal with relevant audit fields.'
            : feedback.join(' '),
      };
    },
  },
];
