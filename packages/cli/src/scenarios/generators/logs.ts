/**
 * Observability log data generator — produces 2000+ realistic microservice logs
 * with noise patterns, error spikes, and buried root causes.
 *
 * The generated data simulates a real incident:
 * - A payment gateway loses connectivity to an upstream provider
 * - This cascades to checkout-service timeouts
 * - Meanwhile, normal traffic continues across 8 services
 * - Health checks, info logs, and routine operations create noise
 *
 * The model needs to funnel through the noise to find the root cause.
 */

import type { Document, IndexMapping } from '../../types';

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

export const logsMapping: IndexMapping = {
  properties: {
    '@timestamp': { type: 'date' },
    'service.name': { type: 'keyword' },
    'log.level': { type: 'keyword' },
    message: { type: 'text' },
    'host.name': { type: 'keyword' },
    'container.name': { type: 'keyword' },
    'error.message': { type: 'text' },
    'http.response.status_code': { type: 'integer' },
    'event.duration': { type: 'long' },
    'trace.id': { type: 'keyword' },
  },
};

interface ServiceConfig {
  name: string;
  hosts: string[];
  container: string;
  infoMessages: string[];
  warnMessages: string[];
}

const SERVICES: ServiceConfig[] = [
  {
    name: 'api-gateway',
    hosts: ['prod-gw-01', 'prod-gw-02', 'prod-gw-03'],
    container: 'api-gateway',
    infoMessages: [
      'GET /api/v1/products completed successfully',
      'GET /api/v1/users completed successfully',
      'POST /api/v1/orders completed successfully',
      'GET /api/v1/health completed successfully',
      'Request routed to upstream service',
      'TLS handshake completed',
      'Rate limiter: request allowed',
      'Cache hit for /api/v1/products',
    ],
    warnMessages: [
      'Slow response from upstream: {duration}ms',
      'Request retry attempt 2/3',
      'Connection pool running low: {n}/100 available',
    ],
  },
  {
    name: 'checkout-service',
    hosts: ['prod-checkout-01', 'prod-checkout-02'],
    container: 'checkout-app',
    infoMessages: [
      'Processing order {orderId} for customer {customerId}',
      'Order {orderId} validated successfully',
      'Inventory reserved for order {orderId}',
      'Order {orderId} completed successfully',
      'Cart updated for session {sessionId}',
      'Coupon {code} applied to order {orderId}',
    ],
    warnMessages: [
      'Coupon {code} expired, skipping discount',
      'Inventory low for SKU-{sku}: {n} remaining',
    ],
  },
  {
    name: 'payment-gateway',
    hosts: ['prod-pay-gw-01', 'prod-pay-gw-02'],
    container: 'payment-gw',
    infoMessages: [
      'Payment processed for order {orderId}: ${amount}',
      'Refund initiated for order {orderId}',
      'Payment method verified for customer {customerId}',
      'Health check passed, circuit breaker status: CLOSED',
      'Connection to payment provider established',
      'Transaction {txnId} settled',
    ],
    warnMessages: [
      'Payment retry attempt for order {orderId}',
      'Slow response from payment provider: {duration}ms',
    ],
  },
  {
    name: 'user-service',
    hosts: ['prod-usr-01', 'prod-usr-02'],
    container: 'user-app',
    infoMessages: [
      'User login successful for {email}',
      'User profile updated for {userId}',
      'Password reset email sent to {email}',
      'Session created for user {userId}',
      'User preferences saved',
      'OAuth token refreshed for user {userId}',
    ],
    warnMessages: [
      'Rate limit exceeded for IP {ip}, throttling requests',
      'Session expired for user {userId}',
    ],
  },
  {
    name: 'inventory-service',
    hosts: ['prod-inv-01', 'prod-inv-02'],
    container: 'inventory-app',
    infoMessages: [
      'Stock updated for SKU-{sku}: {n} units',
      'Inventory sync completed: {n} items updated',
      'Warehouse {wh} inventory snapshot taken',
      'Reorder triggered for SKU-{sku}',
    ],
    warnMessages: [
      'Low stock alert for SKU-{sku}: only {n} units remaining',
      'Inventory sync delayed by {duration}ms',
    ],
  },
  {
    name: 'notification-service',
    hosts: ['prod-notif-01'],
    container: 'notification-app',
    infoMessages: [
      'Email notification sent to customer {customerId} for order confirmation',
      'SMS notification queued for customer {customerId}',
      'Push notification delivered to device {deviceId}',
      'Notification template {template} rendered',
      'Email delivery confirmed: {messageId}',
    ],
    warnMessages: [
      'Email delivery delayed: provider queue full',
      'SMS rate limit approaching for region {region}',
    ],
  },
  {
    name: 'search-service',
    hosts: ['prod-search-01', 'prod-search-02'],
    container: 'search-app',
    infoMessages: [
      'Search query completed: "{query}" returned {n} results in {duration}ms',
      'Index refresh completed for products index',
      'Autocomplete request processed: "{prefix}"',
      'Search ranking model updated',
    ],
    warnMessages: [
      'Slow search query: "{query}" took {duration}ms',
      'Index refresh delayed by {duration}ms',
    ],
  },
  {
    name: 'recommendation-service',
    hosts: ['prod-rec-01'],
    container: 'recommendation-app',
    infoMessages: [
      'Recommendations generated for user {userId}: {n} items',
      'Model inference completed in {duration}ms',
      'Feature store updated with latest user signals',
      'A/B test variant assigned: {variant}',
    ],
    warnMessages: [
      'Model inference slow: {duration}ms (threshold: 200ms)',
      'Feature store stale: last update {n} minutes ago',
    ],
  },
];

