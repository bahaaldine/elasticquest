/**
 * Skill content loader — reads SKILL.md files and reference documents
 * from the elastic/agent-skills repository.
 *
 * Skills can be loaded from:
 *   1. A local clone of the repo (--skills-path)
 *   2. A local installation via `npx skills add` (.agents/skills/)
 *   3. Fetched from GitHub on demand
 *
 * The loader resolves skill content and injects it into scenario prompts
 * when --skills mode is enabled.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/** Resolved skill content ready for prompt injection. */
export interface SkillContent {
  skillId: string;
  skillMd: string;            // The SKILL.md content
  references: SkillReference[];
}

export interface SkillReference {
  path: string;               // relative path within the skill folder
  content: string;
}

/** Where to look for skill files. */
const SEARCH_PATHS = [
  // Project-level installations (by agent installers)
  '.agents/skills',
  '.claude/skills',
  '.windsurf/skills',
  // Home directory installations (global)
  path.join(os.homedir(), '.agents', 'skills'),
  // Explicit clone
  'agent-skills/skills',
];

/** Skill ID to directory path mapping within the skills tree. */
const SKILL_PATHS: Record<string, string> = {
  'elasticsearch-esql': 'elasticsearch/elasticsearch-esql',
  'elasticsearch-audit': 'elasticsearch/elasticsearch-audit',
  'elasticsearch-authn': 'elasticsearch/elasticsearch-authn',
  'elasticsearch-authz': 'elasticsearch/elasticsearch-authz',
  'elasticsearch-file-ingest': 'elasticsearch/elasticsearch-file-ingest',
  'elasticsearch-security-troubleshooting':
    'elasticsearch/elasticsearch-security-troubleshooting',
  'cloud-setup': 'cloud/setup',
  'cloud-create-project': 'cloud/create-project',
  'cloud-manage-project': 'cloud/manage-project',
  'cloud-access-management': 'cloud/access-management',
  'cloud-network-security': 'cloud/network-security',
  'kibana-agent-builder': 'kibana/agent-builder',
  'kibana-alerting-rules': 'kibana/kibana-alerting-rules',
  'kibana-audit': 'kibana/kibana-audit',
  'kibana-connectors': 'kibana/kibana-connectors',
  'kibana-dashboards': 'kibana/kibana-dashboards',
  'kibana-vega': 'kibana/kibana-vega',
  'kibana-streams': 'kibana/streams',
  'observability-llm-obs': 'observability/llm-obs',
  'observability-logs-search': 'observability/logs-search',
  'observability-manage-slos': 'observability/manage-slos',
  'observability-service-health': 'observability/service-health',
  'security-alert-triage': 'security/alert-triage',
  'security-case-management': 'security/case-management',
  'security-detection-rule-management': 'security/detection-rule-management',
  'security-generate-sample-data': 'security/generate-security-sample-data',
};

/**
 * Find the skills root directory by searching known paths.
 */
function findSkillsRoot(explicitPath?: string): string | null {
  if (explicitPath) {
    // Check if it's a repo root with a skills/ subdirectory first
    const skillsSub = path.join(explicitPath, 'skills');
    if (fs.existsSync(skillsSub)) return skillsSub;
    if (fs.existsSync(explicitPath)) return explicitPath;
    return null;
  }

  // Search known installation paths
  for (const searchPath of SEARCH_PATHS) {
    const resolved = path.resolve(searchPath);
    if (fs.existsSync(resolved)) {
      // Check if this directory contains skill folders
      const entries = fs.readdirSync(resolved);
      const hasSkillFolders = entries.some((e) => {
        const skillMd = path.join(resolved, e, 'SKILL.md');
        return fs.existsSync(skillMd);
      });
      // Also check nested structure (elasticsearch/elasticsearch-esql/SKILL.md)
      const hasNestedSkills = entries.some((e) => {
        const nested = path.join(resolved, e);
        if (!fs.statSync(nested).isDirectory()) return false;
        const subEntries = fs.readdirSync(nested);
        return subEntries.some((se) =>
          fs.existsSync(path.join(nested, se, 'SKILL.md')),
        );
      });
      if (hasSkillFolders || hasNestedSkills) return resolved;
    }
  }

  return null;
}

/**
 * Resolve the path to a skill's directory.
 * Handles both flat (installed) and nested (repo) layouts.
 */
function resolveSkillDir(
  skillsRoot: string,
  skillId: string,
): string | null {
  // Try the nested repo layout first (elasticsearch/elasticsearch-esql/)
  const nestedPath = SKILL_PATHS[skillId];
  if (nestedPath) {
    const full = path.join(skillsRoot, nestedPath);
    if (fs.existsSync(path.join(full, 'SKILL.md'))) return full;
  }

  // Try flat layout (skill installed directly: skills/elasticsearch-esql/)
  const flat = path.join(skillsRoot, skillId);
  if (fs.existsSync(path.join(flat, 'SKILL.md'))) return flat;

  // Try with common prefixes stripped
  for (const [id, relPath] of Object.entries(SKILL_PATHS)) {
    if (id === skillId) {
      const full = path.join(skillsRoot, relPath);
      if (fs.existsSync(path.join(full, 'SKILL.md'))) return full;
    }
  }

  return null;
}

