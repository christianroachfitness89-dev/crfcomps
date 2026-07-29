/*
 * CRF Comps — auto-commit watcher
 *
 * Watches the project directory and commits any working-tree change
 * after a short debounce. Run with: node scripts/auto-commit.js
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ROOT = process.cwd();
const DEBOUNCE_MS = 2000;
const IGNORE = new Set([
  '.git',
  'node_modules',
  '.claude',
  '.DS_Store',
  'Thumbs.db',
  '.env.local',
  '.env'
]);

let timer = null;
let running = false;

function isIgnored(p) {
  const rel = path.relative(ROOT, p);
  if (!rel) return false;
  const parts = rel.split(path.sep);
  return parts.some(function (part) { return IGNORE.has(part); });
}

function commit() {
  if (running) return;
  running = true;

  const msg = 'auto: ' + new Date().toISOString();
  const cmd = 'git add -A && git commit -m "' + msg.replace(/"/g, '\\"') + '" --no-verify';

  exec(cmd, { cwd: ROOT }, function (err, stdout, stderr) {
    running = false;
    const out = (stdout || '') + (stderr || '');
    if (out.toLowerCase().includes('nothing to commit')) {
      console.log('auto-commit: nothing to commit');
      return;
    }
    if (err) {
      console.error('auto-commit failed:', out || err.message);
      return;
    }
    const first = out.trim().split('\n')[0];
    console.log('auto-commit:', first);
  });
}

function scheduleCommit() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(commit, DEBOUNCE_MS);
}

function startWatching() {
  try {
    fs.watch(ROOT, { recursive: true }, function (eventType, filename) {
      if (!filename) return;
      const full = path.join(ROOT, filename);
      if (isIgnored(full)) return;
      const rel = path.relative(ROOT, full);
      console.log('change detected:', rel, '(' + eventType + ')');
      scheduleCommit();
    });
  } catch (err) {
    console.error('Could not start watcher:', err.message);
    process.exit(1);
  }
  console.log('auto-commit watcher started:', ROOT);
  console.log('debounce:', DEBOUNCE_MS + 'ms');
}

startWatching();
