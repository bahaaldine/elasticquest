/**
 * Elastic Cloud provisioning - creates a temporary ES deployment for benchmarking.
 *
 * Uses the Elastic Cloud API (api.elastic-cloud.com) to:
 * 1. Create a small deployment
 * 2. Wait for it to be healthy
 * 3. Return connection details
 * 4. Tear it down when done
 */

const ESS_API = 'https://api.elastic-cloud.com/api/v1';

export interface CloudDeployment {
  id: string;
  name: string;
  esUrl: string;
  esPassword: string;
  region: string;
}

export interface CloudConfig {
  apiKey: string;
  region?: string;    // default: gcp-us-central1
  version?: string;   // default: latest
}

/**
 * Create a minimal Elasticsearch deployment on Elastic Cloud.
 * Uses the smallest possible configuration to minimize cost.
 */
export async function createDeployment(config: CloudConfig): Promise<CloudDeployment> {
  const region = config.region ?? 'gcp-us-central1';
  const name = `elastic-quest-${Date.now()}`;

  process.stderr.write(`  Creating Elastic Cloud deployment "${name}" in ${region}...\n`);

  const body: Record<string, unknown> = {
    name,
    region,
    resources: {
      elasticsearch: [
        {
          ref_id: 'main-elasticsearch',
          region,
          plan: {
            cluster_topology: [
              {
                id: 'hot_content',
                zone_count: 1,
                size: {
                  value: 1024,  // 1GB RAM - smallest
                  resource: 'memory',
                },
                node_type: {
                  data: true,
                  master: true,
                  ingest: true,
                },
              },
            ],
            elasticsearch: {},
            deployment_template: {
              id: 'gcp-compute-optimized-v5',
            },
          },
        },
      ],
      kibana: [],         // no Kibana needed
      enterprise_search: [],
      integrations_server: [],
    },
    settings: {
      autoscaling_enabled: false,
    },
  };

  if (config.version) {
    (body.resources as Record<string, unknown[]>).elasticsearch[0] = {
      ...(body.resources as Record<string, unknown[]>).elasticsearch[0] as Record<string, unknown>,
      plan: {
        ...((body.resources as Record<string, unknown[]>).elasticsearch[0] as Record<string, unknown>).plan as Record<string, unknown>,
        elasticsearch: { version: config.version },
      },
    };
  }

  const response = await fetch(`${ESS_API}/deployments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `ApiKey ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create deployment (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    id: string;
    name: string;
    resources: Array<{
      ref_id: string;
      kind: string;
      cloud_id: string;
      credentials: { username: string; password: string };
      region: string;
    }>;
  };

  // Extract Elasticsearch resource
  const esResource = data.resources.find(
    (r) => r.kind === 'elasticsearch' || r.ref_id === 'main-elasticsearch',
  );

  if (!esResource) {
    throw new Error('No Elasticsearch resource found in deployment response');
  }

  const deploymentId = data.id;
  const password = esResource.credentials?.password ?? '';

  // Wait for the deployment to be healthy
  process.stderr.write('  Waiting for deployment to be ready');
  const esUrl = await waitForDeployment(config.apiKey, deploymentId);
  process.stderr.write(' ready!\n');

  return {
    id: deploymentId,
    name: data.name,
    esUrl,
    esPassword: password,
    region,
  };
}

/**
 * Poll the deployment status until Elasticsearch is running and reachable.
 */
async function waitForDeployment(
  apiKey: string,
  deploymentId: string,
  timeoutMs = 300000, // 5 minutes
  intervalMs = 10000,
): Promise<string> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(
        `${ESS_API}/deployments/${deploymentId}?show_plan_defaults=false`,
        {
          headers: { Authorization: `ApiKey ${apiKey}` },
        },
      );

      if (response.ok) {
        const data = (await response.json()) as {
          resources: {
            elasticsearch: Array<{
              info: {
                status: string;
                metadata: {
                  endpoint: string;
                  ports: { https: number };
                  cloud_id: string;
                };
              };
            }>;
          };
        };

        const es = data.resources?.elasticsearch?.[0];
        if (es?.info?.status === 'started' && es.info.metadata?.endpoint) {
          const endpoint = es.info.metadata.endpoint;
          const port = es.info.metadata.ports?.https ?? 443;
          return `https://${endpoint}:${port}`;
        }
      }
    } catch {
      // Ignore polling errors
    }

    process.stderr.write('.');
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Deployment ${deploymentId} did not become ready within ${timeoutMs / 1000}s`);
}

/**
 * Shut down and delete a deployment.
 */
export async function destroyDeployment(apiKey: string, deploymentId: string): Promise<void> {
  process.stderr.write(`  Shutting down deployment ${deploymentId}...\n`);

  // First shut down
  await fetch(`${ESS_API}/deployments/${deploymentId}/_shutdown`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `ApiKey ${apiKey}`,
    },
    body: JSON.stringify({ hide: true }),
  });

  process.stderr.write('  Deployment shut down.\n');
}

/**
 * List active ElasticQuest deployments (for cleanup).
 */
export async function listDeployments(
  apiKey: string,
): Promise<Array<{ id: string; name: string; status: string }>> {
  const response = await fetch(`${ESS_API}/deployments`, {
    headers: { Authorization: `ApiKey ${apiKey}` },
  });

  if (!response.ok) return [];

  const data = (await response.json()) as {
    deployments: Array<{
      id: string;
      name: string;
      resources: {
        elasticsearch: Array<{ info: { status: string } }>;
      };
    }>;
  };

  return data.deployments
    .filter((d) => d.name.startsWith('elastic-quest-'))
    .map((d) => ({
      id: d.id,
      name: d.name,
      status: d.resources?.elasticsearch?.[0]?.info?.status ?? 'unknown',
    }));
}