function fillTemplate(
  template: string,
  rng: () => number,
): string {
  return template
    .replace('{orderId}', `ORD-${10000 + Math.floor(rng() * 90000)}`)
    .replace('{customerId}', `C-${100 + Math.floor(rng() * 900)}`)
    .replace('{sessionId}', `sess-${Math.floor(rng() * 999999).toString(16)}`)
    .replace('{code}', `SAVE${Math.floor(rng() * 50)}`)
    .replace('{sku}', `${100 + Math.floor(rng() * 900)}`)
    .replace('{email}', `user${Math.floor(rng() * 500)}@example.com`)
    .replace('{userId}', `U-${100 + Math.floor(rng() * 900)}`)
    .replace('{ip}', `192.168.${Math.floor(rng() * 255)}.${Math.floor(rng() * 255)}`)
    .replace('{txnId}', `txn-${Math.floor(rng() * 999999).toString(16)}`)
    .replace('{wh}', `WH-${Math.floor(rng() * 5) + 1}`)
    .replace('{messageId}', `msg-${Math.floor(rng() * 999999).toString(16)}`)
    .replace('{deviceId}', `dev-${Math.floor(rng() * 999999).toString(16)}`)
    .replace('{template}', `tmpl-${Math.floor(rng() * 20)}`)
    .replace('{region}', ['us-east', 'us-west', 'eu-west', 'ap-south'][Math.floor(rng() * 4)])
    .replace('{query}', ['shoes', 'laptop', 'headphones', 'camera'][Math.floor(rng() * 4)])
    .replace('{prefix}', ['sho', 'lap', 'hea', 'cam'][Math.floor(rng() * 4)])
    .replace('{variant}', ['control', 'variant_a', 'variant_b'][Math.floor(rng() * 3)])
    .replace(/{n}/g, `${Math.floor(rng() * 1000)}`)
    .replace(/{duration}/g, `${50 + Math.floor(rng() * 5000)}`)
    .replace(/{amount}/g, `${(10 + rng() * 490).toFixed(2)}`);
}

/**
 * Generate realistic microservice logs with an embedded incident.
 *
 * Timeline:
 *   14:00-14:10 — Normal operations (baseline)
 *   14:10-14:25 — Incident: payment-gateway loses upstream connectivity
 *                 Cascades to checkout-service timeouts
 *   14:25-14:30 — Recovery
 *   14:30-14:45 — Normal operations (post-recovery)
 *
 * Total: ~2500 logs over 45 minutes
 */
