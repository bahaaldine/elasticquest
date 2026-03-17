/**
 * Kibana scenarios — all 7 Kibana skills from elastic/agent-skills.
 *
 * Skills covered:
 * 1. kibana-alerting-rules — create/manage alerting rules via REST API
 * 2. kibana-connectors — create/manage connectors (Slack, PagerDuty, webhook, etc.)
 * 3. kibana-dashboards — create dashboards with Lens panels (48-col grid)
 * 4. kibana-agent-builder — create agents and custom tools (ES|QL, index search, workflow)
 * 5. kibana-audit — configure audit logging in kibana.yml
 * 6. kibana-vega — create Vega-Lite visualizations with ES|QL data sources
 * 7. kibana-streams — manage stream lifecycle (list, enable, disable, retention)
 */

import type {
  Scenario,
  SearchResponse,
  EsqlResponse,
  Document,
  IndexMapping,
} from '../types';

// --- Placeholder data (Kibana scenarios don't query ES data) ---

const placeholderDocs: Document[] = [
  { _id: 'p-1', _index: 'eq-api-placeholder', _source: { type: 'placeholder' } },
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

function isObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

// --- Scenarios ---

export const kibanaScenarios: Scenario[] = [
  // ══════════════════════════════════════════════════════════════════════
  // 1. ALERTING RULES
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'kibana-1-alerting-rules',
    skillId: 'kibana-alerting-rules',
    domain: 'esql',
    difficulty: 'intermediate',
    title: 'Create an ES Query Alerting Rule',
    description:
      'Produce the JSON request body for POST /api/alerting/rule to create an alerting rule ' +
      'that fires when the error rate exceeds 100 errors in a 5-minute window. Requirements:\n' +
      '- "name": "High Error Rate"\n' +
      '- "rule_type_id": ".es-query"\n' +
      '- "consumer": "stackAlerts"\n' +
      '- "schedule": { "interval": "5m" }\n' +
      '- "params": must include "index" (array with "logs-*"), "timeField" ("@timestamp"), ' +
      '"esQuery" (a JSON string with a match query for log.level: error), ' +
      '"threshold" ([100]), "thresholdComparator" (">"), "timeWindowSize" (5), "timeWindowUnit" ("m")\n' +
      '- "actions": array with at least one action having "group", "id", and "params" with a "message" field\n' +
      '- "tags": array with at least one tag',
    hints: [
      'rule_type_id ".es-query" is for Elasticsearch query-based alerts',
      'esQuery must be a JSON STRING (escaped), not a nested object',
      'schedule.interval uses shorthand: "1m", "5m", "1h"',
      'consumer "stackAlerts" is for Stack Alerts (not "alerts")',
      'Each action needs group (e.g. "query matched"), id (connector ID), and params',
    ],
    indexName: 'eq-api-placeholder',
    seedData: placeholderDocs,
    mapping: placeholderMapping,
    responseFormat: 'api-call',
    maxScore: 100,
    timeLimitMs: 30000,
    skillPaths: ['kibana/kibana-alerting-rules/SKILL.md'],
    validate: async (response) => {
      const body = response as unknown as Record<string, unknown>;
      let score = 0;
      const feedback: string[] = [];

      if (body.name === 'High Error Rate') score += 10;
      else if (isNonEmptyString(body.name)) { score += 3; feedback.push('name should be "High Error Rate".'); }
      else feedback.push('Missing "name".');

      if (body.rule_type_id === '.es-query') score += 15;
      else if (isNonEmptyString(body.rule_type_id)) { score += 3; feedback.push('rule_type_id should be ".es-query".'); }
      else feedback.push('Missing "rule_type_id".');

      if (body.consumer === 'stackAlerts') score += 10;
      else if (isNonEmptyString(body.consumer)) { score += 3; feedback.push('consumer should be "stackAlerts".'); }
      else feedback.push('Missing "consumer".');

      if (isObject(body.schedule) && (body.schedule as Record<string, unknown>).interval === '5m') score += 10;
      else if (isObject(body.schedule)) { score += 3; feedback.push('schedule.interval should be "5m".'); }
      else feedback.push('Missing "schedule" object.');

      // params validation
      if (isObject(body.params)) {
        const p = body.params as Record<string, unknown>;
        if (isNonEmptyArray(p.index)) score += 5; else feedback.push('params.index should be an array.');
        if (p.timeField === '@timestamp') score += 5; else feedback.push('params.timeField should be "@timestamp".');
        if (typeof p.esQuery === 'string') score += 10; else feedback.push('params.esQuery must be a JSON string.');
        if (isNonEmptyArray(p.threshold)) score += 5; else feedback.push('params.threshold should be an array.');
        if (isNonEmptyString(p.thresholdComparator)) score += 5; else feedback.push('Missing params.thresholdComparator.');
        if (typeof p.timeWindowSize === 'number') score += 3; else feedback.push('Missing params.timeWindowSize.');
        if (isNonEmptyString(p.timeWindowUnit)) score += 2; else feedback.push('Missing params.timeWindowUnit.');
      } else { feedback.push('Missing "params" object.'); }

      // actions
      if (isNonEmptyArray(body.actions)) {
        const a = body.actions[0] as Record<string, unknown>;
        if (isNonEmptyString(a.group) && isNonEmptyString(a.id) && isObject(a.params)) score += 15;
        else { score += 5; feedback.push('Action needs group, id, and params.'); }
      } else feedback.push('Missing "actions" array.');

      if (isNonEmptyArray(body.tags)) score += 5;

      return { correct: score >= 75, score, maxScore: 100,
        feedback: score >= 75 ? 'Correct! Valid ES query alerting rule.' : feedback.join(' ') };
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 2. CONNECTORS
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'kibana-2-connectors',
    skillId: 'kibana-connectors',
    domain: 'esql',
    difficulty: 'intermediate',
    title: 'Create a PagerDuty Connector',
    description:
      'Produce the JSON request body for POST /api/actions/connector to create a PagerDuty connector.\n' +
      '- "name": "PagerDuty Production"\n' +
      '- "connector_type_id": ".pagerduty" (note the leading dot)\n' +
      '- "config": { "apiUrl": "https://events.pagerduty.com/v2/enqueue" }\n' +
      '- "secrets": { "routingKey": "your-pagerduty-integration-key" }',
    hints: [
      'connector_type_id must have a leading dot: ".pagerduty"',
      'config contains non-sensitive settings (API URL)',
      'secrets contains sensitive values (routing key) — write-only, never returned by GET',
      'secrets object is REQUIRED even for connectors with no secrets',
    ],
    indexName: 'eq-api-placeholder',
    seedData: placeholderDocs,
    mapping: placeholderMapping,
    responseFormat: 'api-call',
    maxScore: 100,
    timeLimitMs: 30000,
    skillPaths: ['kibana/kibana-connectors/SKILL.md'],
    validate: async (response) => {
      const body = response as unknown as Record<string, unknown>;
      let score = 0;
      const feedback: string[] = [];

      if (isNonEmptyString(body.name)) score += 15; else feedback.push('Missing "name".');
      if (body.connector_type_id === '.pagerduty') score += 25;
      else if (isNonEmptyString(body.connector_type_id)) {
        score += 5;
        feedback.push('connector_type_id should be ".pagerduty" (with leading dot).');
      } else feedback.push('Missing "connector_type_id".');

      if (isObject(body.config)) {
        const cfg = body.config as Record<string, unknown>;
        if (isNonEmptyString(cfg.apiUrl) && String(cfg.apiUrl).includes('pagerduty')) score += 25;
        else { score += 10; feedback.push('config.apiUrl should point to PagerDuty events API.'); }
      } else feedback.push('Missing "config" object.');

      if (isObject(body.secrets)) {
        const sec = body.secrets as Record<string, unknown>;
        if (isNonEmptyString(sec.routingKey)) score += 35;
        else { score += 15; feedback.push('secrets should contain "routingKey".'); }
      } else feedback.push('Missing "secrets" object (required).');

      return { correct: score >= 75, score, maxScore: 100,
        feedback: score >= 75 ? 'Correct! Valid PagerDuty connector.' : feedback.join(' ') };
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 3. DASHBOARDS
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'kibana-3-dashboards',
    skillId: 'kibana-dashboards',
    domain: 'esql',
    difficulty: 'advanced',
    title: 'Create a Dashboard with ES|QL Lens Panels',
    description:
      'Produce the JSON body to create a Kibana dashboard with 2 panels on a 48-column grid.\n' +
      'Panel 1: A metric showing total log count from ES|QL\n' +
      '- grid: x=0, y=0, w=12, h=6\n' +
      '- type: "metric", dataset: esql query "FROM logs-* | STATS total = COUNT()"\n' +
      'Panel 2: A time series line chart\n' +
      '- grid: x=12, y=0, w=36, h=8\n' +
      '- type: "xy" with layer type "line", dataset: esql query\n\n' +
      'Required structure:\n' +
      '{ "title": "Log Overview", "panels": [{ "type": "lens", "uid": "...", "grid": { x, y, w, h }, "config": { "attributes": { "title": "...", "type": "metric"|"xy", ... } } }] }',
    hints: [
      '48-column grid — w+x must not exceed 48',
      'Each panel needs: type ("lens"), uid (unique string), grid, config.attributes',
      'For ES|QL datasets: { "type": "esql", "query": "FROM ..." }',
      'Metric uses "metrics" array; XY uses "layers" array with x/y axis definitions',
      'ES|QL datasets use { "operation": "value", "column": "col_name" }',
    ],
    indexName: 'eq-api-placeholder',
    seedData: placeholderDocs,
    mapping: placeholderMapping,
    responseFormat: 'api-call',
    maxScore: 100,
    timeLimitMs: 45000,
    skillPaths: ['kibana/kibana-dashboards/SKILL.md'],
    validate: async (response) => {
      const body = response as unknown as Record<string, unknown>;
      let score = 0;
      const feedback: string[] = [];

      if (isNonEmptyString(body.title)) score += 10; else feedback.push('Missing "title".');
      if (!isNonEmptyArray(body.panels)) {
        feedback.push('Missing "panels" array.');
        return { correct: false, score: 0, maxScore: 100, feedback: feedback.join(' ') };
      }

      const panels = body.panels as Record<string, unknown>[];
      if (panels.length >= 2) score += 10; else { score += 5; feedback.push('Expected 2 panels.'); }

      for (let i = 0; i < Math.min(panels.length, 2); i++) {
        const p = panels[i];
        if (p.type === 'lens') score += 5; else feedback.push(`Panel ${i + 1}: type should be "lens".`);
        if (isNonEmptyString(p.uid)) score += 3; else feedback.push(`Panel ${i + 1}: missing "uid".`);

        // grid validation
        const grid = p.grid as Record<string, unknown> | undefined;
        if (isObject(grid)) {
          const hasAll = typeof grid.x === 'number' && typeof grid.y === 'number' &&
            typeof grid.w === 'number' && typeof grid.h === 'number';
          if (hasAll) {
            score += 10;
            if ((grid.x as number) + (grid.w as number) <= 48) score += 2;
            else feedback.push(`Panel ${i + 1}: x+w exceeds 48 columns.`);
          } else { score += 3; feedback.push(`Panel ${i + 1}: grid needs numeric x, y, w, h.`); }
        } else feedback.push(`Panel ${i + 1}: missing "grid" object.`);

        // config.attributes
        const config = p.config as Record<string, unknown> | undefined;
        if (isObject(config) && isObject(config.attributes)) {
          const attrs = config.attributes as Record<string, unknown>;
          if (isNonEmptyString(attrs.type)) score += 5;
          if (attrs.dataset || attrs.metrics || attrs.layers) score += 5;
          // Check for esql dataset
          const hasEsql = JSON.stringify(attrs).includes('esql');
          if (hasEsql) score += 5;
        } else { score += 0; feedback.push(`Panel ${i + 1}: missing config.attributes.`); }
      }

      return { correct: score >= 65, score, maxScore: 100,
        feedback: score >= 65 ? 'Correct! Valid dashboard with Lens panels on 48-col grid.' : feedback.join(' ') };
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 4. AGENT BUILDER
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'kibana-4-agent-builder-tool',
    skillId: 'kibana-agent-builder',
    domain: 'esql',
    difficulty: 'advanced',
    title: 'Create an ES|QL Tool for Agent Builder',
    description:
      'Produce the JSON request body to create a custom ES|QL tool in Kibana Agent Builder.\n' +
      'The tool should query revenue data by region. Requirements:\n' +
      '- "id": "revenue_by_region"\n' +
      '- "type": "esql"\n' +
      '- "description": a clear description of what the tool does\n' +
      '- "configuration": {\n' +
      '    "query": an ES|QL query using ?region parameter (e.g. WHERE region == ?region),\n' +
      '    "params": { "region": { "type": "string", "description": "Region code" } }\n' +
      '  }\n\n' +
      'IMPORTANT: No "name" field (Agent Builder tools use "id" not "name"). ' +
      'Params only have "type" and "description" (no "default" or "optional").',
    hints: [
      'Tool uses "id" not "name" — Agent Builder API constraint',
      'type is "esql" for ES|QL query tools',
      'ES|QL parameters use ?param_name syntax in the query',
      'params map: each param has only "type" and "description"',
      'Include LIMIT in the ES|QL query',
    ],
    indexName: 'eq-api-placeholder',
    seedData: placeholderDocs,
    mapping: placeholderMapping,
    responseFormat: 'api-call',
    maxScore: 100,
    timeLimitMs: 30000,
    skillPaths: ['kibana/agent-builder/SKILL.md'],
    validate: async (response) => {
      const body = response as unknown as Record<string, unknown>;
      let score = 0;
      const feedback: string[] = [];

      if (body.id === 'revenue_by_region') score += 15;
      else if (isNonEmptyString(body.id)) { score += 5; feedback.push('id should be "revenue_by_region".'); }
      else feedback.push('Missing "id" field.');

      // Should NOT have "name" field
      if (body.name !== undefined) { feedback.push('Agent Builder tools use "id", not "name".'); }

      if (body.type === 'esql') score += 15;
      else if (isNonEmptyString(body.type)) { score += 3; feedback.push('type should be "esql".'); }
      else feedback.push('Missing "type".');

      if (isNonEmptyString(body.description)) score += 10; else feedback.push('Missing "description".');

      if (isObject(body.configuration)) {
        const cfg = body.configuration as Record<string, unknown>;
        // query with ?region param
        if (typeof cfg.query === 'string' && cfg.query.includes('?region')) score += 25;
        else if (typeof cfg.query === 'string') { score += 10; feedback.push('Query should use ?region parameter syntax.'); }
        else feedback.push('Missing configuration.query.');

        // params
        if (isObject(cfg.params)) {
          const params = cfg.params as Record<string, unknown>;
          if (isObject(params.region)) {
            const regionParam = params.region as Record<string, unknown>;
            if (regionParam.type === 'string' && isNonEmptyString(regionParam.description)) score += 25;
            else { score += 10; feedback.push('region param needs "type" and "description".'); }
            // Should NOT have default or optional
            if (regionParam.default !== undefined || regionParam.optional !== undefined) {
              feedback.push('Params only have "type" and "description" (no "default" or "optional").');
            }
          } else { score += 5; feedback.push('Missing "region" in params.'); }
        } else feedback.push('Missing configuration.params.');
      } else feedback.push('Missing "configuration" object.');

      return { correct: score >= 70, score, maxScore: 100,
        feedback: score >= 70 ? 'Correct! Valid ES|QL tool with parameterized query.' : feedback.join(' ') };
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 5. KIBANA AUDIT
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'kibana-5-audit-config',
    skillId: 'kibana-audit',
    domain: 'esql',
    difficulty: 'intermediate',
    title: 'Configure Kibana Audit Logging',
    description:
      'Produce a JSON object representing the Kibana audit logging configuration ' +
      '(equivalent to what goes in kibana.yml). Requirements:\n' +
      '- Enable audit logging\n' +
      '- Use rolling-file appender writing to "/var/log/kibana/audit.log"\n' +
      '- Time-interval rotation policy of 24 hours\n' +
      '- Numeric retention strategy keeping max 10 files\n' +
      '- Add an ignore_filter to suppress "saved_object_find" events\n\n' +
      'Expected structure:\n' +
      '{\n' +
      '  "enabled": true,\n' +
      '  "appender": { "type": "rolling-file", "fileName": "...", "policy": {...}, "strategy": {...} },\n' +
      '  "ignore_filters": [{ "actions": [...], "categories": [...] }]\n' +
      '}',
    hints: [
      'This maps to xpack.security.audit.* settings in kibana.yml',
      'appender.type is "rolling-file" (not "file" or "log")',
      'policy.type is "time-interval" with interval in hours (e.g. "24h")',
      'strategy.type is "numeric" with max: 10',
      'ignore_filters is an array of filter objects with "actions" and optionally "categories"',
    ],
    indexName: 'eq-api-placeholder',
    seedData: placeholderDocs,
    mapping: placeholderMapping,
    responseFormat: 'api-call',
    maxScore: 100,
    timeLimitMs: 30000,
    skillPaths: ['kibana/kibana-audit/SKILL.md'],
    validate: async (response) => {
      const body = response as unknown as Record<string, unknown>;
      let score = 0;
      const feedback: string[] = [];

      if (body.enabled === true) score += 15; else feedback.push('Missing or false "enabled" field.');

      if (isObject(body.appender)) {
        const app = body.appender as Record<string, unknown>;
        if (app.type === 'rolling-file') score += 10; else feedback.push('appender.type should be "rolling-file".');
        if (isNonEmptyString(app.fileName) && String(app.fileName).includes('audit')) score += 10;
        else feedback.push('appender.fileName should be a path to audit.log.');

        if (isObject(app.policy)) {
          const pol = app.policy as Record<string, unknown>;
          if (pol.type === 'time-interval') score += 10; else feedback.push('policy.type should be "time-interval".');
          if (isNonEmptyString(pol.interval) && String(pol.interval).includes('24')) score += 5;
          else feedback.push('policy.interval should be "24h".');
        } else feedback.push('Missing appender.policy.');

        if (isObject(app.strategy)) {
          const strat = app.strategy as Record<string, unknown>;
          if (strat.type === 'numeric') score += 10; else feedback.push('strategy.type should be "numeric".');
          if (strat.max === 10) score += 5; else feedback.push('strategy.max should be 10.');
        } else feedback.push('Missing appender.strategy.');
      } else feedback.push('Missing "appender" object.');

      // ignore_filters
      const filters = body.ignore_filters ?? body.ignoreFilters;
      if (isNonEmptyArray(filters)) {
        const f = (filters as Record<string, unknown>[])[0];
        if (isNonEmptyArray(f?.actions)) {
          const actions = f.actions as string[];
          if (actions.some((a) => a.includes('saved_object_find'))) score += 25;
          else { score += 10; feedback.push('Filter should suppress "saved_object_find" events.'); }
        } else { score += 5; feedback.push('Filter needs "actions" array.'); }
      } else { score += 0; feedback.push('Missing "ignore_filters" array.'); }

      return { correct: score >= 70, score, maxScore: 100,
        feedback: score >= 70 ? 'Correct! Valid audit config with rotation and noise filtering.' : feedback.join(' ') };
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 6. VEGA
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'kibana-6-vega-esql',
    skillId: 'kibana-vega',
    domain: 'esql',
    difficulty: 'advanced',
    title: 'Create a Vega-Lite Visualization with ES|QL',
    description:
      'Produce a Vega-Lite JSON spec for a bar chart showing log count by HTTP status code.\n' +
      'Requirements:\n' +
      '- "$schema": Vega-Lite v5 or v6 schema URL\n' +
      '- "title": "Requests by Status"\n' +
      '- "autosize": { "type": "fit", "contains": "padding" }\n' +
      '- "data.url": ES|QL query using %type%: "esql" syntax:\n' +
      '  FROM logs-* | STATS count = COUNT() BY status | SORT count DESC\n' +
      '- "mark": bar chart\n' +
      '- "encoding": x = status (nominal), y = count (quantitative)\n' +
      '- Dark theme config: view.stroke = null, axis colors "#444"',
    hints: [
      'ES|QL data source uses: "url": { "%type%": "esql", "query": "..." }',
      'Use %type% not "type" — the percent signs are required for Kibana',
      'autosize: { "type": "fit", "contains": "padding" } — never set width/height',
      'Dark theme: config.view.stroke = null, config.axis.domainColor/tickColor = "#444"',
      'Mark can be { "type": "bar" } or just "bar"',
    ],
    indexName: 'eq-api-placeholder',
    seedData: placeholderDocs,
    mapping: placeholderMapping,
    responseFormat: 'api-call',
    maxScore: 100,
    timeLimitMs: 45000,
    skillPaths: ['kibana/kibana-vega/SKILL.md'],
    validate: async (response) => {
      const body = response as unknown as Record<string, unknown>;
      let score = 0;
      const feedback: string[] = [];
      const json = JSON.stringify(body);

      // $schema
      if (isNonEmptyString(body.$schema) && String(body.$schema).includes('vega-lite')) score += 10;
      else feedback.push('Missing "$schema" with vega-lite URL.');

      if (isNonEmptyString(body.title)) score += 5; else feedback.push('Missing "title".');

      // autosize
      if (isObject(body.autosize)) {
        const as = body.autosize as Record<string, unknown>;
        if (as.type === 'fit' && as.contains === 'padding') score += 10;
        else { score += 3; feedback.push('autosize should be { type: "fit", contains: "padding" }.'); }
      } else feedback.push('Missing "autosize" (required, never set width/height).');

      // data.url with %type%: "esql"
      if (isObject(body.data)) {
        const data = body.data as Record<string, unknown>;
        if (isObject(data.url)) {
          const url = data.url as Record<string, unknown>;
          if (url['%type%'] === 'esql') score += 20;
          else if (json.includes('esql')) { score += 10; feedback.push('Use "%type%": "esql" in data.url.'); }
          else feedback.push('data.url should use "%type%": "esql" for ES|QL data source.');

          if (isNonEmptyString(url.query) && String(url.query).includes('STATS')) score += 10;
          else feedback.push('data.url.query should be an ES|QL STATS query.');
        } else feedback.push('data.url should be an object with %type% and query.');
      } else feedback.push('Missing "data" object.');

      // mark
      const markStr = typeof body.mark === 'string' ? body.mark : (body.mark as Record<string, unknown>)?.type;
      if (markStr === 'bar') score += 10; else feedback.push('mark type should be "bar".');

      // encoding
      if (isObject(body.encoding)) {
        const enc = body.encoding as Record<string, unknown>;
        if (isObject(enc.x) && isObject(enc.y)) score += 15;
        else feedback.push('encoding needs both x and y axis definitions.');
      } else feedback.push('Missing "encoding" object.');

      // dark theme config
      if (isObject(body.config)) {
        const cfg = body.config as Record<string, unknown>;
        const hasViewStroke = json.includes('"stroke":null') || json.includes('"stroke": null');
        const hasDarkAxis = json.includes('#444') || json.includes('#333');
        if (hasViewStroke && hasDarkAxis) score += 15;
        else if (hasViewStroke || hasDarkAxis) { score += 7; feedback.push('Include both view.stroke=null and dark axis colors.'); }
        else feedback.push('Missing dark theme config (view.stroke: null, axis colors "#444").');
      } else { score += 0; feedback.push('Missing "config" for dark theme.'); }

      return { correct: score >= 65, score, maxScore: 100,
        feedback: score >= 65 ? 'Correct! Valid Vega-Lite spec with ES|QL data source and dark theme.' : feedback.join(' ') };
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 7. STREAMS
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'kibana-7-streams',
    skillId: 'kibana-streams',
    domain: 'esql',
    difficulty: 'intermediate',
    title: 'Manage Kibana Stream Lifecycle',
    description:
      'Produce a JSON object describing the API calls needed to manage a Kibana stream. ' +
      'Given the stream "logs-webserver", produce the configuration to:\n' +
      '1. Set data retention to 30 days\n' +
      '2. Set failure store retention to 7 days\n' +
      '3. Include the correct API endpoints and headers\n\n' +
      'Expected structure:\n' +
      '{\n' +
      '  "stream_name": "logs-webserver",\n' +
      '  "ingest": {\n' +
      '    "lifecycle": { "dsl": { "data_retention": "30d" } },\n' +
      '    "failure_store": { "lifecycle": { "dsl": { "data_retention": "7d" } } }\n' +
      '  },\n' +
      '  "headers": { "kbn-xsrf": "true", "Content-Type": "application/json" }\n' +
      '}',
    hints: [
      'Data retention is under ingest.lifecycle.dsl.data_retention',
      'Failure store retention is under ingest.failure_store.lifecycle.dsl.data_retention',
      'Duration format: "30d", "7d", "90d"',
      'kbn-xsrf: true header is required for all mutating Kibana requests',
      'Disabling streams can lead to data loss — this config only sets retention',
    ],
    indexName: 'eq-api-placeholder',
    seedData: placeholderDocs,
    mapping: placeholderMapping,
    responseFormat: 'api-call',
    maxScore: 100,
    timeLimitMs: 30000,
    skillPaths: ['kibana/streams/SKILL.md'],
    validate: async (response) => {
      const body = response as unknown as Record<string, unknown>;
      let score = 0;
      const feedback: string[] = [];
      const json = JSON.stringify(body);

      // stream name
      if (isNonEmptyString(body.stream_name) || isNonEmptyString(body.streamName) || isNonEmptyString(body.name)) {
        score += 10;
      } else feedback.push('Missing stream name identifier.');

      // data retention (30d)
      if (json.includes('30d')) score += 25;
      else if (json.includes('data_retention')) { score += 10; feedback.push('Data retention should be "30d".'); }
      else feedback.push('Missing data_retention setting.');

      // failure store retention (7d)
      if (json.includes('failure_store') && json.includes('7d')) score += 25;
      else if (json.includes('failure_store')) { score += 10; feedback.push('Failure store retention should be "7d".'); }
      else feedback.push('Missing failure_store retention.');

      // Correct nesting (ingest.lifecycle.dsl or similar)
      if (json.includes('lifecycle') && json.includes('dsl')) score += 15;
      else if (json.includes('lifecycle')) { score += 5; feedback.push('Retention should be under lifecycle.dsl.data_retention.'); }
      else feedback.push('Missing lifecycle configuration structure.');

      // Headers
      if (json.includes('kbn-xsrf')) score += 15;
      else feedback.push('Missing kbn-xsrf header (required for Kibana mutations).');

      if (json.includes('application/json')) score += 10;

      return { correct: score >= 65, score, maxScore: 100,
        feedback: score >= 65 ? 'Correct! Valid stream lifecycle config with retention and headers.' : feedback.join(' ') };
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 8. CONNECTORS (advanced) — Preconfigured connector in kibana.yml
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'kibana-8-connectors-preconfigured',
    skillId: 'kibana-connectors',
    domain: 'esql',
    difficulty: 'advanced',
    title: 'Create Preconfigured Connectors Config',
    description:
      'Produce a JSON object representing the preconfigured connectors section of kibana.yml. ' +
      'Create two preconfigured connectors:\n' +
      '1. A Slack connector named "Production Alerts" with webhookUrl\n' +
      '2. A server-log connector named "Audit Log" (no secrets needed)\n\n' +
      'Expected structure:\n' +
      '{\n' +
      '  "xpack.actions.preconfigured": {\n' +
      '    "slack-production": { "name": "...", "actionTypeId": ".slack", "secrets": { "webhookUrl": "..." } },\n' +
      '    "audit-serverlog": { "name": "...", "actionTypeId": ".server-log" }\n' +
      '  }\n' +
      '}',
    hints: [
      'Preconfigured connectors use "actionTypeId" not "connector_type_id"',
      'Each connector key is a unique ID (e.g. "slack-production")',
      'Secrets are inline for preconfigured connectors (not via API)',
      'Server-log connector uses ".server-log" and needs no secrets',
    ],
    indexName: 'eq-api-placeholder',
    seedData: placeholderDocs,
    mapping: placeholderMapping,
    responseFormat: 'api-call',
    maxScore: 100,
    timeLimitMs: 30000,
    skillPaths: ['kibana/kibana-connectors/SKILL.md'],
    validate: async (response) => {
      const body = response as unknown as Record<string, unknown>;
      let score = 0;
      const feedback: string[] = [];
      const json = JSON.stringify(body);

      // Find the preconfigured object (could be at top level or nested)
      const preconfigured = (body['xpack.actions.preconfigured'] ??
        body.preconfigured ?? body) as Record<string, unknown>;

      const entries = Object.entries(preconfigured).filter(([, v]) => isObject(v));
      if (entries.length >= 2) score += 15;
      else if (entries.length === 1) { score += 5; feedback.push('Expected 2 preconfigured connectors.'); }
      else { feedback.push('No preconfigured connector objects found.'); }

      // Check for Slack connector
      const slackEntry = entries.find(([, v]) => {
        const obj = v as Record<string, unknown>;
        return obj.actionTypeId === '.slack' || String(obj.actionTypeId ?? '').includes('slack');
      });
      if (slackEntry) {
        score += 15;
        const slack = slackEntry[1] as Record<string, unknown>;
        if (isNonEmptyString(slack.name)) score += 5;
        if (slack.actionTypeId === '.slack') score += 10;
        else feedback.push('Slack connector should use actionTypeId ".slack".');
        if (isObject(slack.secrets) && isNonEmptyString((slack.secrets as Record<string, unknown>).webhookUrl)) score += 15;
        else feedback.push('Slack connector needs secrets.webhookUrl.');
      } else feedback.push('Missing Slack preconfigured connector.');

      // Check for server-log connector
      const logEntry = entries.find(([, v]) => {
        const obj = v as Record<string, unknown>;
        return obj.actionTypeId === '.server-log' || String(obj.actionTypeId ?? '').includes('server-log');
      });
      if (logEntry) {
        score += 15;
        const log = logEntry[1] as Record<string, unknown>;
        if (isNonEmptyString(log.name)) score += 5;
        if (log.actionTypeId === '.server-log') score += 10;
        else feedback.push('Server-log connector should use actionTypeId ".server-log".');
      } else feedback.push('Missing server-log preconfigured connector.');

      // Uses actionTypeId (not connector_type_id)
      if (json.includes('actionTypeId')) score += 10;
      else if (json.includes('connector_type_id')) {
        feedback.push('Preconfigured connectors use "actionTypeId", not "connector_type_id".');
      }

      return { correct: score >= 65, score, maxScore: 100,
        feedback: score >= 65 ? 'Correct! Valid preconfigured connectors with Slack and server-log.' : feedback.join(' ') };
    },
  },
];
