// Runs when Claude Code tries to end a turn. Typecheck, unit tests and the rule guard must pass.
// Turn it off for the final minutes: touch .claude/skip-check
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch {}
if (input.stop_hook_active) process.exit(0);                       // already retried once, let it stop
if (fs.existsSync(path.join(root, '.claude', 'skip-check'))) process.exit(0);
if (!fs.existsSync(path.join(root, 'package.json'))) process.exit(0);

const run = (cmd, args) => spawnSync(cmd, args, { cwd: root, encoding: 'utf8', timeout: 90000, shell: process.platform === 'win32' });
const fail = [];

const guard = run('node', [path.join(root, '.claude', 'hooks', 'rule-guard.mjs')]);
if (guard.status === 2) fail.push(guard.stderr);

if (fs.existsSync(path.join(root, 'tsconfig.json')) && fs.existsSync(path.join(root, 'node_modules'))) {
  const t = run('npx', ['--no-install', 'tsc', '--noEmit', '--pretty', 'false']);
  if (t.status !== 0 && t.status !== null) fail.push('Typecheck failed:\n' + (t.stdout + t.stderr).split('\n').slice(0, 25).join('\n'));
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.scripts && pkg.scripts['test:unit']) {
  const u = run('npm', ['run', '--silent', 'test:unit']);
  if (u.status !== 0 && u.status !== null) fail.push('Unit tests failed:\n' + (u.stdout + u.stderr).split('\n').slice(-25).join('\n'));
}

if (fail.length) {
  console.error('Interval Read stop check failed. Fix these, then finish.\n\n' + fail.join('\n\n'));
  process.exit(2);
}
process.exit(0);
