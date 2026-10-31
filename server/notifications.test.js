import test from 'node:test';
import assert from 'node:assert/strict';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAlertService, safeDeliveryResults, formatLocationLine } from './alerts.js';
import { handleTelegramUpdate, issueTelegramLink, validTelegramLink, createTelegramClient } from './telegram.js';
import { sosCreationBlock, testAlertRemaining, needsSosDeliveryRetry } from './safety.js';

const user = { id: 'user-one', name: 'Riya Sharma' };
const eventFor = contacts => ({ token: 'sos-token-private', userId: user.id, name: user.name, time: '22:15', status: 'active', expiresAt: Date.now() + 86400000, positions: [{ coordinates: [28.54, 77.2], accuracy: 9, fixedAt: Date.now() }], contacts });
const quiet = { sleep: async () => {} };

test('Telegram link tokens are short-lived, single-use, and consumed by /start', async () => {
  const now = 1000, contact = { id: 'contact-1', name: 'Mom' }, link = issueTelegramLink(contact, '@bharatsafebot', now);
  assert.match(link.url, /^https:\/\/t\.me\/bharatsafebot\?start=[A-Za-z0-9_-]{1,64}$/);
  assert.equal(link.expiresAt, now + 15 * 60 * 1000);
  assert.equal(validTelegramLink(contact, new URL(link.url).searchParams.get('start'), now), true);
  assert.equal(validTelegramLink(contact, contact.linkToken, link.expiresAt), false);
  const sent = [], saved = [];
  const deps = { telegram: { sendMessage: async (chat, text) => sent.push({ chat, text }) }, findContactByToken: async token => validTelegramLink(contact, token, now) ? { user, contact } : null, findContactByChat: async () => null, saveUser: async value => saved.push(value), now: () => now };
  const update = { message: { chat: { id: 987654321 }, text: `/start ${contact.linkToken}` } };
  assert.equal(await handleTelegramUpdate(update, deps), true);
  assert.equal(contact.telegramChatId, '987654321');
  assert.equal(contact.linkToken, undefined);
  assert.equal(saved.length, 1);
  assert.match(sent[0].text, /Riya Sharma on Bharat Safe/);
  assert.match(sent[0].text, /call 112/i);
  await handleTelegramUpdate(update, deps);
  assert.match(sent[1].text, /link has expired/i);
});

test('plain /start and /stop reply clearly and unlink the chat', async () => {
  const contact = { id: 'contact-2', telegramChatId: '12345', telegramLinkedAt: 4 }, sent = [];
  await handleTelegramUpdate({ message: { chat: { id: 12345 }, text: '/start' } }, { telegram: { sendMessage: async (_, text) => sent.push(text) }, findContactByToken: async () => null, findContactByChat: async () => ({ user, contact }), saveUser: async () => {}, now: () => 10 });
  await handleTelegramUpdate({ message: { chat: { id: 12345 }, text: '/stop' } }, { telegram: { sendMessage: async (_, text) => sent.push(text) }, findContactByToken: async () => null, findContactByChat: async () => ({ user, contact }), saveUser: async () => {}, now: () => 10 });
  assert.equal(contact.telegramChatId, undefined);
  assert.match(sent[0], /Link this chat from the Bharat Safe profile/);
  assert.ok(sent.every(text => /call 112/i.test(text)));
});

test('SOS sends through each configured channel independently and retries a failure once', async () => {
  let telegramAttempts = 0, emailAttempts = 0; const sleeps = [], sentMessages = [], emails = [];
  const telegram = {
    sendMessage: async (chat, text) => { sentMessages.push({ chat, text }); if (chat === 'tg-fail' && ++telegramAttempts <= 2) throw Error('private token must not escape'); return { message_id: 50 }; },
    sendLocation: async () => ({ message_id: 51 }),
    editMessageLiveLocation: async () => ({}), stopMessageLiveLocation: async () => ({}),
  };
  const mailer = { sendMail: async message => { emails.push(message); if (message.to === 'bad@example.com' && ++emailAttempts <= 2) throw Error('smtp password must not escape'); } };
  const service = createAlertService({ telegram, mailer, publicBaseUrl: 'https://demo.example', fromAddress: 'sender@example.com', ...quiet, sleep: async ms => sleeps.push(ms), logger: (...args) => sentMessages.push(args) });
  const event = eventFor([
    { id: 'c1', name: 'Mom', email: 'bad@example.com', telegramChatId: 'tg-ok' },
    { id: 'c2', name: 'Aarav', email: 'good@example.com', telegramChatId: 'tg-fail' },
  ]);
  await service.deliverSos(event);
  assert.equal(event.deliveries[0].telegram.status, 'sent');
  assert.equal(event.deliveries[0].location.status, 'shared');
  assert.equal(event.deliveries[0].email.status, 'failed');
  assert.equal(event.deliveries[1].telegram.status, 'failed');
  assert.equal(event.deliveries[1].email.status, 'sent');
  assert.equal(telegramAttempts, 2);
  assert.equal(emailAttempts, 2);
  assert.equal(sleeps.length, 2);
  assert.equal(sleeps.every(ms => ms === 2000), true);
  assert.ok(sentMessages.some(item => item?.text?.includes('https://demo.example/sos/sos-token-private')));
  assert.ok(sentMessages.some(item => item?.text?.includes('https://maps.google.com/?q=28.54,77.2')));
  assert.ok(sentMessages.filter(item => item?.text).every(item => /call 112/i.test(item.text)));
  const safe = JSON.stringify(safeDeliveryResults(event));
  assert.equal(safe.includes('tg-ok'), false);
  assert.equal(safe.includes('tg-fail'), false);
  assert.equal(safe.includes('sos-token-private'), false);
  const logs = JSON.stringify(sentMessages.filter(Array.isArray));
  assert.equal(logs.includes('tg-ok'), false);
  assert.equal(logs.includes('private token'), false);
  assert.equal(logs.includes('smtp password'), false);
});

