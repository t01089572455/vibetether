import os from 'node:os';
import path from 'node:path';
import { mkdir, realpath } from 'node:fs/promises';
import { exists } from './files.mjs';
import { PROJECT_MANIFEST } from './constants.mjs';

export function userHome() {
  return path.resolve(process.env.VIBETETHER_USER_HOME || os.homedir());
}

function platformBase(kind) {
  const home = userHome();
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    return path.join(base, 'VibeTether', kind);
  }
  if (kind === 'state') return process.env.XDG_STATE_HOME || path.join(home, '.local', 'state');
  if (kind === 'cache') return process.env.XDG_CACHE_HOME || path.join(home, '.cache');
  return process.env.XDG_CONFIG_HOME || path.join(home, '.config');
}

export function stateHome() {
  return path.resolve(process.env.VIBETETHER_STATE_HOME || (process.platform === 'win32' ? platformBase('state') : path.join(platformBase('state'), 'vibetether')));
}
export function cacheHome() {
  return path.resolve(process.env.VIBETETHER_CACHE_HOME || (process.platform === 'win32' ? platformBase('cache') : path.join(platformBase('cache'), 'vibetether')));
}
export function configHome() {
  return path.resolve(process.env.VIBETETHER_CONFIG_HOME || (process.platform === 'win32' ? platformBase('config') : path.join(platformBase('config'), 'vibetether')));
}
export async function ensureHomes() {
  await Promise.all([stateHome(), cacheHome(), configHome()].map((directory) => mkdir(directory, { recursive: true })));
}

export async function findTrackedProject(start = process.cwd()) {
  let current;
  try { current = await realpath(path.resolve(start)); } catch { return null; }
  while (true) {
    if (await exists(path.join(current, PROJECT_MANIFEST))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
