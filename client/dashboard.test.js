import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { JourneyRows } from './src/JourneyRows.js';

const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../server');

test('demo login renders a dashboard containing all four journey rows', async t => {
  let child, output = '', origin;
  child = spawn(process.execPath, ['--env-file=.env', 'index.js'], {
    cwd: serverDirectory,
    env: { ...process.env, PORT: '0', MONGODB_URI: '', TELEGRAM_BOT_TOKEN: '', TELEGRAM_BOT_USERNAME: '', SMTP_USER: '', SMTP_PASS: '', JWT_SECRET: 'dashboard-test-secret' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  t.after(async () => {
    if (child.exitCode !== null) return;
    child.kill('SIGTERM');
    await new Promise(resolve => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 2000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  });

  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const match = output.match(/Bharat Safe demo API on :(\d+)/);
    if (match) { origin = `http://127.0.0.1:${match[1]}`; break; }
    if (child.exitCode !== null) throw new Error(`API server exited before startup: ${output}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(origin, `API server failed to start: ${output}`);
  const login = await fetch(`${origin}/api/auth/demo`, { method: 'POST' });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  const session = await fetch(`${origin}/api/auth/me`, { headers: { cookie } });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).authenticated, true);
  const journeysResponse = await fetch(`${origin}/api/journeys`, { headers: { cookie } });
  assert.equal(journeysResponse.status, 200);
  const journeys = await journeysResponse.json();
  const html = renderToStaticMarkup(React.createElement(JourneyRows, {
    journeys, loading: false, error: '', onRetry() {}, onChoose() {},
  }));
  assert.equal((html.match(/class="journey"/g) || []).length, 4);
  assert.match(html, /Hauz Khas Metro to IIT Delhi/);
  assert.match(html, /Saket Metro to Malviya Nagar/);
});