test('live location updates are throttled per chat and clear stops the pin and sends all-clear', async () => {
  let now = 1000; const calls = [], emails = [];
  const telegram = {
    sendMessage: async (chat, text) => { calls.push(['message', chat, text]); return { message_id: 10 }; },
    sendLocation: async (chat, lat, lng, live, accuracy) => { calls.push(['location', chat, lat, lng, live, accuracy]); return { message_id: 11 }; },
    editMessageLiveLocation: async (chat, id, lat, lng, accuracy) => calls.push(['edit', chat, id, lat, lng, accuracy]),
    stopMessageLiveLocation: async (chat, id) => calls.push(['stop', chat, id]),
  };
  const service = createAlertService({ telegram, mailer: { sendMail: async mail => emails.push(mail) }, now: () => now, ...quiet, logger: () => {} });
  const event = eventFor([{ id: 'c1', name: 'Mom', email: 'mom@example.com', telegramChatId: '4455' }]);
  await service.deliverSos(event);
  assert.deepEqual(calls[1], ['location', '4455', 28.54, 77.2, 3600, 9]);
  now += 5000; await service.updateLiveLocation(event, {lat:28.541,lng:77.201,accuracy:8,fixedAt:now});
  assert.equal(calls.filter(call => call[0] === 'edit').length, 0);
  now += 5000; await service.updateLiveLocation(event, {lat:28.542,lng:77.202,accuracy:7,fixedAt:now});
  assert.equal(calls.filter(call => call[0] === 'edit').length, 1);
  await service.clearSos(event);
  assert.equal(calls.some(call => call[0] === 'stop' && call[2] === 11), true);
  assert.ok(calls.some(call => call[0] === 'message' && /is safe\. This alert has ended/.test(call[2]) && /call 112/i.test(call[2])));
  assert.match(emails.at(-1).text, /call 112/i);
  assert.equal(event.deliveries[0].telegram.clearStatus, 'sent');
  assert.equal(event.deliveries[0].email.clearStatus, 'sent');
});

test('test alerts include a call-112 line and the per-contact interval is 60 seconds', async () => {
  const messages = [], service = createAlertService({ telegram: { sendMessage: async (_, text) => messages.push(text) }, mailer: null, ...quiet, logger: () => {} });
  const contact = { id: 'c1', name: 'Mom', telegramChatId: '9090' }, result = await service.sendTestAlert(contact, 'Riya');
  assert.equal(result.telegram.status, 'sent');
  assert.match(messages[0], /^TEST from Bharat Safe:/);
  assert.match(messages[0], /call 112/i);
  const sent = new Map(); assert.equal(testAlertRemaining(sent, 'u:c1', 1000), 0); sent.set('u:c1', 1000);
  assert.equal(testAlertRemaining(sent, 'u:c1', 60000), 1);
  assert.equal(testAlertRemaining(sent, 'u:c1', 61000), 0);
});

test('cleared SOS cooldown reports remaining seconds and active records are handled separately', () => {
  const events = [{ userId: 'u1', status: 'active', activeUntil: 90000 }];
  assert.equal(sosCreationBlock(events, 'u1', 1000), null);
  events[0] = { userId: 'u1', status: 'cleared', clearedAt: 1000 };
  assert.equal(sosCreationBlock(events, 'u1', 2000).error, 'Please wait 59 seconds before creating another SOS.');
  assert.equal(sosCreationBlock(events, 'u1', 61000), null);
});

