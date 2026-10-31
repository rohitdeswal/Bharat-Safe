import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'node:http';

const directory = path.dirname(fileURLToPath(import.meta.url));
let child, origin, output = '', telegramOrigin;
const telegramUpdates = [], telegramMessages = [], telegramLocations = [], telegramAudio = [], telegramOrder = [];
let messageId = 100;
const telegramServer = createServer(async (req, res) => { const chunks=[];for await (const chunk of req)chunks.push(chunk);const raw=Buffer.concat(chunks);const json=(status,value)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value))};if(req.url.endsWith('/sendAudio')){telegramAudio.push(raw.toString('latin1'));telegramOrder.push('audio');return json(200,{ok:true,result:{message_id:++messageId}})}const body=raw.length?JSON.parse(raw.toString()):{};if(req.url.endsWith('/getUpdates'))return json(200,{ok:true,result:telegramUpdates.splice(0)});if(req.url.endsWith('/sendMessage')){telegramMessages.push(body);telegramOrder.push('message');return json(200,{ok:true,result:{message_id:++messageId}})}if(req.url.endsWith('/sendLocation')){telegramLocations.push(body);telegramOrder.push('location');return body.chat_id==='2222'?json(502,{ok:false,description:'mock location failure'}):json(200,{ok:true,result:{message_id:++messageId}})}return json(200,{ok:true,result:{}})});

