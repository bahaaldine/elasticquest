/**
 * Elasticsearch License management.
 *
 * Handles:
 * - Checking current license level
 * - Uploading a license file (enterprise/platinum/gold)
 * - Starting a trial license (30 days, all features, once per major version)
 * - Comparing license levels to determine if a scenario can run
 */

import * as fs from 'fs';
import type { LicenseLevel } from '../types';

/** License info returned by GET /_license */
export interface LicenseInfo {
  type: string;
  status: string;
  uid: string;
  issuedTo: string;
  expiryDate?: string;
  maxNodes?: number;
}

/** Ordered license levels (ascending capability). */
const LICENSE_ORDER: Record<string, number> = {
  basic: 0,
  standard: 1,
  gold: 2,
  platinum: 3,
  enterprise: 4,
  trial: 4, // trial has enterprise-equivalent features
};

/**
 * Check if a license level meets the minimum requirement.
 */
export function meetsLicenseLevel(
  current: string,
  required: LicenseLevel,
): boolean {
  const currentLevel = LICENSE_ORDER[current.toLowerCase()] ?? -1;
  const requiredLevel = LICENSE_ORDER[required.toLowerCase()] ?? 0;
  return currentLevel >= requiredLevel;
}

/**
 * Get the current license from Elasticsearch.
 */
export async function getLicense(
  esUrl: string,
  authHeader: string,
): Promise<LicenseInfo> {
  const response = await fetch(`${esUrl}/_license`, {
    headers: { Authorization: authHeader },
  });

  if (!response.ok) {
    throw new Error(`Failed to get license: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    license: {
      type: string;
      status: string;
      uid: string;
      issued_to: string;
      expiry_date?: string;
      max_nodes?: number;
    };
  };

  return {
    type: data.license.type,
    status: data.license.status,
    uid: data.license.uid,
    issuedTo: data.license.issued_to,
    expiryDate: data.license.expiry_date,
    maxNodes: data.license.max_nodes,
  };
}

/**
 * Upload a license file to Elasticsearch.
 */
export async function uploadLicense(
  esUrl: string,
  authHeader: string,
  licensePath: string,
): Promise<LicenseInfo> {
  if (!fs.existsSync(licensePath)) {
    throw new Error(`License file not found: ${licensePath}`);
  }

  const licenseContent = fs.readFileSync(licensePath, 'utf-8');
  let licenseBody: Record<string, unknown>;

  try {
    licenseBody = JSON.parse(licenseContent);
  } catch {
    throw new Error(
      `Invalid license file: could not parse JSON from ${licensePath}`,
    );
  }

  // Normalize: the file might have { "license": {...} } or { "licenses": [...] }
  // or just the license object directly
  if (!licenseBody.license && !licenseBody.licenses) {
    // Assume it's the license object itself, wrap it
    licenseBody = { license: licenseBody };
  }

  process.stderr.write('  Uploading license to Elasticsearch...\n');

  // First attempt without acknowledge
  let response = await fetch(`${esUrl}/_license`, {
    method: 'PUT',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(licenseBody),
  });

  let result = (await response.json()) as {
    acknowledged: boolean;
    license_status: string;
    acknowledge?: { message: string };
  };

  // If acknowledgment needed, re-send with acknowledge=true
  if (!result.acknowledged && result.acknowledge) {
    process.stderr.write(
      `  License requires acknowledgment: ${result.acknowledge.message}\n`,
    );
    process.stderr.write('  Auto-acknowledging...\n');

    response = await fetch(`${esUrl}/_license?acknowledge=true`, {
      method: 'PUT',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(licenseBody),
    });

    result = (await response.json()) as {
      acknowledged: boolean;
      license_status: string;
    };
  }

  if (!result.acknowledged) {
    throw new Error(
      `License upload failed: status=${result.license_status}`,
    );
  }

  process.stderr.write(
    `  License uploaded: status=${result.license_status}\n`,
  );

  // Return updated license info
  return getLicense(esUrl, authHeader);
}

/**
 * Start a trial license (30 days, all enterprise features).
 * Can only be activated once per major version.
 */
export async function startTrialLicense(
  esUrl: string,
  authHeader: string,
): Promise<LicenseInfo> {
  // Check eligibility first
  const eligibilityResponse = await fetch(
    `${esUrl}/_license/trial_status`,
    { headers: { Authorization: authHeader } },
  );

  if (eligibilityResponse.ok) {
    const eligibility = (await eligibilityResponse.json()) as {
      eligible_to_start_trial: boolean;
    };
    if (!eligibility.eligible_to_start_trial) {
      process.stderr.write(
        '  Trial already used for this major version. Use --license-file instead.\n',
      );
      // Still return current license, don't throw
      return getLicense(esUrl, authHeader);
    }
  }

  process.stderr.write('  Starting 30-day trial license...\n');

  const response = await fetch(
    `${esUrl}/_license/start_trial?acknowledge=true`,
    {
      method: 'POST',
      headers: { Authorization: authHeader },
    },
  );

  const result = (await response.json()) as {
    trial_was_started: boolean;
    acknowledged: boolean;
    error_message?: string;
  };

  if (!result.trial_was_started) {
    if (result.error_message) {
      process.stderr.write(`  Trial not started: ${result.error_message}\n`);
    } else {
      process.stderr.write(
        '  Trial not started (may have been used before). Continuing with current license.\n',
      );
    }
    return getLicense(esUrl, authHeader);
  }

  process.stderr.write('  Trial license activated (30 days, all features).\n');
  return getLicense(esUrl, authHeader);
}

/**
 * Build the auth header from available credentials.
 */
export function buildAuthHeader(config: {
  apiKey?: string;
  username?: string;
  password?: string;
}): string {
  if (config.apiKey) {
    return `ApiKey ${config.apiKey}`;
  }
  if (config.username && config.password) {
    return `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`;
  }
  throw new Error('No authentication credentials available for license API.');
}
