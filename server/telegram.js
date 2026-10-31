import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { cleanText } from './telegramText.js';
export function createTelegramClient(token, fetchImpl = fetch) {
  const api = `${String(process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/$/, '')}/bot${token}`;
  async function call(method, data = {}, timeoutMs = 10000) {
    let response, body;
    try { response = await fetchImpl(`${api}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(timeoutMs) }); body = await response.json(); }
    catch { throw new Error('Telegram request failed'); }
    if (!response.ok || !body?.ok) { if (method === 'editMessageLiveLocation' && /message is not modified/i.test(body?.description || '')) return { message_id: data.message_id, unchanged: true }; throw new Error('Telegram request failed'); }
    return body.result;
  }
  async function sendAudio(chatId, filePath, caption) {
    let response, body;
    try {
      const form = new FormData();
      form.set('chat_id', String(chatId));
      form.set('audio', new Blob([await readFile(filePath)], { type: 'audio/mpeg' }), basename(filePath));
      form.set('caption', cleanText(caption, 1024));
      response = await fetchImpl(`${api}/sendAudio`, { method: 'POST', body: form, signal: AbortSignal.timeout(20000) });
      body = await response.json();
    } catch { throw new Error('Telegram request failed'); }
    if (!response.ok || !body?.ok) throw new Error('Telegram request failed');
    return body.result;
  }
  return { getUpdates: (offset, timeout = 25) => call('getUpdates', { offset, timeout, allowed_updates: ['message'] }, 35000), sendMessage: (chatId, text) => call('sendMessage', { chat_id: chatId, text: cleanText(text) }), sendAudio, sendLocation: (chatId, latitude, longitude, livePeriod = 3600, horizontalAccuracy) => call('sendLocation', { chat_id: chatId, latitude, longitude, live_period: livePeriod, ...(Number.isFinite(horizontalAccuracy) ? { horizontal_accuracy: horizontalAccuracy } : {}) }), editMessageLiveLocation: (chatId, messageId, latitude, longitude, horizontalAccuracy) => call('editMessageLiveLocation', { chat_id: chatId, message_id: messageId, latitude, longitude, ...(Number.isFinite(horizontalAccuracy) ? { horizontal_accuracy: horizontalAccuracy } : {}) }), stopMessageLiveLocation: (chatId, messageId) => call('stopMessageLiveLocation', { chat_id: chatId, message_id: messageId }) };
}
export function issueTelegramLink(contact, username, now = Date.now()) { const token=crypto.randomBytes(24).toString('base64url'),expiresAt=now+15*60*1000;contact.linkToken=token;contact.linkTokenExpiresAt=expiresAt;return {url:`https://t.me/${String(username).replace(/^@/,'')}?start=${token}`,expiresAt}; }
export function validTelegramLink(contact, token, now = Date.now()) { const expiry = typeof contact?.linkTokenExpiresAt === 'number' ? contact.linkTokenExpiresAt : Date.parse(contact?.linkTokenExpiresAt); return Boolean(contact && contact.linkToken === token && /^[A-Za-z0-9_-]{1,64}$/.test(token) && Number.isFinite(expiry) && expiry > now); }
export async function handleTelegramUpdate(update, { telegram, findContactByToken, findContactByChat, saveUser, now = Date.now, appName = 'Bharat Safe' }) {
  const message = update?.message, chatId = message?.chat?.id;
  if (chatId === undefined || typeof message?.text !== 'string') return false;
  const reply = text => telegram.sendMessage(String(chatId), cleanText(text));
  if (/^\/stop(?:@\w+)?(?:\s|$)/i.test(message.text.trim())) {
    const match = await findContactByChat(String(chatId));
    if (match) { delete match.contact.telegramChatId; delete match.contact.telegramLinkedAt; await saveUser(match.user); await reply('Telegram alerts are unlinked for this contact. If there is an emergency, call 112.'); }
    else await reply('No linked contact was found. For emergencies, call 112.');
    return true;
  }
  const start = message.text.trim().match(/^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{1,64}))?$/i);
  if (!start) return false;
  if (!start[1]) { await reply(`Link this chat from the ${appName} profile to receive emergency alerts. For emergencies, call 112.`); return true; }
  const match = await findContactByToken(start[1], now());
  if (!match) { await reply(`This link has expired. Ask ${appName} for a new one. In an emergency, call 112.`); return true; }
  match.contact.telegramChatId = String(chatId); match.contact.telegramLinkedAt = now(); delete match.contact.linkToken; delete match.contact.linkTokenExpiresAt;
  await saveUser(match.user);
  await reply(`You're now an emergency contact for ${cleanText(match.user.name)} on ${appName}. You'll only get a message if they trigger an SOS. In an emergency call 112.`);
  return true;
}
let pollerStarted = false;
export function startTelegramPoller({ telegram, handleUpdate, logger = status => console.info(`[delivery] channel=telegram contact=system status=${status}`) }) {
  if (!telegram || pollerStarted) return () => {};
  pollerStarted = true; let stopped = false, offset = 0, backoff = 1000; const waiters = new Set();
  const wait = ms => new Promise(resolve => { const finish=()=>{clearTimeout(timer);waiters.delete(wake);resolve()};const timer=setTimeout(finish,ms),wake=()=>finish();waiters.add(wake); });
  const run = async () => {
    while (!stopped) try { const updates = await telegram.getUpdates(offset, 25); backoff = 1000; for (const update of updates || []) { try { await handleUpdate(update); offset = Math.max(offset, Number(update.update_id) + 1); } catch { logger('failure'); } } } catch { logger('failure'); await wait(backoff); backoff = Math.min(backoff * 2, 30000); }
  };
  const running = run().finally(() => { pollerStarted = false; });
  return () => { stopped = true; for(const wake of [...waiters])wake(); return running; };
}
