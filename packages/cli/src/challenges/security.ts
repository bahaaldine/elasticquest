import type { Challenge, SearchResponse, ElasticBackend } from '../types';
import type { EsqlResponse } from '../types';
import { validateEsqlChallenge } from './esql-helpers';

export const securityChallenges: Challenge[] = [
  // --- BEGINNER ---
  {
    id: 'sec-1-ip-range',
    domain: 'security',
    difficulty: 'beginner',
    title: 'Denied Traffic from Subnet',
    description: `You have network flow logs. Find all events where the source IP is in the "10.0.1.*" subnet AND the action is "deny".

Fields: source_ip (keyword), dest_ip (keyword), port (integer), action (keyword: allow/deny), bytes (integer).

Use a prefix or wildcard query on source_ip and a term filter on action.`,
    hints: [
      'Use a wildcard query with value "10.0.1.*" on source_ip, or a prefix query with value "10.0.1."',
      'Combine with a term query on action: "deny" using a bool must/filter',
    ],
    esqlHints: [
      'Use WHERE with LIKE or STARTS_WITH on the IP field to match the subnet pattern',
      'Combine with AND and == for the action filter',
    ],
    indexName: 'eq-netflow',
    mapping: {
      properties: {
        source_ip: { type: 'keyword' },
        dest_ip: { type: 'keyword' },
        port: { type: 'integer' },
        action: { type: 'keyword' },
        bytes: { type: 'integer' },
      },
    },
    seedData: [
      { _id: '1', _index: 'eq-netflow', _source: { source_ip: '10.0.1.15', dest_ip: '192.168.1.10', port: 443, action: 'deny', bytes: 0 } },
      { _id: '2', _index: 'eq-netflow', _source: { source_ip: '10.0.1.22', dest_ip: '192.168.1.10', port: 22, action: 'allow', bytes: 4096 } },
      { _id: '3', _index: 'eq-netflow', _source: { source_ip: '10.0.2.5', dest_ip: '192.168.1.10', port: 80, action: 'deny', bytes: 0 } },
      { _id: '4', _index: 'eq-netflow', _source: { source_ip: '10.0.1.33', dest_ip: '172.16.0.5', port: 3389, action: 'deny', bytes: 0 } },
      { _id: '5', _index: 'eq-netflow', _source: { source_ip: '10.0.1.15', dest_ip: '192.168.1.20', port: 8080, action: 'allow', bytes: 12800 } },
      { _id: '6', _index: 'eq-netflow', _source: { source_ip: '192.168.5.1', dest_ip: '10.0.1.15', port: 443, action: 'deny', bytes: 0 } },
      { _id: '7', _index: 'eq-netflow', _source: { source_ip: '10.0.1.44', dest_ip: '172.16.0.8', port: 25, action: 'deny', bytes: 0 } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      const hitIds = response.hits.hits.map((h) => h._id);
      // source_ip starts with "10.0.1." AND action "deny": docs 1, 4, 7
      const expectedIds = ['1', '4', '7'];
      const found = expectedIds.filter((id) => hitIds.includes(id));
      const falsePositives = hitIds.filter((id) => !expectedIds.includes(id));
      const correct = found.length === expectedIds.length && falsePositives.length === 0;
      const score = Math.floor((found.length / expectedIds.length) * 85) - falsePositives.length * 15;
      return {
        correct,
        score: Math.max(0, score),
        maxScore: 100,
        feedback: correct
          ? 'Found all denied traffic from the 10.0.1.* subnet.'
          : `Found ${found.length}/${expectedIds.length} expected events. ${falsePositives.length} false positive(s). Filter: source_ip "10.0.1.*" AND action "deny".`,
      };
    },
    validateEsql: async (response: EsqlResponse, query: string) => {
      return validateEsqlChallenge(response, query, {
        requiredPatterns: [
          { pattern: /\bFROM\b/i, points: 15, label: 'FROM' },
          { pattern: /\bWHERE\b/i, points: 20, label: 'WHERE' },
          { pattern: /10\.0\.1/i, points: 20, label: 'subnet filter' },
          { pattern: /deny/i, points: 20, label: 'deny action' },
        ],
        expectedRowCount: 3,
      });
    },
    maxScore: 100,
    timeLimitMs: 30000,
  },

  // --- INTERMEDIATE ---
  {
    id: 'sec-2-failed-logins',
    domain: 'security',
    difficulty: 'intermediate',
    title: 'Brute Force Detection',
    description: `Detect brute force login attempts. Find all failed logins in the last 24 hours and aggregate by source IP to identify attackers.

Fields: user (keyword), source_ip (keyword), action (keyword: login_success/login_failed), @timestamp (date), geo_country (keyword).

Requirements:
- Bool query: filter action="login_failed" AND @timestamp between "2024-03-09T00:00:00Z" and "2024-03-10T00:00:00Z"
- Terms aggregation named "by_ip" on source_ip
- Set size to 0 (we only need the aggregation)`,
    hints: [
      'Use bool filter with term on action and range on @timestamp',
      'Add a terms aggregation named "by_ip" on "source_ip"',
      'Set size: 0 to skip returning hits',
    ],
    esqlHints: [
      'Use WHERE with == and >= / <= to filter by action and time range',
      'Use STATS COUNT(*) BY source_ip to group by source IP',
      'Use SORT count DESC for top offenders',
    ],
    indexName: 'eq-auth-logs',
    mapping: {
      properties: {
        user: { type: 'keyword' },
        source_ip: { type: 'keyword' },
        action: { type: 'keyword' },
        '@timestamp': { type: 'date' },
        geo_country: { type: 'keyword' },
      },
    },
    seedData: [
      { _id: '1', _index: 'eq-auth-logs', _source: { user: 'admin', source_ip: '203.0.113.50', action: 'login_failed', '@timestamp': '2024-03-09T02:14:00Z', geo_country: 'CN' } },
      { _id: '2', _index: 'eq-auth-logs', _source: { user: 'admin', source_ip: '203.0.113.50', action: 'login_failed', '@timestamp': '2024-03-09T02:14:30Z', geo_country: 'CN' } },
      { _id: '3', _index: 'eq-auth-logs', _source: { user: 'root', source_ip: '203.0.113.50', action: 'login_failed', '@timestamp': '2024-03-09T02:15:00Z', geo_country: 'CN' } },
      { _id: '4', _index: 'eq-auth-logs', _source: { user: 'admin', source_ip: '198.51.100.23', action: 'login_failed', '@timestamp': '2024-03-09T08:30:00Z', geo_country: 'RU' } },
      { _id: '5', _index: 'eq-auth-logs', _source: { user: 'jdoe', source_ip: '10.0.0.5', action: 'login_success', '@timestamp': '2024-03-09T09:00:00Z', geo_country: 'US' } },
      { _id: '6', _index: 'eq-auth-logs', _source: { user: 'admin', source_ip: '198.51.100.23', action: 'login_failed', '@timestamp': '2024-03-09T08:31:00Z', geo_country: 'RU' } },
      { _id: '7', _index: 'eq-auth-logs', _source: { user: 'root', source_ip: '203.0.113.50', action: 'login_failed', '@timestamp': '2024-03-08T23:00:00Z', geo_country: 'CN' } },
      { _id: '8', _index: 'eq-auth-logs', _source: { user: 'jsmith', source_ip: '10.0.0.12', action: 'login_success', '@timestamp': '2024-03-09T10:00:00Z', geo_country: 'US' } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      let score = 0;

      // Check size 0
      if (response.hits.hits.length === 0) score += 20;

      // Check by_ip aggregation exists
      const byIp = response.aggregations?.by_ip;
      if (!byIp) return { correct: false, score, maxScore: 100, feedback: 'Missing "by_ip" aggregation. Use a terms aggregation on source_ip.' };
      if (!byIp.buckets) return { correct: false, score, maxScore: 100, feedback: 'No buckets in "by_ip" aggregation.' };
      score += 20;

      // Expected: failed logins between 2024-03-09 and 2024-03-10
      // Docs 1,2,3 (203.0.113.50) + docs 4,6 (198.51.100.23) = 5 failed in window
      // Doc 7 is outside window (2024-03-08), doc 5,8 are login_success
      const buckets = new Map(byIp.buckets.map((b) => [String(b.key), b.doc_count]));
      const hasCorrectIp1 = buckets.get('203.0.113.50') === 3;
      const hasCorrectIp2 = buckets.get('198.51.100.23') === 2;
      const noExtraBuckets = byIp.buckets.length === 2;

      if (hasCorrectIp1) score += 20;
      if (hasCorrectIp2) score += 20;
      if (noExtraBuckets) score += 20;

      const correct = hasCorrectIp1 && hasCorrectIp2 && noExtraBuckets && response.hits.hits.length === 0;
      return {
        correct,
        score: Math.min(100, score),
        maxScore: 100,
        feedback: correct
          ? 'Correct! 203.0.113.50 had 3 failures, 198.51.100.23 had 2 failures in the window.'
          : `Score: ${score}/100. Expected 2 IP buckets: 203.0.113.50(3) and 198.51.100.23(2). Got ${byIp.buckets.length} buckets. Ensure range filter excludes doc 7 (outside window) and term filter excludes successes.`,
      };
    },
    validateEsql: async (response: EsqlResponse, query: string) => {
      return validateEsqlChallenge(response, query, {
        requiredPatterns: [
          { pattern: /\bFROM\b/i, points: 10, label: 'FROM' },
          { pattern: /\bWHERE\b/i, points: 15, label: 'WHERE' },
          { pattern: /login_failed/i, points: 15, label: 'failed login filter' },
          { pattern: /\bSTATS\b/i, points: 15, label: 'STATS' },
          { pattern: /\bCOUNT\b/i, points: 10, label: 'COUNT' },
          { pattern: /\bBY\b.*source_ip/i, points: 15, label: 'BY source_ip' },
        ],
        expectedRowCount: 2,
      });
    },
    maxScore: 100,
    timeLimitMs: 45000,
  },

  {
    id: 'sec-3-rare-domains',
    domain: 'security',
    difficulty: 'intermediate',
    title: 'DNS Threat Hunting',
    description: `Hunt for suspicious DNS queries by finding rarely queried domain names. Rare domains can indicate command-and-control (C2) beaconing.

Fields: query_name (keyword), query_type (keyword: A/AAAA/MX/TXT), client_ip (keyword), @timestamp (date).

Requirements:
- Use a rare_terms aggregation named "rare_domains" on the "query_name" field
- Set max_doc_count: 1 to only find domains queried at most once
- Set size to 0`,
    hints: [
      'Use rare_terms aggregation (not terms) for low-frequency values',
      'Set max_doc_count: 1 inside the rare_terms config',
      'Name the aggregation "rare_domains"',
    ],
    indexName: 'eq-dns-logs',
    mapping: {
      properties: {
        query_name: { type: 'keyword' },
        query_type: { type: 'keyword' },
        client_ip: { type: 'keyword' },
        '@timestamp': { type: 'date' },
      },
    },
    seedData: [
      { _id: '1', _index: 'eq-dns-logs', _source: { query_name: 'google.com', query_type: 'A', client_ip: '10.0.0.5', '@timestamp': '2024-03-09T08:00:00Z' } },
      { _id: '2', _index: 'eq-dns-logs', _source: { query_name: 'google.com', query_type: 'A', client_ip: '10.0.0.12', '@timestamp': '2024-03-09T08:01:00Z' } },
      { _id: '3', _index: 'eq-dns-logs', _source: { query_name: 'github.com', query_type: 'A', client_ip: '10.0.0.5', '@timestamp': '2024-03-09T09:00:00Z' } },
      { _id: '4', _index: 'eq-dns-logs', _source: { query_name: 'github.com', query_type: 'A', client_ip: '10.0.0.8', '@timestamp': '2024-03-09T09:05:00Z' } },
      { _id: '5', _index: 'eq-dns-logs', _source: { query_name: 'x7k9m2.evil-domain.xyz', query_type: 'TXT', client_ip: '10.0.0.50', '@timestamp': '2024-03-09T03:22:00Z' } },
      { _id: '6', _index: 'eq-dns-logs', _source: { query_name: 'cdn.microsoft.com', query_type: 'A', client_ip: '10.0.0.5', '@timestamp': '2024-03-09T10:00:00Z' } },
      { _id: '7', _index: 'eq-dns-logs', _source: { query_name: 'cdn.microsoft.com', query_type: 'AAAA', client_ip: '10.0.0.12', '@timestamp': '2024-03-09T10:01:00Z' } },
      { _id: '8', _index: 'eq-dns-logs', _source: { query_name: 'a1b2c3d4.darknet.onion.ly', query_type: 'A', client_ip: '10.0.0.50', '@timestamp': '2024-03-09T03:45:00Z' } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      let score = 0;

      // Check size 0
      if (response.hits.hits.length === 0) score += 20;

      // Check rare_domains aggregation
      const rareDomains = response.aggregations?.rare_domains;
      if (!rareDomains) return { correct: false, score, maxScore: 100, feedback: 'Missing "rare_domains" aggregation. Use a rare_terms aggregation on query_name.' };
      if (!rareDomains.buckets) return { correct: false, score, maxScore: 100, feedback: 'No buckets in "rare_domains" aggregation.' };
      score += 20;

      // Domains with doc_count 1: x7k9m2.evil-domain.xyz (1), a1b2c3d4.darknet.onion.ly (1)
      // google.com (2), github.com (2), cdn.microsoft.com (2) should be excluded
      const bucketKeys = rareDomains.buckets.map((b) => String(b.key));
      const expectedRare = ['x7k9m2.evil-domain.xyz', 'a1b2c3d4.darknet.onion.ly'];
      const foundRare = expectedRare.filter((d) => bucketKeys.includes(d));
      const extraBuckets = bucketKeys.filter((k) => !expectedRare.includes(k));

      if (foundRare.length === 2) score += 40;
      else if (foundRare.length === 1) score += 20;

      if (extraBuckets.length === 0) score += 20;

      const correct = foundRare.length === 2 && extraBuckets.length === 0 && response.hits.hits.length === 0;
      return {
        correct,
        score: Math.min(100, score),
        maxScore: 100,
        feedback: correct
          ? 'Correct! Found 2 rare domains: the suspicious C2-like domains queried only once.'
          : `Found ${foundRare.length}/2 rare domains. ${extraBuckets.length} unexpected bucket(s). Only domains with max_doc_count 1 should appear.`,
      };
    },
    maxScore: 100,
    timeLimitMs: 45000,
    esqlIncompatible: true,
  },

  // --- ADVANCED ---
  {
    id: 'sec-4-alert-triage',
    domain: 'security',
    difficulty: 'advanced',
    title: 'Alert Severity Triage',
    description: `Triage security alerts by severity level using a filters aggregation. Group alerts into severity buckets to prioritize response.

Fields: severity (integer 1-10), category (keyword), source (keyword), @timestamp (date), message (text).

Requirements:
- Use a filters aggregation named "severity_levels" with named filters:
  - "critical": severity >= 8 (range gte: 8)
  - "high": severity 5-7 (range gte: 5, lte: 7)
  - "medium": severity 3-4 (range gte: 3, lte: 4)
  - "low": severity 1-2 (range gte: 1, lte: 2)
- Set size to 0`,
    hints: [
      'Use a filters aggregation with named filters (not an array)',
      'Each filter is a range query on the "severity" field',
      'The filters key should be "severity_levels"',
    ],
    esqlHints: [
      'Use STATS with per-aggregation WHERE to count each severity range in a single row',
      'e.g., critical = COUNT(*) WHERE severity >= 8, high = COUNT(*) WHERE severity >= 5 AND severity <= 7',
    ],
    indexName: 'eq-alerts',
    mapping: {
      properties: {
        severity: { type: 'integer' },
        category: { type: 'keyword' },
        source: { type: 'keyword' },
        '@timestamp': { type: 'date' },
        message: { type: 'text' },
      },
    },
    seedData: [
      { _id: '1', _index: 'eq-alerts', _source: { severity: 9, category: 'intrusion', source: 'ids', '@timestamp': '2024-03-09T01:00:00Z', message: 'SQL injection attempt detected on /api/users' } },
      { _id: '2', _index: 'eq-alerts', _source: { severity: 8, category: 'malware', source: 'edr', '@timestamp': '2024-03-09T02:30:00Z', message: 'Ransomware binary detected on endpoint WS-042' } },
      { _id: '3', _index: 'eq-alerts', _source: { severity: 6, category: 'intrusion', source: 'ids', '@timestamp': '2024-03-09T03:15:00Z', message: 'Port scan detected from external host' } },
      { _id: '4', _index: 'eq-alerts', _source: { severity: 5, category: 'policy', source: 'firewall', '@timestamp': '2024-03-09T04:00:00Z', message: 'Outbound connection to known bad IP blocked' } },
      { _id: '5', _index: 'eq-alerts', _source: { severity: 3, category: 'audit', source: 'siem', '@timestamp': '2024-03-09T05:00:00Z', message: 'User privilege escalation via sudo' } },
      { _id: '6', _index: 'eq-alerts', _source: { severity: 1, category: 'info', source: 'siem', '@timestamp': '2024-03-09T06:00:00Z', message: 'Scheduled scan completed successfully' } },
      { _id: '7', _index: 'eq-alerts', _source: { severity: 10, category: 'intrusion', source: 'ids', '@timestamp': '2024-03-09T07:00:00Z', message: 'Active exploitation detected: reverse shell spawned' } },
      { _id: '8', _index: 'eq-alerts', _source: { severity: 2, category: 'audit', source: 'siem', '@timestamp': '2024-03-09T08:00:00Z', message: 'New user account created in AD' } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      let score = 0;

      // Check size 0
      if (response.hits.hits.length === 0) score += 10;

      // Check severity_levels aggregation
      const sevLevels = response.aggregations?.severity_levels;
      if (!sevLevels) return { correct: false, score, maxScore: 100, feedback: 'Missing "severity_levels" aggregation. Use a filters aggregation.' };

      // filters agg returns buckets as an object, not array
      // The response type uses buckets array, but for named filters they come as object keys
      // Check for named buckets: critical, high, medium, low
      const buckets = sevLevels.buckets;

      // Handle both object-style and array-style bucket results
      let critical: { doc_count: number } | undefined;
      let high: { doc_count: number } | undefined;
      let medium: { doc_count: number } | undefined;
      let low: { doc_count: number } | undefined;

      if (Array.isArray(buckets)) {
        // Some backends may return named filters as array with key property
        const arr = buckets as Array<{ key: string; doc_count: number }>;
        critical = arr.find((b) => b.key === 'critical');
        high = arr.find((b) => b.key === 'high');
        medium = arr.find((b) => b.key === 'medium');
        low = arr.find((b) => b.key === 'low');
      } else if (buckets && typeof buckets === 'object') {
        const obj = buckets as Record<string, { doc_count: number }>;
        critical = obj.critical;
        high = obj.high;
        medium = obj.medium;
        low = obj.low;
      }

      if (!critical && !high && !medium && !low) {
        return { correct: false, score, maxScore: 100, feedback: 'No named filter buckets found. Use named filters: "critical", "high", "medium", "low".' };
      }
      score += 10;

      // Expected counts:
      // critical (>=8): docs 1(9), 2(8), 7(10) = 3
      // high (5-7): docs 3(6), 4(5) = 2
      // medium (3-4): doc 5(3) = 1
      // low (1-2): docs 6(1), 8(2) = 2
      let correctBuckets = 0;
      if (critical?.doc_count === 3) { score += 20; correctBuckets++; }
      if (high?.doc_count === 2) { score += 20; correctBuckets++; }
      if (medium?.doc_count === 1) { score += 20; correctBuckets++; }
      if (low?.doc_count === 2) { score += 20; correctBuckets++; }

      const correct = correctBuckets === 4 && response.hits.hits.length === 0;
      return {
        correct,
        score: Math.min(100, score),
        maxScore: 100,
        feedback: correct
          ? 'Correct! critical(3), high(2), medium(1), low(2) — triage complete.'
          : `${correctBuckets}/4 severity buckets correct. Expected: critical=3, high=2, medium=1, low=2. Got: critical=${critical?.doc_count}, high=${high?.doc_count}, medium=${medium?.doc_count}, low=${low?.doc_count}.`,
      };
    },
    validateEsql: async (response: EsqlResponse, query: string) => {
      return validateEsqlChallenge(response, query, {
        requiredPatterns: [
          { pattern: /\bFROM\b/i, points: 10, label: 'FROM' },
          { pattern: /\bSTATS\b/i, points: 20, label: 'STATS' },
          { pattern: /\bCOUNT\b/i, points: 15, label: 'COUNT' },
          { pattern: /severity/i, points: 20, label: 'severity field' },
        ],
        expectedColumns: ['critical', 'high', 'medium', 'low'],
        expectedRowCount: 1,
      });
    },
    maxScore: 100,
    timeLimitMs: 60000,
  },

  {
    id: 'sec-5-correlation',
    domain: 'security',
    difficulty: 'advanced',
    title: 'Compromised Account Detection',
    description: `Detect potentially compromised accounts by finding users who have BOTH failed AND successful logins — a failed login followed by a success may indicate credential stuffing that found a valid password.

Fields: user (keyword), source_ip (keyword), action (keyword: login_success/login_failed), @timestamp (date), geo_country (keyword).

Requirements:
- Match all auth events (match_all or no query filter needed)
- Terms aggregation named "by_user" on the "user" field
- Inside "by_user", a sub-aggregation: terms on "action" named "by_action"
- Set size to 0

The result should show each user with their breakdown of login_success vs login_failed.`,
    hints: [
      'Use a terms aggregation "by_user" on "user"',
      'Nest a terms aggregation "by_action" on "action" inside by_user',
      'Set size: 0 to only return aggregation results',
    ],
    esqlHints: [
      'Use STATS COUNT(*) BY user, action for a two-level breakdown',
      'This groups actions by user to find suspicious patterns',
    ],
    indexName: 'eq-auth-events',
    mapping: {
      properties: {
        user: { type: 'keyword' },
        source_ip: { type: 'keyword' },
        action: { type: 'keyword' },
        '@timestamp': { type: 'date' },
        geo_country: { type: 'keyword' },
      },
    },
    seedData: [
      { _id: '1', _index: 'eq-auth-events', _source: { user: 'admin', source_ip: '203.0.113.50', action: 'login_failed', '@timestamp': '2024-03-09T02:00:00Z', geo_country: 'CN' } },
      { _id: '2', _index: 'eq-auth-events', _source: { user: 'admin', source_ip: '203.0.113.50', action: 'login_failed', '@timestamp': '2024-03-09T02:01:00Z', geo_country: 'CN' } },
      { _id: '3', _index: 'eq-auth-events', _source: { user: 'admin', source_ip: '203.0.113.50', action: 'login_success', '@timestamp': '2024-03-09T02:02:00Z', geo_country: 'CN' } },
      { _id: '4', _index: 'eq-auth-events', _source: { user: 'jdoe', source_ip: '10.0.0.5', action: 'login_success', '@timestamp': '2024-03-09T09:00:00Z', geo_country: 'US' } },
      { _id: '5', _index: 'eq-auth-events', _source: { user: 'jdoe', source_ip: '10.0.0.5', action: 'login_success', '@timestamp': '2024-03-10T09:00:00Z', geo_country: 'US' } },
      { _id: '6', _index: 'eq-auth-events', _source: { user: 'svc-backup', source_ip: '10.0.0.100', action: 'login_failed', '@timestamp': '2024-03-09T04:00:00Z', geo_country: 'US' } },
      { _id: '7', _index: 'eq-auth-events', _source: { user: 'svc-backup', source_ip: '10.0.0.100', action: 'login_failed', '@timestamp': '2024-03-09T04:05:00Z', geo_country: 'US' } },
    ],
    validate: async (response: SearchResponse): Promise<{ correct: boolean; score: number; maxScore: number; feedback: string }> => {
      let score = 0;

      // Check size 0
      if (response.hits.hits.length === 0) score += 10;

      // Check by_user aggregation
      const byUser = response.aggregations?.by_user;
      if (!byUser) return { correct: false, score, maxScore: 100, feedback: 'Missing "by_user" aggregation. Use a terms aggregation on the "user" field.' };
      if (!byUser.buckets) return { correct: false, score, maxScore: 100, feedback: 'No buckets in "by_user" aggregation.' };
      score += 15;

      // Expected users: admin(3), jdoe(2), svc-backup(2)
      if (byUser.buckets.length === 3) score += 10;

      const adminBucket = byUser.buckets.find((b) => b.key === 'admin');
      const jdoeBucket = byUser.buckets.find((b) => b.key === 'jdoe');
      const svcBucket = byUser.buckets.find((b) => b.key === 'svc-backup');

      // Check admin has by_action sub-agg with both login_failed and login_success
      let adminCorrect = false;
      if (adminBucket) {
        score += 5;
        const byAction = adminBucket.by_action as { buckets?: Array<{ key: string; doc_count: number }> } | undefined;
        if (byAction?.buckets) {
          score += 10;
          const failed = byAction.buckets.find((b) => b.key === 'login_failed');
          const success = byAction.buckets.find((b) => b.key === 'login_success');
          if (failed?.doc_count === 2 && success?.doc_count === 1) {
            score += 15;
            adminCorrect = true;
          }
        }
      }

      // Check jdoe has only login_success
      let jdoeCorrect = false;
      if (jdoeBucket) {
        score += 5;
        const byAction = jdoeBucket.by_action as { buckets?: Array<{ key: string; doc_count: number }> } | undefined;
        if (byAction?.buckets) {
          const success = byAction.buckets.find((b) => b.key === 'login_success');
          if (success?.doc_count === 2 && byAction.buckets.length === 1) {
            score += 10;
            jdoeCorrect = true;
          }
        }
      }

      // Check svc-backup has only login_failed
      let svcCorrect = false;
      if (svcBucket) {
        score += 5;
        const byAction = svcBucket.by_action as { buckets?: Array<{ key: string; doc_count: number }> } | undefined;
        if (byAction?.buckets) {
          const failed = byAction.buckets.find((b) => b.key === 'login_failed');
          if (failed?.doc_count === 2 && byAction.buckets.length === 1) {
            score += 15;
            svcCorrect = true;
          }
        }
      }

      const correct = adminCorrect && jdoeCorrect && svcCorrect && response.hits.hits.length === 0;
      return {
        correct,
        score: Math.min(100, score),
        maxScore: 100,
        feedback: correct
          ? 'Correct! "admin" has both failed and successful logins — potential compromise. "jdoe" is clean (success only). "svc-backup" has only failures (lockout, not compromise).'
          : `Score: ${score}/100. Build: by_user -> by_action. Admin should show 2 failures + 1 success. Check sub-aggregation structure.`,
      };
    },
    validateEsql: async (response: EsqlResponse, query: string) => {
      return validateEsqlChallenge(response, query, {
        requiredPatterns: [
          { pattern: /\bFROM\b/i, points: 10, label: 'FROM' },
          { pattern: /\bSTATS\b/i, points: 20, label: 'STATS' },
          { pattern: /\bCOUNT\b/i, points: 15, label: 'COUNT' },
          { pattern: /\bBY\b.*\buser\b/i, points: 20, label: 'BY user' },
          { pattern: /\baction\b/i, points: 15, label: 'action field' },
        ],
        expectedRowCount: 3,
        rowCountTolerance: 3,
      });
    },
    maxScore: 100,
    timeLimitMs: 60000,
  },
];
