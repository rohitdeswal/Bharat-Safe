import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cleanText } from './telegramText.js';
import { getLocationStatus } from './sos.js';

const emergencyNote = 'For emergencies, call 112.';
const safeReason = () => 'delivery failed';
const voiceDirectory = fileURLToPath(new URL('../public/voices/', import.meta.url));
async function retryOnce(operation, sleep) { try { return await operation(); } catch { await sleep(2000); try { return await operation(); } catch { throw new Error('delivery failed'); } } }
const channel = (status, reason) => reason ? { status, reason } : { status };
function latestFix(event) { const item = event.positions?.at(-1); if (!item || !Number.isFinite(item.accuracy) || !Number.isFinite(item.fixedAt)) return null; return { lat: item.coordinates[0], lng: item.coordinates[1], accuracy: item.accuracy, fixedAt: item.fixedAt }; }
export function formatLocationLine(location, now = Date.now()) {
  if (!location) return 'Location unavailable.';
  const ageMs = Math.max(0, now - location.fixedAt), link = `https://maps.google.com/?q=${location.lat},${location.lng}`, accuracy = Math.round(location.accuracy || 0);
  if (ageMs < 60000) return `Location: ${link} (accurate to about ${accuracy} m, updated ${Math.floor(ageMs / 1000)} seconds ago)`;
  const minutes = Math.max(1, Math.floor(ageMs / 60000)); return `Location: Last known location, ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago: ${link} (accurate to about ${accuracy} m)`;
}
const safeChannel = value => ({ status: value?.status || 'pending', ...(value?.reason ? { reason: cleanText(value.reason, 80) } : {}) });
export function safeDeliveryResults(event) {
  return (event.deliveries || []).map(d => ({
    contactId: d.contactId, contactName: cleanText(d.contactName, 80),
    telegram: { ...safeChannel(d.telegram), ...(d.telegram?.locationStatus ? { locationStatus: d.telegram.locationStatus } : {}), ...(d.telegram?.clearStatus ? { clearStatus: d.telegram.clearStatus } : {}) },
    email: { ...safeChannel(d.email), ...(d.email?.clearStatus ? { clearStatus: d.email.clearStatus } : {}) },
    location: { status: d.location?.status || 'unavailable' },
    voice: { sos: safeChannel(d.voice?.sos), allclear: safeChannel(d.voice?.allclear), test: safeChannel(d.voice?.test) },
  }));
}
export function createAlertService({ telegram = null, mailer = null, publicBaseUrl = '', fromName = 'Bharat Safe', fromAddress = '', logger, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now, voicesPath = voiceDirectory } = {}) {
  const log = logger || ((c, id, status, reason = 'none') => console.info(`[delivery] channel=${c} contact=${cleanText(id, 80)} status=${status} reason=${cleanText(reason, 80)}`));
  const liveUpdateTimes = new Map(); let base = '';
  try { const candidate = String(publicBaseUrl || '').trim().replace(/\/$/, ''), parsed = new URL(candidate); if (['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password && !parsed.search && !parsed.hash) base = parsed.toString().replace(/\/$/, ''); } catch {}
  const sosText = e => cleanText(`${cleanText(e.name, 80)} did not respond to a safety check-in on Bharat Safe. Time: ${cleanText(e.time, 40)}. ${formatLocationLine(latestFix(e), now())} ${base ? `${base}/sos/${encodeURIComponent(e.token)} ` : ''}${emergencyNote}`);
  const allClearText = e => cleanText(`${cleanText(e.name, 80)} is safe. This alert has ended. ${emergencyNote}`);
  const testText = n => cleanText(`TEST from Bharat Safe: ${cleanText(n, 80)} is checking that alerts reach you. No action needed. ${emergencyNote}`);
  const emailFrom = () => fromAddress ? `"${cleanText(fromName, 80)}" <${fromAddress}>` : cleanText(fromName, 80);
  async function sendTelegram(contact, text) {
    if (!contact.telegramChatId) return { result: channel('skipped', 'not linked') };
    if (!telegram) return { result: channel('skipped', 'not configured') };
    try { const result = await retryOnce(() => telegram.sendMessage(String(contact.telegramChatId), text), sleep); return { result: { status: 'sent', chatId: String(contact.telegramChatId), messageId: result?.message_id ?? result?.messageId ?? null } }; }
    catch { return { result: channel('failed', safeReason()) }; }
  }
  async function sendEmail(contact, subject, text) {
    if (!contact.email) return channel('skipped', 'no email'); if (!mailer) return channel('skipped', 'not configured');
    try { await retryOnce(() => mailer.sendMail({ from: emailFrom(), to: cleanText(contact.email, 254), subject: cleanText(subject, 160), text }), sleep); return channel('sent'); }
    catch { return channel('failed', safeReason()); }
  }
  async function sendVoice(contact, line, language) {
    if (!contact.telegramChatId) return channel('skipped', 'not linked');
    if (!telegram?.sendAudio) return channel('skipped', 'not configured');
    const lang = language === 'hi' ? 'hi' : 'en';
    let file = `${voicesPath}/${line}_${lang}.mp3`;
    if (!existsSync(file) && lang === 'hi') file = `${voicesPath}/${line}_en.mp3`;
    if (!existsSync(file)) return channel('skipped', 'voice file unavailable');
    try { await retryOnce(() => telegram.sendAudio(String(contact.telegramChatId), file, 'Voice message from Bharat Safe'), sleep); return channel('sent'); }
    catch { return channel('failed', safeReason()); }
  }
  async function postInitialLocation(contact, delivery, location) {
    if (!location || delivery.telegram.status !== 'sent' || !delivery.telegram.messageId || !telegram) return false;
    try { const result = await retryOnce(() => telegram.sendLocation(String(contact.telegramChatId), location.lat, location.lng, 3600, location.accuracy), sleep); delivery.telegram.locationMessageId = result?.message_id ?? result?.messageId ?? null; delivery.telegram.locationStatus = delivery.telegram.locationMessageId ? 'sent' : 'failed'; if (delivery.telegram.locationMessageId) { delivery.telegram.lastLocationSentAt = now(); liveUpdateTimes.set(String(contact.telegramChatId), now()); } return Boolean(delivery.telegram.locationMessageId); }
    catch { delivery.telegram.locationStatus = 'failed'; return false; }
  }
  async function deliverSos(event) {
    const text = sosText(event); event.locationStatus = event.positions?.length ? getLocationStatus(event.positions, now()) : 'unavailable'; const location = latestFix(event);
    event.deliveries = await Promise.all((event.contacts || []).map(async contact => {
      const [tg, email] = await Promise.all([sendTelegram(contact, text), sendEmail(contact, `Safety alert from ${cleanText(event.name, 80)} (Bharat Safe)`, text)]);
      const pending = !contact.telegramChatId ? channel('skipped', 'not linked') : !telegram ? channel('skipped', 'not configured') : channel('pending');
      const note = location ? (tg.result.status === 'sent' || email.status === 'sent' ? 'pending' : 'unavailable') : (tg.result.status === 'sent' && event.awaitingLocation ? 'pending' : 'unavailable');
      return { contactId: contact.id, contactName: cleanText(contact.name, 80), telegram: tg.result, email, location: { status: note }, voice: { sos: pending, allclear: channel('pending'), test: channel('pending') } };
    }));
    await Promise.all(event.deliveries.map(async delivery => {
      const contact = (event.contacts || []).find(c => c.id === delivery.contactId) || {};
      if (location) { await postInitialLocation(contact, delivery, location); delivery.location.status = delivery.telegram.status === 'sent' || delivery.email.status === 'sent' ? 'shared' : 'unavailable'; }
      if (delivery.telegram.status === 'sent') delivery.voice.sos = await sendVoice(contact, 'sos', event.voiceLanguage);
      log('telegram', delivery.contactId, delivery.telegram.status, delivery.telegram.reason || (delivery.telegram.locationStatus === 'failed' ? 'location delivery failed' : 'none'));
      log('email', delivery.contactId, delivery.email.status, delivery.email.reason || 'none');
      log('voice', delivery.contactId, delivery.voice.sos.status, delivery.voice.sos.reason || 'none');
    }));
    return event.deliveries;
  }
  async function updateLiveLocation(event, location) {
    if (!location || !telegram) return; const timestamp = now();
    await Promise.all((event.deliveries || []).filter(d => d.telegram?.status === 'sent').map(async d => {
      const contact = (event.contacts || []).find(c => c.id === d.contactId); if (!contact?.telegramChatId) return;
      const chat = String(contact.telegramChatId), last = liveUpdateTimes.get(chat) || d.telegram.lastLocationSentAt || 0; if (d.telegram.locationMessageId && timestamp - last < 10000) return;
      try { let result; if (d.telegram.locationMessageId) result = await retryOnce(() => telegram.editMessageLiveLocation(chat, d.telegram.locationMessageId, location.lat, location.lng, location.accuracy), sleep); else result = await retryOnce(() => telegram.sendLocation(chat, location.lat, location.lng, 3600, location.accuracy), sleep); if (!d.telegram.locationMessageId) d.telegram.locationMessageId = result?.message_id ?? result?.messageId ?? null; d.telegram.locationStatus = d.telegram.locationMessageId ? 'sent' : 'failed'; d.telegram.lastLocationSentAt = timestamp; liveUpdateTimes.set(chat, timestamp); d.location = { status: d.telegram.locationMessageId ? 'shared' : 'unavailable' }; }
      catch { d.telegram.locationStatus = 'failed'; d.location = { status: 'unavailable' }; }
    })); event.locationStatus = getLocationStatus(event.positions, now());
  }
  async function stopPins(event) {
    if (!telegram) return;
    await Promise.all((event.deliveries || []).filter(d => d.telegram?.locationMessageId).map(async d => { const contact = (event.contacts || []).find(c => c.id === d.contactId), chatId = contact?.telegramChatId || d.telegram.chatId; if (!chatId) return; try { await retryOnce(() => telegram.stopMessageLiveLocation(String(chatId), d.telegram.locationMessageId), sleep); } catch { log('telegram', d.contactId, 'failed', 'could not stop live location'); } }));
  }
  async function clearSos(event) {
    await stopPins(event);
    await Promise.all((event.deliveries || []).map(async d => {
      const contact = (event.contacts || []).find(c => c.id === d.contactId) || {};
      if (contact.telegramChatId && telegram) {
        try { await retryOnce(() => telegram.sendMessage(String(contact.telegramChatId), allClearText(event)), sleep); d.telegram.clearStatus = 'sent'; log('telegram', d.contactId, 'sent', 'none'); d.voice ||= {}; d.voice.allclear = await sendVoice(contact, 'allclear', event.voiceLanguage); log('voice', d.contactId, d.voice.allclear.status, d.voice.allclear.reason || 'none'); }
        catch { d.telegram.clearStatus = 'failed'; d.voice ||= {}; d.voice.allclear = channel('failed', safeReason()); log('telegram', d.contactId, 'failed', safeReason()); }
      }
      if (contact.email && mailer) { try { await retryOnce(() => mailer.sendMail({ from: emailFrom(), to: cleanText(contact.email, 254), subject: `Safety alert cleared for ${cleanText(event.name, 80)} (Bharat Safe)`, text: allClearText(event) }), sleep); d.email.clearStatus = 'sent'; log('email', d.contactId, 'sent', 'none'); } catch { d.email.clearStatus = 'failed'; log('email', d.contactId, 'failed', safeReason()); } }
    }));
    return safeDeliveryResults(event);
  }
  async function sendTestAlert(contact, userName, language = 'en') {
    const text = testText(userName); let tg = channel('skipped', contact.telegramChatId ? 'not configured' : 'not linked'), voice = channel('skipped', contact.telegramChatId ? 'not configured' : 'not linked');
    const emailPromise = sendEmail(contact, `TEST alert for ${cleanText(userName, 80)} (Bharat Safe)`, text);
    if (contact.telegramChatId && telegram) { try { await retryOnce(() => telegram.sendMessage(String(contact.telegramChatId), text), sleep); tg = channel('sent'); log('telegram', contact.id, 'sent', 'none'); voice = await sendVoice(contact, 'test', language); log('voice', contact.id, voice.status, voice.reason || 'none'); } catch { tg = channel('failed', safeReason()); voice = channel('skipped', 'text not sent'); log('telegram', contact.id, 'failed', safeReason()); } }
    const email = await emailPromise; log('email', contact.id, email.status, email.reason || 'none'); return { contactName: cleanText(contact.name, 80), telegram: tg, email, voice: { test: voice } };
  }
  return { deliverSos, updateLiveLocation, clearSos, stopSosLocation: stopPins, sendTestAlert };
}
