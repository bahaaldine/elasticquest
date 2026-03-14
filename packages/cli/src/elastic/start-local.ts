/**
 * start-local integration — provisions a local Elasticsearch instance
 * using Elastic's start-local script (Docker/Podman).
 *
 * This provides a real ES backend without needing Elastic Cloud credentials.
 * Users need Docker or Podman installed.
 *
 * Flow:
 *   1. Run `curl -fsSL https://elastic.co/start-local | sh`
 *   2. Parse the generated .env file for connection details
 *   3. Return a RealBackend configured for the local instance
 *   4. On teardown, stop the Docker containers
 */

import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RealBackend } from './real-backend';
import type { RealBackendConfig } from './real-backend';

export interface StartLocalResult {
  backend: RealBackend;
  esUrl: string;
  apiKey: string;
  workDir: string;
}

/**
 * Check if Docker or Podman is available.
 */
function checkContainerRuntime(): 'docker' | 'podman' | null {
  try {
    execSync('docker --version', { stdio: 'ignore' });
    return 'docker';
  } catch {
    // Docker not found
  }
  try {
    execSync('podman --version', { stdio: 'ignore' });
    return 'podman';
  } catch {
    // Podman not found
  }
  return null;
}

/**
 * Check if start-local is already running by looking for the work directory
 * and checking if ES is responsive.
 */
async function checkExistingInstance(
  workDir: string,
): Promise<StartLocalResult | null> {
  const envFile = path.join(workDir, '.env');
  if (!fs.existsSync(envFile)) return null;

  const envContent = fs.readFileSync(envFile, 'utf-8');
  const env = parseEnvFile(envContent);

  const esUrl = env.ES_LOCAL_URL;
  const apiKey = env.ES_LOCAL_API_KEY;

  if (!esUrl || !apiKey) return null;

  // Check if ES is responsive
  try {
    const response = await fetch(esUrl, {
      headers: { Authorization: `ApiKey ${apiKey}` },
    });
    if (response.ok) {
      const config: RealBackendConfig = {
        node: esUrl,
        apiKey,
      };
      return {
        backend: new RealBackend(config),
        esUrl,
        apiKey,
        workDir,
      };
    }
  } catch {
    // Not responsive
  }

  return null;
}

/**
 * Parse a simple .env file into key-value pairs.
 */
function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/**
 * Provision a local Elasticsearch instance using start-local.
 * Returns a configured RealBackend.
 */
export async function startLocal(): Promise<StartLocalResult> {
  const runtime = checkContainerRuntime();
  if (!runtime) {
    throw new Error(
      'start-local requires Docker or Podman.\n' +
        'Install Docker: https://docs.docker.com/get-docker/\n' +
        'Or use --real-es for Elastic Cloud instead.',
    );
  }

  process.stderr.write(`  Using ${runtime} for local Elasticsearch...\n`);

  // Use a consistent work directory
  const workDir = path.join(os.homedir(), 'elastic-start-local');

  // Check if already running
  const existing = await checkExistingInstance(workDir);
  if (existing) {
    process.stderr.write('  Found existing local Elasticsearch instance.\n');
    return existing;
  }

  process.stderr.write('  Starting local Elasticsearch via start-local...\n');
  process.stderr.write('  This may take a minute on first run (pulling images).\n');

  // Run start-local
  const result = spawnSync(
    'bash',
    ['-c', 'curl -fsSL https://elastic.co/start-local | sh'],
    {
      cwd: os.homedir(),
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 300000, // 5 minutes
      env: { ...process.env, CONTAINER_RUNTIME: runtime },
    },
  );

  if (result.status !== 0) {
    const stderr = result.stderr?.toString() ?? '';
    throw new Error(
      `start-local failed (exit ${result.status}):\n${stderr}\n` +
        'Make sure Docker/Podman is running and try again.',
    );
  }

  // Parse the .env file for connection details
  const envFile = path.join(workDir, '.env');
  if (!fs.existsSync(envFile)) {
    throw new Error(
      `start-local did not create ${envFile}.\n` +
        'Check the output above for errors.',
    );
  }

  const envContent = fs.readFileSync(envFile, 'utf-8');
  const env = parseEnvFile(envContent);

  const esUrl = env.ES_LOCAL_URL ?? 'http://localhost:9200';
  const apiKey = env.ES_LOCAL_API_KEY ?? '';

  if (!apiKey) {
    throw new Error(
      'start-local did not generate an API key.\n' +
        `Check ${envFile} for details.`,
    );
  }

  // Wait for ES to be ready
  process.stderr.write('  Waiting for Elasticsearch to be ready');
  const maxWait = 60000; // 60 seconds
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const response = await fetch(esUrl, {
        headers: { Authorization: `ApiKey ${apiKey}` },
      });
      if (response.ok) {
        process.stderr.write(' ready!\n');
        const config: RealBackendConfig = {
          node: esUrl,
          apiKey,
        };
        return {
          backend: new RealBackend(config),
          esUrl,
          apiKey,
          workDir,
        };
      }
    } catch {
      // Not ready yet
    }
    process.stderr.write('.');
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  throw new Error(
    `Elasticsearch did not become ready within ${maxWait / 1000}s.\n` +
      'Check Docker logs: docker logs es-local-es01',
  );
}

/**
 * Stop the local Elasticsearch instance.
 */
export async function stopLocal(workDir?: string): Promise<void> {
  const dir = workDir ?? path.join(os.homedir(), 'elastic-start-local');
  process.stderr.write('  Stopping local Elasticsearch...\n');
  try {
    spawnSync('docker', ['compose', 'down'], {
      cwd: dir,
      stdio: 'ignore',
      timeout: 30000,
    });
    process.stderr.write('  Local Elasticsearch stopped.\n');
  } catch {
    // Best effort cleanup
    process.stderr.write('  Could not stop local Elasticsearch (may already be stopped).\n');
  }
}