/**
 * Load skill content for a given skill ID.
 * Returns null if the skill is not found.
 */
export function loadSkill(
  skillId: string,
  options?: {
    skillsPath?: string;
    referencePaths?: string[];
  },
): SkillContent | null {
  const root = findSkillsRoot(options?.skillsPath);
  if (!root) return null;

  const skillDir = resolveSkillDir(root, skillId);
  if (!skillDir) return null;

  const skillMdPath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) return null;

  const skillMd = fs.readFileSync(skillMdPath, 'utf-8');

  // Load requested reference files
  const references: SkillReference[] = [];
  if (options?.referencePaths) {
    for (const refPath of options.referencePaths) {
      const fullRefPath = path.join(skillDir, refPath);
      if (fs.existsSync(fullRefPath)) {
        references.push({
          path: refPath,
          content: fs.readFileSync(fullRefPath, 'utf-8'),
        });
      }
    }
  } else {
    // Auto-load references/ directory if it exists
    const refsDir = path.join(skillDir, 'references');
    if (fs.existsSync(refsDir) && fs.statSync(refsDir).isDirectory()) {
      const refFiles = fs.readdirSync(refsDir).filter((f) => f.endsWith('.md'));
      for (const refFile of refFiles) {
        const fullRefPath = path.join(refsDir, refFile);
        references.push({
          path: `references/${refFile}`,
          content: fs.readFileSync(fullRefPath, 'utf-8'),
        });
      }
    }
  }

  return { skillId, skillMd, references };
}

/**
 * Load multiple skills by ID.
 */
export function loadSkills(
  skillIds: string[],
  options?: { skillsPath?: string },
): Map<string, SkillContent> {
  const result = new Map<string, SkillContent>();
  for (const id of skillIds) {
    const content = loadSkill(id, options);
    if (content) {
      result.set(id, content);
    }
  }
  return result;
}

/**
 * List all available skills from the skills root.
 */
export function listAvailableSkills(
  skillsPath?: string,
): Array<{ id: string; name: string; description: string }> {
  const root = findSkillsRoot(skillsPath);
  if (!root) return [];

  const skills: Array<{ id: string; name: string; description: string }> = [];

  for (const [id] of Object.entries(SKILL_PATHS)) {
    const skillDir = resolveSkillDir(root, id);
    if (!skillDir) continue;

    const skillMdPath = path.join(skillDir, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) continue;

    const content = fs.readFileSync(skillMdPath, 'utf-8');
    const frontmatter = parseFrontmatter(content);
    skills.push({
      id,
      name: frontmatter.name ?? id,
      description: frontmatter.description ?? '',
    });
  }

  return skills;
}

/**
 * Parse YAML frontmatter from a SKILL.md file.
 * Simple parser — handles name and description fields only.
 */
function parseFrontmatter(
  content: string,
): Record<string, string> {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};

  const yaml = match[1];
  const result: Record<string, string> = {};

  let currentKey = '';
  let currentValue = '';

  for (const line of yaml.split('\n')) {
    // Check for key: value pattern
    const kvMatch = line.match(/^(\w[\w-]*):\s*(.*)/);
    if (kvMatch) {
      // Save previous key if any
      if (currentKey) {
        result[currentKey] = currentValue.trim();
      }
      currentKey = kvMatch[1];
      currentValue = kvMatch[2];
      // Handle YAML multiline indicator (>)
      if (currentValue === '>' || currentValue === '|') {
        currentValue = '';
      }
    } else if (currentKey && line.startsWith('  ')) {
      // Continuation line for multiline value
      currentValue += ' ' + line.trim();
    }
  }

  // Save last key
  if (currentKey) {
    result[currentKey] = currentValue.trim();
  }

  return result;
}

/**
 * Format skill content for injection into a prompt.
 * Strips frontmatter and optionally limits reference content.
 */
export function formatSkillForPrompt(
  skill: SkillContent,
  options?: {
    maxReferenceLength?: number;
    includeReferences?: boolean;
  },
): string {
  const maxRefLen = options?.maxReferenceLength ?? 50000;
  const includeRefs = options?.includeReferences ?? true;

  // Strip YAML frontmatter from SKILL.md
  let skillContent = skill.skillMd.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');

  let result = `--- SKILL: ${skill.skillId} ---\n\n${skillContent}`;

  if (includeRefs && skill.references.length > 0) {
    result += '\n\n--- SKILL REFERENCES ---\n';
    for (const ref of skill.references) {
      let content = ref.content;
      if (content.length > maxRefLen) {
        content = content.slice(0, maxRefLen) + '\n[... truncated ...]';
      }
      result += `\n### ${ref.path}\n\n${content}\n`;
    }
  }

  result += '\n--- END SKILL ---\n';
  return result;
}
