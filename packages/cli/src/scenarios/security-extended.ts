/**
 * Extended Security scenarios — aligned to case management,
 * detection rule management, and sample data generation skills.
 *
 * Scenarios:
 * 1. security-case-management: API call to create a case
 * 2. security-detection-rule-management: API call to create a detection rule
 * 3. security-generate-sample-data: API call to generate security events
 */

import type {
  Scenario,
  Document,
  IndexMapping,
} from '../types';

// ---------------------------------------------------------------------------
// Placeholder data for API-call scenarios
// ---------------------------------------------------------------------------

const placeholderDocs: Document[] = [
  { _id: 'p-1', _index: 'eq-placeholder', _source: { type: 'placeholder' } },
];
const placeholderMapping: IndexMapping = {
  properties: { type: { type: 'keyword' } },
};

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

export const securityExtendedScenarios: Scenario[] = [
  // 1. Case Management — API call to create a case
  {
    id: 'sec-ext-1-create-case',
    skillId: 'security-case-management',
    domain: 'security',
    difficulty: 'intermediate',
    title: 'Create a Security Case',
    description:
      'Produce a JSON API call body for POST /api/cases to create a security case ' +
      'for a suspected data exfiltration incident. Requirements:\n' +
      '- Title: "Suspected Data Exfiltration — Server db-prod-01"\n' +
      '- Description: "Large outbound data transfer detected from db-prod-01 to external IP ' +
      '203.0.113.50 over port 443. Approximately 4.7 GB transferred in 30 minutes during ' +
      'non-business hours (02:00-02:30 UTC). Requires immediate investigation."\n' +
      '- Tags: ["data-exfiltration", "high-priority", "db-prod-01", "network"]\n' +
      '- Severity: "high"\n' +
      '- Connector: use "none" (id: "none", name: "none", type: ".none", fields: null)\n' +
      '- Settings: syncAlerts: true\n' +
      '- Owner: "securitySolution"\n\n' +
      'Return ONLY the JSON body.',
    hints: [
      'The top-level fields include: title, description, tags, severity, connector, settings, owner',
      'The connector object needs id, name, type, and fields properties',
      'settings contains syncAlerts boolean',
      'owner should be "securitySolution"',
    ],
    indexName: 'eq-placeholder',
    seedData: placeholderDocs,
    mapping: placeholderMapping,
    responseFormat: 'api-call',
    maxScore: 100,
    timeLimitMs: 30000,
    skillPaths: ['security/security-case-management/SKILL.md'],
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

      // title
      if (
        typeof body.title === 'string' &&
        body.title.toLowerCase().includes('data exfiltration') &&
        body.title.toLowerCase().includes('db-prod-01')
      ) {
        score += 15;
      } else {
        feedback.push(
          'Title should reference data exfiltration and db-prod-01.',
        );
      }

      // description
      if (typeof body.description === 'string' && body.description.length > 50) {
        score += 5;
        const desc = body.description.toLowerCase();
        if (
          desc.includes('203.0.113.50') &&
          desc.includes('4.7') &&
          desc.includes('non-business')
        ) {
          score += 10;
        } else if (desc.includes('203.0.113.50') || desc.includes('outbound')) {
          score += 5;
          feedback.push('Description should include key details: IP, data volume, timing.');
        }
      } else {
        feedback.push('Missing or too-short description.');
      }

      // tags
      const tags = body.tags as string[] | undefined;
      if (Array.isArray(tags)) {
        score += 5;
        if (
          tags.includes('data-exfiltration') &&
          tags.includes('high-priority')
        ) {
          score += 10;
        } else {
          feedback.push(
            'Tags should include "data-exfiltration" and "high-priority".',
          );
        }
      } else {
        feedback.push('Missing tags array.');
      }

      // severity
      if (body.severity === 'high') {
        score += 10;
      } else {
        feedback.push(`Severity should be "high", got "${String(body.severity)}".`);
      }

      // connector
      const connector = body.connector as Record<string, unknown> | undefined;
      if (connector && typeof connector === 'object') {
        if (
          connector.id === 'none' &&
          connector.type === '.none'
        ) {
          score += 15;
        } else if (connector.id === 'none' || connector.type === '.none') {
          score += 8;
          feedback.push('Connector should have id "none" and type ".none".');
        } else {
          feedback.push('Connector should use the "none" connector.');
        }

        if (connector.fields === null) {
          score += 5;
        }
      } else {
        feedback.push('Missing connector object.');
      }

      // settings
      const settings = body.settings as Record<string, unknown> | undefined;
      if (settings && typeof settings === 'object') {
        if (settings.syncAlerts === true) {
          score += 10;
        } else {
          feedback.push('settings.syncAlerts should be true.');
        }
      } else {
        feedback.push('Missing settings object.');
      }

      // owner
      if (body.owner === 'securitySolution') {
        score += 15;
      } else {
        feedback.push(
          `Owner should be "securitySolution", got "${String(body.owner)}".`,
        );
      }

      return {
        correct: score >= 70,
        score,
        maxScore: 100,
        feedback:
          score >= 70
            ? 'Correct! Case created with proper title, severity, connector, and owner.'
            : feedback.join(' '),
      };
    },
  },

  // 2. Detection Rule Management — API call to create a detection rule
  {
    id: 'sec-ext-2-create-detection-rule',
    skillId: 'security-detection-rule-management',
    domain: 'security',
    difficulty: 'advanced',
    title: 'Create a Detection Rule',
    description:
      'Produce a JSON API call body for POST /api/detection_engine/rules to create ' +
      'a detection rule for lateral movement via PsExec. Requirements:\n' +
      '- Name: "Lateral Movement via PsExec"\n' +
      '- Description: "Detects PsExec service installation on remote hosts, which may ' +
      'indicate lateral movement by an attacker."\n' +
      '- Type: "eql"\n' +
      '- Language: "eql"\n' +
      '- Query: \'process where process.name == "PSEXESVC.exe" and event.action == "start"\'\n' +
      '- Severity: "high"\n' +
      '- Risk score: 73\n' +
      '- Index patterns: ["winlogbeat-*", "logs-endpoint.events.*", "logs-windows.*"]\n' +
      '- Tags: ["Lateral Movement", "T1021", "Windows"]\n' +
      '- Interval: "5m"\n' +
      '- From: "now-6m"\n' +
      '- Enabled: true\n' +
      '- Threat mapping (MITRE ATT&CK):\n' +
      '  - Tactic: Lateral Movement (TA0008)\n' +
      '  - Technique: Remote Services (T1021)\n\n' +
      'Return ONLY the JSON body.',
    hints: [
      'Top-level fields: name, description, type, language, query, severity, risk_score, index, tags, interval, from, enabled, threat',
      'The type is "eql" and language is "eql" for Event Query Language rules',
      'threat is an array of objects with framework, tactic (id, name, reference), and technique (id, name, reference)',
      'risk_score is a number between 0-100',
    ],
    indexName: 'eq-placeholder',
    seedData: placeholderDocs,
    mapping: placeholderMapping,
    responseFormat: 'api-call',
    maxScore: 100,
    timeLimitMs: 60000,
    skillPaths: ['security/security-detection-rule-management/SKILL.md'],
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

      // name
      if (
        typeof body.name === 'string' &&
        body.name.toLowerCase().includes('psexec')
      ) {
        score += 5;
      } else {
        feedback.push('Name should reference PsExec.');
      }

      // description
      if (typeof body.description === 'string' && body.description.length > 20) {
        score += 5;
      } else {
        feedback.push('Missing or too-short description.');
      }

      // type
      if (body.type === 'eql') {
        score += 10;
      } else {
        feedback.push(`Type should be "eql", got "${String(body.type)}".`);
      }

      // language
      if (body.language === 'eql') {
        score += 5;
      } else {
        feedback.push(`Language should be "eql", got "${String(body.language)}".`);
      }

      // query
      if (typeof body.query === 'string') {
        const q = body.query.toLowerCase();
        if (q.includes('psexesvc') && q.includes('process')) {
          score += 15;
        } else {
          score += 5;
          feedback.push('Query should match PSEXESVC.exe process start events.');
        }
      } else {
        feedback.push('Missing query field.');
      }

      // severity
      if (body.severity === 'high') {
        score += 5;
      } else {
        feedback.push(`Severity should be "high", got "${String(body.severity)}".`);
      }

      // risk_score
      if (body.risk_score === 73) {
        score += 10;
      } else if (
        typeof body.risk_score === 'number' &&
        body.risk_score >= 50 &&
        body.risk_score <= 100
      ) {
        score += 5;
        feedback.push(`Risk score should be 73, got ${body.risk_score}.`);
      } else {
        feedback.push('Missing or invalid risk_score (should be 73).');
      }

      // index patterns
      const idx = body.index as string[] | undefined;
      if (Array.isArray(idx)) {
        if (
          idx.includes('winlogbeat-*') &&
          idx.some((i) => i.includes('endpoint'))
        ) {
          score += 10;
        } else {
          score += 3;
          feedback.push(
            'Index patterns should include "winlogbeat-*" and endpoint logs.',
          );
        }
      } else {
        feedback.push('Missing index patterns array.');
      }

      // tags
      const tags = body.tags as string[] | undefined;
      if (Array.isArray(tags) && tags.length >= 2) {
        score += 5;
      } else {
        feedback.push('Missing or incomplete tags.');
      }

      // interval + from
      if (body.interval === '5m') {
        score += 5;
      } else {
        feedback.push(`Interval should be "5m", got "${String(body.interval)}".`);
      }

      if (
        typeof body.from === 'string' &&
        body.from.includes('now-6m')
      ) {
        score += 5;
      }

      // enabled
      if (body.enabled === true) {
        score += 5;
      }

      // threat mapping (MITRE ATT&CK)
      const threat = body.threat as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(threat) && threat.length >= 1) {
        const entry = threat[0];
        const threatStr = JSON.stringify(entry).toLowerCase();

        if (threatStr.includes('ta0008') || threatStr.includes('lateral movement')) {
          score += 8;
        } else {
          feedback.push('Threat tactic should reference TA0008 (Lateral Movement).');
        }

        if (threatStr.includes('t1021') || threatStr.includes('remote services')) {
          score += 7;
        } else {
          feedback.push('Threat technique should reference T1021 (Remote Services).');
        }
      } else {
        feedback.push('Missing threat array with MITRE ATT&CK mapping.');
      }

      return {
        correct: score >= 70,
        score,
        maxScore: 100,
        feedback:
          score >= 70
            ? 'Correct! Detection rule with EQL query, MITRE mapping, and proper severity/risk.'
            : feedback.join(' '),
      };
    },
  },

  // 3. Generate Sample Data — API call to generate security events
  {
    id: 'sec-ext-3-generate-sample-data',
    skillId: 'security-generate-sample-data',
    domain: 'security',
    difficulty: 'intermediate',
    title: 'Generate Security Sample Data',
    description:
      'Produce a JSON API call body for POST /api/security/sample_data/generate ' +
      'to generate security sample events for a demo environment. Requirements:\n' +
      '- event_count: 5000\n' +
      '- packages: ["endpoint", "cloud_security", "network_traffic"]\n' +
      '- attack_scenario: "apt_simulation"\n' +
      '- time_range: last 7 days\n' +
      '  - start: "now-7d"\n' +
      '  - end: "now"\n' +
      '- settings:\n' +
      '  - inject_anomalies: true\n' +
      '  - anomaly_rate: 0.05 (5%)\n' +
      '  - include_mitre_tags: true\n' +
      '  - hosts: ["win-server-01", "win-workstation-02", "linux-web-01", "linux-db-01"]\n\n' +
      'Return ONLY the JSON body.',
    hints: [
      'Top-level fields: event_count, packages, attack_scenario, time_range, settings',
      'time_range has start and end fields',
      'settings contains inject_anomalies, anomaly_rate, include_mitre_tags, hosts',
      'packages is an array of integration package names',
    ],
    indexName: 'eq-placeholder',
    seedData: placeholderDocs,
    mapping: placeholderMapping,
    responseFormat: 'api-call',
    maxScore: 100,
    timeLimitMs: 30000,
    skillPaths: ['security/security-generate-sample-data/SKILL.md'],
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

      // event_count
      if (body.event_count === 5000) {
        score += 15;
      } else {
        feedback.push(
          `event_count should be 5000, got ${String(body.event_count)}.`,
        );
      }

      // packages
      const packages = body.packages as string[] | undefined;
      if (Array.isArray(packages)) {
        const required = ['endpoint', 'cloud_security', 'network_traffic'];
        const hasAll = required.every((p) => packages.includes(p));
        if (hasAll) {
          score += 20;
        } else {
          const missing = required.filter((p) => !packages.includes(p));
          score += 5;
          feedback.push(`Missing packages: ${missing.join(', ')}.`);
        }
      } else {
        feedback.push('Missing packages array.');
      }

      // attack_scenario
      if (body.attack_scenario === 'apt_simulation') {
        score += 10;
      } else {
        feedback.push(
          `attack_scenario should be "apt_simulation", got "${String(body.attack_scenario)}".`,
        );
      }

      // time_range
      const tr = body.time_range as Record<string, unknown> | undefined;
      if (tr && typeof tr === 'object') {
        if (
          typeof tr.start === 'string' &&
          tr.start.includes('now-7d') &&
          typeof tr.end === 'string' &&
          tr.end.includes('now')
        ) {
          score += 15;
        } else {
          score += 5;
          feedback.push('time_range should have start "now-7d" and end "now".');
        }
      } else {
        feedback.push('Missing time_range object.');
      }

      // settings
      const settings = body.settings as Record<string, unknown> | undefined;
      if (settings && typeof settings === 'object') {
        // inject_anomalies
        if (settings.inject_anomalies === true) {
          score += 5;
        } else {
          feedback.push('settings.inject_anomalies should be true.');
        }

        // anomaly_rate
        if (settings.anomaly_rate === 0.05) {
          score += 10;
        } else {
          feedback.push(
            `settings.anomaly_rate should be 0.05, got ${String(settings.anomaly_rate)}.`,
          );
        }

        // include_mitre_tags
        if (settings.include_mitre_tags === true) {
          score += 5;
        } else {
          feedback.push('settings.include_mitre_tags should be true.');
        }

        // hosts
        const hosts = settings.hosts as string[] | undefined;
        if (Array.isArray(hosts) && hosts.length >= 4) {
          const requiredHosts = [
            'win-server-01', 'win-workstation-02',
            'linux-web-01', 'linux-db-01',
          ];
          const hasAllHosts = requiredHosts.every((h) => hosts.includes(h));
          if (hasAllHosts) {
            score += 20;
          } else {
            score += 8;
            feedback.push('hosts should include all 4 specified hostnames.');
          }
        } else {
          feedback.push('Missing or incomplete settings.hosts array.');
        }
      } else {
        feedback.push('Missing settings object.');
      }

      return {
        correct: score >= 70,
        score,
        maxScore: 100,
        feedback:
          score >= 70
            ? 'Correct! Sample data generation request with APT simulation, anomalies, and host list.'
            : feedback.join(' '),
      };
    },
  },
];
