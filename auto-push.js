#!/usr/bin/env node
/**
 * Auto-push watcher — watches src/ for changes and pushes to GitHub.
 * Run with: node auto-push.js
 */
import chokidar from 'chokidar';
import { execSync } from 'child_process';

const DEBOUNCE_MS = 3000;
let timer = null;

function push() {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    if (!status) return;

    const timestamp = new Date().toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    execSync('git add -A', { stdio: 'inherit' });
    execSync(`git commit -m "Update: ${timestamp}"`, { stdio: 'inherit' });
    execSync('git push', { stdio: 'inherit' });
    console.log(`\n✅ Pushed at ${timestamp}\n`);
  } catch (err) {
    console.error('⚠️  Auto-push failed:', err.message);
  }
}

chokidar
  .watch(['src'], {
    ignored: /node_modules|\.git/,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 100 },
  })
  .on('all', (event, filePath) => {
    console.log(`📝 ${event}: ${filePath}`);
    clearTimeout(timer);
    timer = setTimeout(push, DEBOUNCE_MS);
  });

console.log('👀 Watching src/ — will auto-commit & push changes to GitHub\n');
