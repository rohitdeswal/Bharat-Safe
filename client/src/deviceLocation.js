export const locationOptions = Object.freeze({ enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });

export function isSecureLocationContext({ isSecureContext = false, protocol = '', hostname = '' } = {}) {
  return Boolean(isSecureContext || protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(hostname));
}

export function validDeviceFix(value) {
  return Boolean(value && Number.isFinite(value.lat) && value.lat >= -90 && value.lat <= 90 &&
    Number.isFinite(value.lng) && value.lng >= -180 && value.lng <= 180 &&
    Number.isFinite(value.accuracy) && value.accuracy >= 0 && value.accuracy <= 100000 &&
    Number.isFinite(value.fixedAt));
}

export function formatLocalSosTime(now = Date.now(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(now));
}

export function createDeviceLocation({ geolocation, secure = true, hostname = '', protocol = '', now = Date.now, onChange = () => {} } = {}) {
  let watchId = null;
  let latest = null;
  let status = 'idle';
  let error = '';
  const waiters = new Set();
  const settleWaiters = value => { for (const finish of [...waiters]) finish(value); };
  const secureContext = secure || isSecureLocationContext({ hostname, protocol });
  const snapshot = () => {
    const currentStatus = latest && now() - latest.fixedAt >= 60000 ? 'stale' : status;
    return { status: currentStatus, latest: latest ? { ...latest } : null, error, secure: secureContext };
  };
  const publish = () => onChange(snapshot());
  const stop = ({ clear = true } = {}) => {
    if (watchId !== null) geolocation?.clearWatch?.(watchId);
    watchId = null;
    if (clear) latest = null;
    status = 'idle';
    error = '';
    settleWaiters(null);
    publish();
  };
  const start = () => {
    if (!secureContext) {
      status = 'unavailable';
      error = 'Real location needs a secure link (https)';
      publish();
      return false;
    }
    if (!geolocation?.watchPosition) {
      status = 'unavailable';
      error = 'Location is unavailable in this browser.';
      publish();
      return false;
    }
    if (watchId !== null) return true;
    status = 'requesting';
    error = '';
    publish();
    try {
      watchId = geolocation.watchPosition(position => {
        const coords = position?.coords || {};
        const fix = { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy, fixedAt: Number.isFinite(position.timestamp) ? position.timestamp : now() };
        if (!validDeviceFix(fix)) {
          status = 'unavailable';
          error = 'Location is unavailable.';
        } else {
          latest = fix;
          status = 'ready';
          error = '';
          settleWaiters({ ...latest });
        }
        publish();
      }, failure => {
        if (failure?.code === 1) {
          status = 'denied';
          error = 'Location permission was denied.';
          settleWaiters(null);
          if (watchId !== null) geolocation.clearWatch?.(watchId);
          watchId = null;
        } else {
          status = 'unavailable';
          error = 'Location is unavailable.';
          settleWaiters(null);
        }
        publish();
      }, locationOptions);
      return true;
    } catch {
      status = 'unavailable';
      error = 'Location is unavailable.';
      settleWaiters(null);
      publish();
      return false;
    }
  };
  const waitForFix = (timeoutMs = 5000) => {
    if (validDeviceFix(latest)) return Promise.resolve({ ...latest });
    if (status !== 'requesting') return Promise.resolve(null);
    return new Promise(resolve => {
      let timer;
      const finish = value => { clearTimeout(timer); waiters.delete(finish); resolve(value); };
      waiters.add(finish);
      timer = setTimeout(() => finish(null), timeoutMs);
    });
  };
  return { start, stop, snapshot, latest: () => latest ? { ...latest } : null, waitForFix };
}

export function shouldSendLocationUpdate(previous, next, lastSentAt, now = Date.now()) {
  if (!validDeviceFix(next)) return false;
  if (!previous || !Number.isFinite(lastSentAt)) return true;
  const elapsed = now - lastSentAt;
  if (elapsed >= 30000) return true;
  const changed = previous.lat !== next.lat || previous.lng !== next.lng || previous.accuracy !== next.accuracy;
  return changed && elapsed >= 10000;
}

export function createSosLocationPayload({ journeyId, routeIndex, time, sosTime, location, locationStatus = 'unavailable' }) {
  const payload={journeyId,routeIndex,time};
  if(typeof sosTime==='string')payload.sosTime=sosTime;
  if(validDeviceFix(location))payload.location={lat:location.lat,lng:location.lng,accuracy:location.accuracy,fixedAt:location.fixedAt};
  else payload.locationStatus=locationStatus==='pending'?'pending':'unavailable';
  return payload;
}
