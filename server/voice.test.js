import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { createVoiceRouter } from './voice.js';

test('voice endpoint serves only known pre-recorded MP3 assets with cache and audio headers', async () => {
  const app = express(); app.use('/voice', createVoiceRouter()); const server = createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const known = await fetch(`${base}/voice/alarm_en.mp3`);
    assert.equal(known.status, 200); assert.match(known.headers.get('content-type'), /audio\/mpeg/); assert.match(known.headers.get('cache-control'), /public/); assert.ok((await known.arrayBuffer()).byteLength > 0);
    for (const name of ['unknown_en.mp3', '../server/index.js', '%2e%2e%2fserver%2findex.js', 'sos_en.mp3/../../index.js']) assert.equal((await fetch(`${base}/voice/${name}`)).status, 404);
    assert.equal((await fetch(`${base}/voice/`)).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
