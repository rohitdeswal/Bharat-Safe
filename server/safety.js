export function sosCreationBlock(events, userId, now = Date.now()) {
  let cooldownUntil = 0;
  for (const event of events) {
    if (event.userId !== userId) continue;
    if (event.status !== 'cleared') continue;
    const endedAt = Number(event.clearedAt);
    if (Number.isFinite(endedAt)) cooldownUntil = Math.max(cooldownUntil, endedAt + 60000);
  }
  if (cooldownUntil > now) return { status: 429, error: `Please wait ${Math.ceil((cooldownUntil - now) / 1000)} seconds before creating another SOS.` };
  return null;
}
export function testAlertRemaining(lastSent, key, now = Date.now()) { const sentAt = lastSent.get(key); return sentAt === undefined || now - sentAt >= 60000 ? 0 : Math.ceil((60000 - (now - sentAt)) / 1000); }

export function needsSosDeliveryRetry(event, activeTasks) {
  if (activeTasks?.has(event?.token)) return false;
  const deliveries = event?.deliveries;
  if (!Array.isArray(deliveries) || deliveries.length === 0) return true;
  return !deliveries.some(delivery => {
    const statuses = [delivery.telegram?.status, delivery.email?.status];
    return statuses.some(status => status === 'sent' || status === 'failed') || statuses.every(status => status === 'skipped');
  });
}