test('an active SOS with no recorded delivery retries once unless its task is already running', () => {
  const event = { token: 'active-token', deliveries: [] }, tasks = new Map(); let attempts = 0;
  if (needsSosDeliveryRetry(event, tasks)) { attempts++; tasks.set(event.token, Promise.resolve()); }
  assert.equal(needsSosDeliveryRetry(event, tasks), false);
  tasks.clear(); event.deliveries = [{ telegram: { status: 'pending' }, email: { status: 'skipped' } }];
  assert.equal(needsSosDeliveryRetry(event, tasks), true);
  tasks.clear(); event.deliveries = [{ telegram: { status: 'sent' }, email: { status: 'skipped' } }];
  assert.equal(needsSosDeliveryRetry(event, tasks), false);
  assert.equal(attempts, 1);
});

test('Telegram methods use mocked Bot API responses and ignore harmless unchanged-location errors', async () => {
  const calls = [], token = 'mock-only-token';
  const telegram = createTelegramClient(token, async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    if (url.endsWith('/editMessageLiveLocation')) return { ok: false, description: 'Bad Request: message is not modified', json: async () => ({ ok: false, description: 'Bad Request: message is not modified' }) };
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 10 } }) };
  });
  await telegram.sendLocation('123', 28.5, 77.2, 3600, 42);
  const unchanged = await telegram.editMessageLiveLocation('123', 10, 28.5, 77.2);
  await telegram.stopMessageLiveLocation('123', 10);
  assert.equal(calls[0].body.live_period, 3600);
  assert.equal(unchanged.unchanged, true);
  assert.ok(calls.every(call => call.url.includes(token)));
});

test('expired SOS stops any recorded Telegram live location', async () => {
  const calls=[];const service=createAlertService({telegram:{stopMessageLiveLocation:async(chat,id)=>calls.push([chat,id])},...quiet,logger:()=>{}});
  await service.stopSosLocation({deliveries:[{contactId:'c1',telegram:{chatId:'private-chat',locationMessageId:22}},{contactId:'c2',telegram:{status:'skipped'}}]});
  assert.deepEqual(calls,[['private-chat',22]]);
});

test('location message text labels fresh, stale and missing coordinates',()=>{const location={lat:28.54,lng:77.2,accuracy:13,fixedAt:100000};assert.equal(formatLocationLine(location,110000),'Location: https://maps.google.com/?q=28.54,77.2 (accurate to about 13 m, updated 10 seconds ago)');assert.equal(formatLocationLine(location,190000),'Location: Last known location, 1 minute ago: https://maps.google.com/?q=28.54,77.2 (accurate to about 13 m)');assert.equal(formatLocationLine(null,190000),'Location unavailable.')});
test('a failed live pin never blocks the SOS text and delivery logs exclude coordinates',async()=>{const messages=[],logs=[];const service=createAlertService({telegram:{sendMessage:async(chat,text)=>{messages.push(text);return{message_id:1}},sendLocation:async()=>{throw Error('pin failed')}},sleep:async()=>{},logger:(...parts)=>logs.push(parts)});const event=eventFor([{id:'c1',name:'Mom',telegramChatId:'private-chat'}]);await service.deliverSos(event);assert.equal(event.deliveries[0].telegram.status,'sent');assert.equal(event.deliveries[0].telegram.locationStatus,'failed');assert.match(messages[0],/maps\.google\.com/);assert.ok(messages[0].includes('call 112'));assert.equal(JSON.stringify(logs).includes('28.54'),false);assert.equal(JSON.stringify(logs).includes('private-chat'),false)});

test('an SOS without an initial fix sends its text first and pins the first later device fix',async()=>{const calls=[];const now=()=>200000;const service=createAlertService({telegram:{sendMessage:async(_chat,text)=>{calls.push(['text',text]);return{message_id:1}},sendLocation:async(chat,lat,lng,period,accuracy)=>{calls.push(['location',chat,lat,lng,period,accuracy]);return{message_id:2}}},now,sleep:async()=>{},logger:()=>{}});const event=eventFor([{id:'c1',name:'Mom',telegramChatId:'private-chat'}]);event.positions=[];event.awaitingLocation=true;await service.deliverSos(event);assert.equal(calls[0][0],'text');assert.match(calls[0][1],/Location unavailable/);await service.updateLiveLocation(event,{lat:28.55,lng:77.21,accuracy:6,fixedAt:now()});assert.deepEqual(calls[1],['location','private-chat',28.55,77.21,3600,6]);assert.equal(event.deliveries[0].location.status,'shared')});