before(async () => {
  await new Promise(resolve => telegramServer.listen(0, '127.0.0.1', resolve));
  telegramOrigin=`http://127.0.0.1:${telegramServer.address().port}`;
  child = spawn(process.execPath, ['--env-file=.env', 'index.js'], {
    cwd: directory,
    env: { ...process.env, PORT: '0', MONGODB_URI: '', TELEGRAM_BOT_TOKEN: 'mock-token', TELEGRAM_BOT_USERNAME: 'bharatsafebot', TELEGRAM_API_BASE: telegramOrigin, SMTP_USER: '', SMTP_PASS: '', JWT_SECRET: 'route-test-secret' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const match = output.match(/Bharat Safe demo API on :(\d+)/);
    if (match) { origin = `http://127.0.0.1:${match[1]}`; return; }
    if (child.exitCode !== null) throw new Error(`API server exited before startup: ${output}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  child.kill();
  throw new Error(`API server did not start: ${output}`);
});

after(async () => {
  if (child && child.exitCode === null) {
  child.kill('SIGTERM');
  await new Promise(resolve => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 2000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
  }
  await new Promise(resolve => telegramServer.close(resolve));
});

test('demo login unlocks exactly four journeys and their scored routes; protected APIs reject anonymous requests', async () => {
  const request = (method, url, body, cookie) => fetch(`${origin}${url}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const anonymousChecks = [
    ['GET', '/api/journeys'], ['GET', '/api/journeys/hauz-khas/routes?time=22%3A00'],
    ['POST', '/api/trips', {}], ['PATCH', '/api/trips/missing/position', { position: 0 }], ['POST', '/api/trips/missing/reached', {}],
    ['POST', '/api/buddy/request', {}], ['GET', '/api/buddy/missing'], ['POST', '/api/buddy/missing/accept', {}],
    ['POST', '/api/buddy/missing/decline', {}], ['POST', '/api/buddy/missing/report', {}], ['POST', '/api/buddy/missing/block', {}],
    ['GET', '/api/profile'], ['PATCH', '/api/profile', {}], ['POST', '/api/profile/contacts', {}],
    ['PATCH', '/api/profile/contacts/missing', {}], ['DELETE', '/api/profile/contacts/missing'],
    ['POST', '/api/sos', {}], ['PATCH', '/api/sos/missing/position', {}], ['POST', '/api/sos/missing/clear', {}], ['GET', '/api/contact-inbox'],
    ['POST', '/api/profile/contacts/missing/telegram-link', {}], ['POST', '/api/profile/contacts/missing/telegram-unlink', {}], ['POST', '/api/profile/contacts/missing/test-alert', {}],
  ];
  for (const [method, url, body] of anonymousChecks) {
    assert.equal((await request(method, url, body)).status, 401, `${method} ${url} must reject a missing session`);
  }

  const login = await request('POST', '/api/auth/demo', {});
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie, 'demo sign-in must set an httpOnly session cookie');
  assert.match(login.headers.get('set-cookie'), /HttpOnly/i);
  const session = await request('GET', '/api/auth/me', undefined, cookie);
  assert.equal(session.status, 200);
  assert.equal((await session.json()).authenticated, true);

  const journeyResponse = await request('GET', '/api/journeys', undefined, cookie);
  assert.equal(journeyResponse.status, 200);
  const journeys = await journeyResponse.json();
  assert.equal(journeys.length, 4);
  for (const journey of journeys) {
    assert.ok(Array.isArray(journey.startCoordinates) && journey.startCoordinates.length === 2);
    const response = await request('GET', `/api/journeys/${journey.id}/routes?time=22%3A00`, undefined, cookie);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.routes.length, 2);
    assert.ok(result.routes.every(route => Number.isFinite(route.score)));
  }
  assert.equal((await request('GET', '/api/profile', undefined, cookie)).status, 200);
  assert.equal((await request('PATCH', '/api/profile', { name: 'Riya Sharma' }, cookie)).status, 200);const voiceProfile=await request('PATCH','/api/profile',{alarmSettings:{demoTiming:true,checkInInterval:20,responseCountdown:10,voiceLanguage:'hi',voiceGuidance:false}},cookie);assert.equal(voiceProfile.status,200);const savedVoice=(await voiceProfile.json()).profile.alarmSettings;assert.equal(savedVoice.voiceLanguage,'hi');assert.equal(savedVoice.voiceGuidance,false);
  assert.equal((await request('GET', '/api/contact-inbox', undefined, cookie)).status, 200);

  const contact = await request('POST', '/api/profile/contacts', { name: 'Test contact', relationship: 'friend', phone: '+91 90000 00123', email: 'test-contact@example.com', telegramChatId: 'private-chat-marker', linkToken: 'private-link-marker' }, cookie);
  assert.equal(contact.status, 201);
  const contactBody = await contact.json();
  const contacts = contactBody.contacts;
  assert.equal(JSON.stringify(contactBody).includes('private-chat-marker'), false);
  assert.equal(JSON.stringify(contactBody).includes('private-link-marker'), false);
  const contactId = contacts.at(-1).id;
  assert.equal((await request('PATCH', `/api/profile/contacts/${contactId}`, { name: 'Updated contact' }, cookie)).status, 200);
  assert.equal((await request('DELETE', `/api/profile/contacts/${contactId}`, undefined, cookie)).status, 200);
  const waitFor = async predicate => { const deadline=Date.now()+4000; while(Date.now()<deadline){if(await predicate())return true;await new Promise(resolve=>setTimeout(resolve,25))}return false };
  for (const [contactId,chatId] of [['contact-mom','1111'],['contact-aarav','2222']]) { const linked=await request('POST',`/api/profile/contacts/${contactId}/telegram-link`,{},cookie);assert.equal(linked.status,201);const startToken=new URL((await linked.json()).url).searchParams.get('start');telegramUpdates.push({update_id:messageId+1,message:{chat:{id:Number(chatId)},text:`/start ${startToken}`}});assert.equal(await waitFor(async()=>{const result=await request('GET','/api/profile',undefined,cookie);return (await result.json()).profile.contacts.find(c=>c.id===contactId)?.telegramLinked}),true,`Telegram link should be saved for ${contactId}`) }
  const relogin=await request('POST','/api/auth/demo',{});assert.equal(relogin.status,200);const persistedVoice=(await (await request('GET','/api/profile',undefined,relogin.headers.get('set-cookie')?.split(';')[0])).json()).profile.alarmSettings;assert.equal(persistedVoice.voiceLanguage,'hi');assert.equal(persistedVoice.voiceGuidance,false);const reloginCookie=relogin.headers.get('set-cookie')?.split(';')[0];assert.equal((await (await request('GET','/api/profile',undefined,reloginCookie)).json()).profile.contacts.filter(c=>c.telegramLinked).length,2,'demo login preserves Telegram links');
  await request('PATCH','/api/profile',{name:'Riya Sharma'},reloginCookie);assert.equal((await (await request('GET','/api/profile',undefined,reloginCookie)).json()).profile.contacts.filter(c=>c.telegramLinked).length,2,'profile saves preserve Telegram links');
  assert.equal((await request('POST', '/api/profile/contacts/contact-mom/test-alert', {}, reloginCookie)).status, 200);
  assert.equal((await request('POST', '/api/profile/contacts/contact-mom/test-alert', {}, reloginCookie)).status, 429);

  const buddyResponse = await request('POST', '/api/buddy/request', { journeyId: 'hauz-khas', routeIndex: 1, time: '22:00' }, cookie);
  assert.equal(buddyResponse.status, 200);
  const buddy = await buddyResponse.json();
  const buddyId = buddy.id || 'missing';
  assert.notEqual((await request('GET', `/api/buddy/${buddyId}`, undefined, cookie)).status, 401);
  assert.notEqual((await request('POST', `/api/buddy/${buddyId}/accept`, {}, cookie)).status, 401);
  for (const action of ['decline', 'report', 'block']) assert.equal((await request('POST', `/api/buddy/${buddyId}/${action}`, {}, cookie)).status, 200);

  const tripResponse = await request('POST', '/api/trips', { journeyId: 'hauz-khas', routeIndex: 1, time: '22:00' }, cookie);
  assert.equal(tripResponse.status, 201);
  const trip = await tripResponse.json();
  assert.equal((await request('PATCH', `/api/trips/${trip.token}/position`, { position: 1 }, cookie)).status, 200);
  assert.equal((await request('POST', `/api/trips/${trip.token}/reached`, {}, cookie)).status, 200);
  assert.equal((await request('GET', `/api/trips/${trip.token}`)).status, 200, 'trip sharing stays public');

  telegramMessages.length=0;telegramLocations.length=0;telegramAudio.length=0;telegramOrder.length=0;
  assert.equal((await request('POST','/api/sos',{journeyId:'hauz-khas',routeIndex:1,location:{lat:28.54,lng:77.2,accuracy:100001,fixedAt:Date.now()},time:'22:00'},reloginCookie)).status,400,'invalid location accuracy is rejected');
  const clientSosPayload={journeyId:'hauz-khas',routeIndex:1,location:{lat:28.54,lng:77.2,accuracy:12,fixedAt:Date.now()},time:'22:00',sosTime:'8:42 AM'};
  const sosResponse = await request('POST', '/api/sos', clientSosPayload, reloginCookie);
  assert.equal(sosResponse.status, 201);
  const sos = await sosResponse.json();
  const duplicateSos=await request('POST','/api/sos',clientSosPayload,reloginCookie);assert.equal(duplicateSos.status,200);const duplicateBody=await duplicateSos.json();assert.equal(duplicateBody.existing,true);assert.equal(duplicateBody.token,sos.token);assert.ok(Array.isArray(duplicateBody.deliveries));
  assert.equal(await waitFor(async()=>{const inbox=await request('GET','/api/contact-inbox',undefined,reloginCookie);const found=(await inbox.json()).messages.find(m=>m.token===sos.token);return found?.message.includes('Time: 8:42 AM')}),true,'contact inbox uses the local SOS time');
  assert.equal(await waitFor(()=>telegramMessages.filter(m=>/did not respond to a safety check-in/.test(m.text||'')).length===2&&telegramLocations.length>=3),true,'SOS text and location are sent, retrying the mock failed location once');assert.equal(await waitFor(()=>telegramAudio.length===2),true,'each linked contact receives the SOS voice clip');assert.ok(telegramAudio.every(audio=>audio.includes('filename=\"sos_hi.mp3\"')));assert.ok(telegramAudio.every(audio=>audio.includes('Voice message from Bharat Safe')));
  assert.equal(Math.max(...telegramOrder.map((value,index)=>value==='message'?index:-1))<Math.min(...telegramOrder.map((value,index)=>value==='location'?index:Infinity)),true,'all SOS text requests precede all live location requests');assert.ok(telegramOrder.indexOf('audio')>telegramOrder.indexOf('location'),'the recorded SOS voice follows the live location call');
  const sosPublic=await request('GET',`/api/sos/${sos.token}`);const sosState=await sosPublic.json();assert.equal(sosState.time,'8:42 AM');assert.ok(telegramMessages.some(m=>m.text?.includes('Time: 8:42 AM')),'Telegram uses the local SOS time');assert.equal(sosState.deliveries.find(d=>d.contactId==='contact-mom').telegram.status,'sent');assert.equal(sosState.deliveries.find(d=>d.contactId==='contact-mom').telegram.locationStatus,'sent');assert.equal(sosState.deliveries.find(d=>d.contactId==='contact-aarav').telegram.status,'sent');assert.equal(sosState.deliveries.find(d=>d.contactId==='contact-aarav').telegram.locationStatus,'failed','a failing location request does not undo its text message');assert.equal(sosState.deliveries.find(d=>d.contactId==='contact-mom').voice.sos.status,'sent');assert.equal(sosState.deliveries.find(d=>d.contactId==='contact-aarav').voice.sos.status,'sent','voice delivery proceeds even if live location fails');
  assert.match(output,/\[sos\] created token=[a-f0-9]{8} contacts=2/);assert.match(output,/\[delivery\] channel=telegram contact=contact-mom status=sent reason=none/);
  assert.equal((await request('PATCH', `/api/sos/${sos.token}/position`, { location: {lat:28.541,lng:77.201,accuracy:10,fixedAt:Date.now()} }, reloginCookie)).status, 201);
  const publicUpdated=await (await request('GET',`/api/sos/${sos.token}`)).json();assert.deepEqual(publicUpdated.positions.at(-1).coordinates,[28.541,77.201]);assert.equal(publicUpdated.positions.at(-1).accuracy,10);assert.equal(publicUpdated.locationStatus,'live');assert.equal(output.includes('28.541'),false,'position logs do not contain coordinates');
  const clearActive=await request('POST','/api/sos/clear-active',{},reloginCookie);assert.equal(clearActive.status,200);assert.equal((await clearActive.json()).cleared,true);
  assert.equal((await request('POST', '/api/sos', clientSosPayload, reloginCookie)).status, 429);
  assert.equal((await request('GET', `/api/sos/${sos.token}`)).status, 200, 'public SOS view stays public');
});