export function generateLogs(count = 2500, seed = 42): Document[] {
  const rng = seededRng(seed);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const docs: Document[] = [];

  // Use recent timestamps so time-based queries work
  const baseTime = Date.now() - 60 * 60 * 1000; // 1 hour ago
  const durationMs = 45 * 60 * 1000; // 45 minutes

  // Incident window: 14:10 to 14:25
  const incidentStartMs = 10 * 60 * 1000;
  const incidentEndMs = 25 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    const offsetMs = Math.floor(rng() * durationMs);
    const timestamp = new Date(baseTime + offsetMs).toISOString();
    const isIncidentWindow = offsetMs >= incidentStartMs && offsetMs <= incidentEndMs;

    const service = pick(SERVICES);
    const host = pick(service.hosts);

    let level: string;
    let message: string;
    let errorMessage: string | undefined;
    let statusCode: number | undefined;

    // During incident: payment-gateway and checkout-service produce errors
    if (isIncidentWindow && service.name === 'payment-gateway' && rng() < 0.35) {
      level = 'error';
      message = 'Upstream provider unreachable: stripe-api.example.com:443 connection refused';
      errorMessage = 'ECONNREFUSED: Connection refused to stripe-api.example.com:443';
      statusCode = 503;
    } else if (isIncidentWindow && service.name === 'checkout-service' && rng() < 0.25) {
      level = 'error';
      const orderId = `ORD-${10000 + Math.floor(rng() * 90000)}`;
      message = `Failed to process payment for ${orderId}: gateway timeout`;
      errorMessage = 'PaymentGatewayTimeout: Connection timed out after 30s';
      statusCode = 504;
    } else if (isIncidentWindow && service.name === 'payment-gateway' && rng() < 0.3) {
      level = 'warn';
      message = 'Health check passed, circuit breaker status: OPEN';
    } else if (rng() < 0.05) {
      // Random non-incident warnings across all services
      level = 'warn';
      message = fillTemplate(pick(service.warnMessages), rng);
    } else if (rng() < 0.01) {
      // Rare random errors in other services (noise)
      level = 'error';
      message = `Unexpected error in ${service.name}: connection reset by peer`;
      errorMessage = 'ECONNRESET';
      statusCode = 500;
    } else {
      // Normal info logs (the bulk)
      level = 'info';
      message = fillTemplate(pick(service.infoMessages), rng);
      statusCode = 200;
    }

    const doc: Record<string, unknown> = {
      '@timestamp': timestamp,
      'service.name': service.name,
      'log.level': level,
      message,
      'host.name': host,
      'container.name': service.container,
    };

    if (errorMessage) doc['error.message'] = errorMessage;
    if (statusCode) doc['http.response.status_code'] = statusCode;

    // Add trace ID to some requests
    if (rng() < 0.3) {
      doc['trace.id'] = `trace-${Math.floor(rng() * 999999).toString(16).padStart(6, '0')}`;
    }

    docs.push({
      _id: `log-${i + 1}`,
      _index: 'eq-obs-logs',
      _source: doc,
    });
  }

  // Sort by timestamp for realism
  docs.sort((a, b) =>
    (a._source['@timestamp'] as string).localeCompare(b._source['@timestamp'] as string),
  );

  return docs;
}

/**
 * Facts about the generated log data for validation.
 */
export function getLogFacts(docs: Document[]): {
  totalCount: number;
  errorCount: number;
  serviceErrorCounts: Record<string, number>;
  incidentServices: string[];
  rootCauseMessage: string;
  incidentTimeRange: { start: string; end: string };
} {
  let errorCount = 0;
  const serviceErrorCounts: Record<string, number> = {};

  for (const doc of docs) {
    if (doc._source['log.level'] === 'error') {
      errorCount++;
      const svc = doc._source['service.name'] as string;
      serviceErrorCounts[svc] = (serviceErrorCounts[svc] ?? 0) + 1;
    }
  }

  return {
    totalCount: docs.length,
    errorCount,
    serviceErrorCounts,
    incidentServices: ['payment-gateway', 'checkout-service'],
    rootCauseMessage: 'ECONNREFUSED: Connection refused to stripe-api.example.com:443',
    incidentTimeRange: {
      start: new Date(Date.now() - 50 * 60 * 1000).toISOString(), // ~50 min ago
      end: new Date(Date.now() - 35 * 60 * 1000).toISOString(),   // ~35 min ago
    },
  };
}