test('SOS email and Telegram use the provided local time instead of simulated departure time',async()=>{const texts=[],emails=[];const service=createAlertService({telegram:{sendMessage:async(_chat,text)=>{texts.push(text);return{message_id:1}}},mailer:{sendMail:async mail=>emails.push(mail)},sleep:async()=>{},logger:()=>{}});const event=eventFor([{id:'c1',name:'Mom',telegramChatId:'chat',email:'mom@example.test'}]);event.time='8:42 AM';await service.deliverSos(event);assert.ok(texts[0].includes('Time: 8:42 AM'));assert.ok(emails[0].text.includes('Time: 8:42 AM'))});

test('Telegram location calls carry live period and horizontal accuracy',async()=>{const requests=[];const telegram=createTelegramClient('test-token',async(url,options)=>{requests.push({method:url.split('/').at(-1),body:JSON.parse(options.body)});return{ok:true,json:async()=>({ok:true,result:{message_id:5}})}});await telegram.sendLocation('42',28.5,77.2,3600,17);await telegram.editMessageLiveLocation('42',5,28.51,77.21,11);assert.equal(requests[0].body.live_period,3600);assert.equal(requests[0].body.horizontal_accuracy,17);assert.equal(requests[1].body.horizontal_accuracy,11)});

test('SOS voice is sent after text and live location and its result is exposed',async()=>{const order=[];const service=createAlertService({telegram:{sendMessage:async()=>{order.push('text');return{message_id:1}},sendLocation:async()=>{order.push('location');return{message_id:2}},sendAudio:async(_chat,file,caption)=>{order.push('voice');assert.equal(basename(file),'sos_hi.mp3');assert.equal(caption,'Voice message from Bharat Safe')}},sleep:async()=>{},logger:()=>{}});const event=eventFor([{id:'c1',name:'Mom',telegramChatId:'private-chat'}]);event.voiceLanguage='hi';await service.deliverSos(event);assert.deepEqual(order,['text','location','voice']);assert.equal(event.deliveries[0].voice.sos.status,'sent');assert.equal(safeDeliveryResults(event)[0].voice.sos.status,'sent')});

test('voice send failure is recorded without undoing Telegram text or live location',async()=>{const order=[];const service=createAlertService({telegram:{sendMessage:async()=>{order.push('text');return{message_id:1}},sendLocation:async()=>{order.push('location');return{message_id:2}},sendAudio:async()=>{order.push('voice');throw Error('mock audio failure')}},sleep:async()=>{},logger:()=>{}});const event=eventFor([{id:'c1',name:'Mom',telegramChatId:'private-chat'}]);await service.deliverSos(event);assert.deepEqual(order,['text','location','voice','voice']);assert.equal(event.deliveries[0].telegram.status,'sent');assert.equal(event.deliveries[0].telegram.locationStatus,'sent');assert.equal(event.deliveries[0].voice.sos.status,'failed')});

test('all-clear and test voice clips follow their Telegram text and report per-contact results',async()=>{const order=[];const service=createAlertService({telegram:{sendMessage:async(_chat,text)=>{order.push(text.startsWith('TEST')?'test-text':'clear-text');return{message_id:1}},sendLocation:async()=>({message_id:2}),stopMessageLiveLocation:async()=>{},sendAudio:async(_chat,file)=>{order.push(file.split('/').at(-1));return{message_id:3}}},sleep:async()=>{},logger:()=>{}});const event=eventFor([{id:'c1',name:'Mom',telegramChatId:'private-chat'}]);event.voiceLanguage='hi';await service.deliverSos(event);await service.clearSos(event);assert.equal(order.at(-2),'clear-text');assert.equal(order.at(-1),'allclear_hi.mp3');assert.equal(event.deliveries[0].voice.allclear.status,'sent');const result=await service.sendTestAlert(event.contacts[0],'Riya','hi');assert.deepEqual(order.slice(-2),['test-text','test_hi.mp3']);assert.equal(result.voice.test.status,'sent')});

test('Telegram sendAudio uploads the pre-recorded MP3 with the Bharat Safe caption',async()=>{let request;const telegram=createTelegramClient('mock-token',async(url,options)=>{request={url,options};return{ok:true,json:async()=>({ok:true,result:{message_id:7}})}});const file=fileURLToPath(new URL('../public/voices/test_en.mp3',import.meta.url));const sent=await telegram.sendAudio('42',file,'Voice message from Bharat Safe');assert.equal(sent.message_id,7);assert.match(request.url,/sendAudio$/);assert.equal(request.options.body.get('chat_id'),'42');assert.equal(request.options.body.get('caption'),'Voice message from Bharat Safe');assert.equal(request.options.body.get('audio').name,'test_en.mp3');assert.equal(request.options.body.get('audio').type,'audio/mpeg')});
