/**
 * Kibana scenarios — aligned to Kibana API skills.
 *
 * These scenarios test a model's ability to produce correct API request
 * bodies for Kibana operations (alerting rules, connectors, dashboards,
 * agent builder). The response format is 'api-call' — the model produces
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

// --- Placeholder data (Kibana scenarios don't need real ES data) ---

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

// --- Scenarios ---

export const kibanaScenarios: Scenario[] = [
  // 1. Alerting rules — intermediate
  {
    id: 'kibana-1-alerting-rules',
    skillId: 'kibana-alerting-rules',
    domain: 'esql',
    difficulty: 'intermediate',
    title: 'Create a Kibana Alerting Rule',
    description:
      'Produce the JSON request body for a POST request to create a Kibana alerting rule. ' +
      'The body must include: ' +
      '(1) "name" set to "High CPU Alert", ' +
      '(2) "rule_type_id" set to ".es-query", ' +
      '(3) "consumer" set to "alerts", ' +
      '(4) "schedule" — an object with "interval" set to "5m", ' +
      '(5) "params" — an object with at least "threshold" and "timeWindowSize" fields, and ' +
      '(6) "actions" — an array with at least one action object containing ' +
      '"group", "id", and "params" fields. ' +
      'This corresponds to the POST /api/alerting/rule endpoint.',
    hints: [
      'rule_type_id ".es-query" is for Elasticsearch query-based alerts',
      'schedule.interval uses shorthand like "1m", "5m", "1h"',
      'params should contain the query parameters for the alert condition',
      'Each action needs a group (e.g., "query matched"), connector id, and action params',
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

      // name
      if (body.name === 'High CPU Alert') {
        score += 15;
      } else if (isNonEmptyString(body.name)) {
        score += 5;
        feedback.push('Name should be "High CPU Alert".');
      } else {
        feedback.push('Missing "name" field.');
      }

      // rule_type_id
      if (body.rule_type_id === '.es-query') {
        score += 20;
      } else if (isNonEmptyString(body.rule_type_id)) {
        score += 5;
        feedback.push('rule_type_id should be ".es-query".');
      } else {
        feedback.push('Missing "rule_type_id" field.');
      }

      // consumer
      if (body.consumer === 'alerts') {
        score += 10;
      } else if (isNonEmptyString(body.consumer)) {
        score += 5;
        feedback.push('consumer should be "alerts".');
      } else {
        feedback.push('Missing "consumer" field.');
      }

      // schedule
      const schedule = body.schedule;
      if (schedule && typeof schedule === 'object' && !Array.isArray(schedule)) {
        const schedObj = schedule as Record<string, unknown>;
        if (schedObj.interval === '5m') {
          score += 15;
        } else if (isNonEmptyString(schedObj.interval)) {
          score += 8;
          feedback.push('schedule.interval should be "5m".');
        } else {
          feedback.push('schedule object missing "interval" field.');
        }
      } else {
        feedback.push('Missing "schedule" object (expected { interval: "5m" }).');
      }

      // params
      const params = body.params;
      if (params && typeof params === 'object' && !Array.isArray(params)) {
        const paramsObj = params as Record<string, unknown>;
        const hasThreshold = paramsObj.threshold !== undefined;
        const hasTimeWindow = paramsObj.timeWindowSize !== undefined;
        if (hasThreshold && hasTimeWindow) {
          score += 20;
        } else if (hasThreshold || hasTimeWindow) {
          score += 10;
          feedback.push('params should include both "threshold" and "timeWindowSize".');
        } else {
          score += 5;
          feedback.push('params object missing "threshold" and "timeWindowSize" fields.');
        }
      } else {
        feedback.push('Missing "params" object.');
      }

      // actions
      if (isNonEmptyArray(body.actions)) {
        const firstAction = body.actions[0] as Record<string, unknown>;
        const hasGroup = isNonEmptyString(firstAction.group);
        const hasId = isNonEmptyString(firstAction.id);
        const hasParams = firstAction.params && typeof firstAction.params === 'object';

        if (hasGroup && hasId && hasParams) {
          score += 20;
        } else {
          const missing: string[] = [];
          if (!hasGroup) missing.push('group');
          if (!hasId) missing.push('id');
          if (!hasParams) missing.push('params');
          score += 8;
          feedback.push(`Action object missing: ${missing.join(', ')}.`);
        }
      } else {
        feedback.push('Missing or empty "actions" array.');
      }

      return {
        correct: score >= 75,
        score,
        maxScore: 100,
        feedback: score >= 75
          ? 'Correct! Valid alerting rule with schedule, params, and actions.'
          : feedback.join(' '),
      };
    },
  },

  // 2. Connectors — intermediate
  {
    id: 'kibana-2-connectors',
    skillId: 'kibana-connectors',
    domain: 'esql',
    difficulty: 'intermediate',
    title: 'Create a Webhook Connector',
    description:
      'Produce the JSON request body for a POST request to create a Kibana webhook ' +
      'connector. The body must include: ' +
      '(1) "name" set to "Slack Webhook", ' +
      '(2) "connector_type_id" set to ".webhook", ' +
      '(3) "config" — an object with "url" set to "https://hooks.slack.com/services/T00/B00/xxxx" ' +
      'and "method" set to "post", and ' +
      '(4) "secrets" — an object (may be empty or contain auth headers). ' +
      'This corresponds to the POST /api/actions/connector endpoint.',
    hints: [
      'connector_type_id for webhooks is ".webhook"',
      'config contains the non-sensitive connector configuration',
      'secrets contains sensitive values (API keys, passwords)',
      'method should be lowercase: "post", "put", etc.',
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

      // name
      if (body.name === 'Slack Webhook') {
        score += 15;
      } else if (isNonEmptyString(body.name)) {
        score += 5;
        feedback.push('Name should be "Slack Webhook".');
      } else {
        feedback.push('Missing "name" field.');
      }

      // connector_type_id
      if (body.connector_type_id === '.webhook') {
        score += 25;
      } else if (isNonEmptyString(body.connector_type_id)) {
        score += 5;
        feedback.push('connector_type_id should be ".webhook".');
      } else {
        feedback.push('Missing "connector_type_id" field.');
      }

      // config object
      const config = body.config;
      if (config && typeof config === 'object' && !Array.isArray(config)) {
        const cfgObj = config as Record<string, unknown>;

        // url
        if (
          cfgObj.url === 'https://hooks.slack.com/services/T00/B00/xxxx'
        ) {
          score += 20;
        } else if (
          isNonEmptyString(cfgObj.url) &&
          String(cfgObj.url).startsWith('https://')
        ) {
          score += 10;
          feedback.push('config.url should be "https://hooks.slack.com/services/T00/B00/xxxx".');
        } else {
          feedback.push('Missing or invalid "url" in config.');
        }

        // method
        if (cfgObj.method === 'post') {
          score += 15;
        } else if (isNonEmptyString(cfgObj.method)) {
          score += 5;
          feedback.push('config.method should be "post".');
        } else {
          feedback.push('Missing "method" in config.');
        }
      } else {
        feedback.push('Missing "config" object (expected { url, method }).');
      }

      // secrets object (must be present, can be empty)
      if (body.secrets && typeof body.secrets === 'object' && !Array.isArray(body.secrets)) {
        score += 25;
      } else {
        feedback.push('Missing "secrets" object (required even if empty).');
      }

      return {
        correct: score >= 75,
        score,
        maxScore: 100,
        feedback: score >= 75
          ? 'Correct! Valid webhook connector with config and secrets.'
          : feedback.join(' '),
      };
    },
  },

  // 3. Dashboards — advanced
  {
    id: 'kibana-3-dashboards',
    skillId: 'kibana-dashboards',
    domain: 'esql',
    difficulty: 'advanced',
    title: 'Create a Dashboard with a Lens Panel',
    description:
      'Produce the JSON request body for a POST request to create a Kibana dashboard ' +
      'with a Lens visualization panel. The body must include: ' +
      '(1) "attributes" — an object containing: ' +
      '  (a) "title" set to "System Metrics Overview", ' +
      '  (b) "panels" — an array with at least one panel object. ' +
      'Each panel must have: ' +
      '  - "gridData" — an object with "x", "y", "w", "h" (integers for grid position/size), ' +
      '  - "panelConfig" — an object with "type" set to "lens" and a "title" string. ' +
      'This corresponds to the POST /api/dashboards/dashboard endpoint.',
    hints: [
      'The top-level key is "attributes" containing title and panels',
      'gridData positions the panel on the dashboard grid (x, y, w, h as integers)',
      'panelConfig.type should be "lens" for Lens visualizations',
      'Each panel should have both gridData and panelConfig',
    ],
    indexName: 'eq-api-placeholder',
    seedData: placeholderDocs,
    mapping: placeholderMapping,
    responseFormat: 'api-call',
    maxScore: 100,
    timeLimitMs: 30000,
    skillPaths: ['kibana/kibana-dashboards/SKILL.md'],
    validate: async (response) => {
      const body = response as unknown as Record<string, unknown>;

      let score = 0;
      const feedback: string[] = [];

      // attributes
      const attrs = body.attributes;
      if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) {
        feedback.push('Missing "attributes" object at top level.');
        return {
          correct: false,
          score: 0,
          maxScore: 100,
          feedback: feedback.join(' '),
        };
      }

      const attrsObj = attrs as Record<string, unknown>;

      // attributes.title
      if (attrsObj.title === 'System Metrics Overview') {
        score += 20;
      } else if (isNonEmptyString(attrsObj.title)) {
        score += 8;
        feedback.push('attributes.title should be "System Metrics Overview".');
      } else {
        feedback.push('Missing "title" in attributes.');
      }

      // attributes.panels
      const panels = attrsObj.panels;
      if (!isNonEmptyArray(panels)) {
        feedback.push('Missing or empty "panels" array in attributes.');
        return {
          correct: false,
          score,
          maxScore: 100,
          feedback: feedback.join(' '),
        };
      }

      score += 15;

      const firstPanel = panels[0] as Record<string, unknown>;

      // gridData
      const gridData = firstPanel.gridData;
      if (gridData && typeof gridData === 'object' && !Array.isArray(gridData)) {
        const gd = gridData as Record<string, unknown>;
        const hasX = typeof gd.x === 'number';
        const hasY = typeof gd.y === 'number';
        const hasW = typeof gd.w === 'number';
        const hasH = typeof gd.h === 'number';

        if (hasX && hasY && hasW && hasH) {
          score += 30;
        } else {
          const present = [hasX && 'x', hasY && 'y', hasW && 'w', hasH && 'h'].filter(Boolean);
          score += present.length * 5;
          feedback.push(
            `gridData should have numeric x, y, w, h fields (found: ${present.join(', ') || 'none'}).`,
          );
        }
      } else {
        feedback.push('Missing "gridData" object in panel.');
      }

      // panelConfig
      const panelConfig = firstPanel.panelConfig;
      if (panelConfig && typeof panelConfig === 'object' && !Array.isArray(panelConfig)) {
        const pc = panelConfig as Record<string, unknown>;

        // type = "lens"
        if (pc.type === 'lens') {
          score += 20;
        } else if (isNonEmptyString(pc.type)) {
          score += 5;
          feedback.push('panelConfig.type should be "lens".');
        } else {
          feedback.push('Missing "type" in panelConfig.');
        }

        // title
        if (isNonEmptyString(pc.title)) {
          score += 15;
        } else {
          feedback.push('Missing "title" in panelConfig.');
        }
      } else {
        feedback.push('Missing "panelConfig" object in panel.');
      }

      return {
        correct: score >= 70,
        score,
        maxScore: 100,
        feedback: score >= 70
          ? 'Correct! Valid dashboard with Lens panel, gridData, and panelConfig.'
          : feedback.join(' '),
      };
    },
  },

  // 4. Agent builder — advanced
  {
    id: 'kibana-4-agent-builder',
    skillId: 'kibana-agent-builder',
    domain: 'esql',
    difficulty: 'advanced',
    title: 'Create a Kibana AI Agent',
    description:
      'Produce the JSON request body for a POST request to create an AI agent via ' +
      'the Kibana Agent Builder API. The body must include: ' +
      '(1) "name" set to "Security Analyst Agent", ' +
      '(2) "description" — a non-empty string describing the agent\'s purpose, ' +
      '(3) "model" set to "openai/gpt-4o" (the LLM backing the agent), and ' +
      '(4) "tools" — an array with at least one tool object, each containing ' +
      '"name" (string) and "description" (string) fields. ' +
      'This corresponds to the POST /api/security_ai_assistant/agents endpoint.',
    hints: [
      'The body is a flat object with name, description, model, and tools',
      'model is a string identifier for the LLM provider and model name',
      'Each tool in the tools array should describe a capability the agent can use',
      'Tool objects need at minimum a name and description',
    ],
    indexName: 'eq-api-placeholder',
    seedData: placeholderDocs,
    mapping: placeholderMapping,
    responseFormat: 'api-call',
    maxScore: 100,
    timeLimitMs: 30000,
    skillPaths: ['kibana/kibana-agent-builder/SKILL.md'],
    validate: async (response) => {
      const body = response as unknown as Record<string, unknown>;

      let score = 0;
      const feedback: string[] = [];

      // name
      if (body.name === 'Security Analyst Agent') {
        score += 20;
      } else if (isNonEmptyString(body.name)) {
        score += 8;
        feedback.push('Name should be "Security Analyst Agent".');
      } else {
        feedback.push('Missing "name" field.');
      }

      // description
      if (isNonEmptyString(body.description)) {
        score += 15;
      } else {
        feedback.push('Missing or empty "description" field.');
      }

      // model
      if (body.model === 'openai/gpt-4o') {
        score += 25;
      } else if (isNonEmptyString(body.model)) {
        score += 10;
        feedback.push('model should be "openai/gpt-4o".');
      } else {
        feedback.push('Missing "model" field.');
      }

      // tools array
      if (isNonEmptyArray(body.tools)) {
        score += 15;

        const firstTool = body.tools[0] as Record<string, unknown>;
        const hasName = isNonEmptyString(firstTool.name);
        const hasDesc = isNonEmptyString(firstTool.description);

        if (hasName && hasDesc) {
          score += 25;
        } else {
          const missing: string[] = [];
          if (!hasName) missing.push('name');
          if (!hasDesc) missing.push('description');
          score += 10;
          feedback.push(`Tool object missing: ${missing.join(', ')}.`);
        }
      } else {
        feedback.push('Missing or empty "tools" array (expected at least one tool object).');
      }

      return {
        correct: score >= 75,
        score,
        maxScore: 100,
        feedback: score >= 75
          ? 'Correct! Valid AI agent configuration with model and tools.'
          : feedback.join(' '),
      };
    },
  },
];
