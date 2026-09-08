import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function loadConfig() {
  const projectsFile = process.env.FRONTEND_TEST_PROJECTS_FILE
    ? path.resolve(process.env.FRONTEND_TEST_PROJECTS_FILE)
    : await preferLocal('config/projects.local.json', 'config/projects.json');
  const scenariosFile = process.env.FRONTEND_TEST_SCENARIOS_FILE
    ? path.resolve(process.env.FRONTEND_TEST_SCENARIOS_FILE)
    : await preferLocal('config/scenarios.local.json', 'config/scenarios.json');
  return {
    root: ROOT,
    projects: JSON.parse(await fs.readFile(projectsFile, 'utf8')),
    scenarios: JSON.parse(await fs.readFile(scenariosFile, 'utf8')),
    authDir: path.resolve(process.env.FRONTEND_TEST_AUTH_DIR || path.join(ROOT, '.auth')),
  };
}

export function selectProjects(projects, selector) {
  if (!selector || selector === 'all') return Object.entries(projects);
  if (!projects[selector]) throw new Error(`未知项目 ${selector}，可选：${Object.keys(projects).join(', ')}`);
  return [[selector, projects[selector]]];
}

async function preferLocal(localName, sharedName) {
  const localFile = path.join(ROOT, localName);
  try { await fs.access(localFile); return localFile; } catch { return path.join(ROOT, sharedName); }
}
