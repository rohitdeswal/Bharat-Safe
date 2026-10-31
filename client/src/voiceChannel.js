export const VOICE_PRIORITY = Object.freeze({ SOS: 100, ALARM: 90, QUIET: 70, HELP: 60, WALK: 50 });
export const VOICE_LINES = Object.freeze(['alarm','sos','allclear','test','guide_start','guide_quiet','guide_help','guide_end']);
export const SAFE_RESUME_DELAY_MS = 3000;
export const scheduleSafeResume = (resume, schedule = setTimeout) => schedule(resume, SAFE_RESUME_DELAY_MS);
const guidancePriority = priority => priority <= VOICE_PRIORITY.QUIET && priority >= VOICE_PRIORITY.WALK;

export const leadDistance = (speedMetersPerSecond, durationSeconds) => Math.max(0, speedMetersPerSecond) * (Math.max(0, durationSeconds) + 1);
export const walkStepIntervalMs = (routeLengthMeters, steps, speed = 1) => steps > 0 && speed > 0 ? 75000 / steps / speed : Infinity;
export const voiceMutedAtSpeed = speed => speed > 2;
export const shouldMoveWalker = (playing, alarmStatus) => Boolean(playing) && !['countdown', 'sos_sent'].includes(alarmStatus);

export function createVoiceChannel({ audioFactory = () => new Audio(), now = Date.now, enabled = true, basePath = '/voice' } = {}) {
  const audioByLine = new Map(), blocked = new Set(), quietSpoken = new Set();
  let current = null, voiceEnabled = enabled, helpCount = 0, lastGuidanceAt = -Infinity, walkId = 0;

  const stopCurrent = () => {
    if (!current) return;
    const { audio } = current;
    current = null;
    try { audio.pause?.(); audio.currentTime = 0; } catch {}
  };
  const loadOne = (line, language) => new Promise(resolve => {
    let settled = false, timer;
    const finish = audio => { if (settled) return; settled = true; clearTimeout(timer); resolve(audio); };
    let audio;
    try { audio = audioFactory(); } catch { finish(null); return; }
    audio.preload = 'auto';
    audio.onloadedmetadata = () => finish(audio);
    audio.oncanplaythrough = () => finish(audio);
    audio.onerror = () => finish(null);
    timer = setTimeout(() => finish(null), 4000);
    try { audio.src = `${basePath}/${line}_${language}.mp3`; audio.load?.(); } catch { finish(null); }
  });
  const preload = async language => {
    const lang = language === 'hi' ? 'hi' : 'en';
    await Promise.all(VOICE_LINES.map(async line => {
      if (audioByLine.has(`${line}:${lang}`)) return;
      let audio = await loadOne(line, lang);
      if (!audio && lang === 'hi') audio = audioByLine.get(`${line}:en`) || await loadOne(line, 'en');
      if (audio) audioByLine.set(`${line}:${lang}`, audio);
    }));
    return true;
  };
  const startWalk = language => { walkId++; quietSpoken.clear(); helpCount = 0; lastGuidanceAt = -Infinity; blocked.clear(); stopCurrent(); return preload(language); };
  const setEnabled = value => { voiceEnabled = Boolean(value); if (!voiceEnabled && current && guidancePriority(current.priority)) stopCurrent(); };
  const setBlocked = (reason, value) => { if (value) { blocked.add(reason); stopCurrent(); } else blocked.delete(reason); };
  const play = (line, { priority = VOICE_PRIORITY.WALK, eventAt = now(), kind = null, key = '', language = 'en' } = {}) => {
    if (now() - eventAt > 2000 || blocked.has('sos') || (blocked.size && priority < VOICE_PRIORITY.ALARM)) return false;
    if (guidancePriority(priority)) {
      if (!voiceEnabled || blocked.size || now() - lastGuidanceAt < 6000) return false;
      if (kind === 'quiet' && quietSpoken.has(key)) return false;
      if (kind === 'help' && helpCount >= 2) return false;
      if (kind === 'quiet') quietSpoken.add(key);
      if (kind === 'help') helpCount++;
      lastGuidanceAt = now();
    }
    if (current && priority <= current.priority) return false;
    const audio = audioByLine.get(`${line}:${language}`) || (language === 'hi' ? audioByLine.get(`${line}:en`) : null);
    if (!audio) return false;
    stopCurrent();
    current = { audio, priority, line, walkId };
    audio.onended = () => { if (current?.audio === audio) current = null; };
    audio.onerror = () => { if (current?.audio === audio) current = null; };
    try { audio.currentTime = 0; const playing = audio.play?.(); playing?.catch?.(() => { if (current?.audio === audio) current = null; }); } catch { current = null; return false; }
    return true;
  };
  const stopAll = () => { stopCurrent(); blocked.clear(); };
  const clear = () => { stopAll(); audioByLine.clear(); quietSpoken.clear(); helpCount = 0; lastGuidanceAt = -Infinity; };
  return { preload, startWalk, setEnabled, setBlocked, play, stopAll, clear, duration: (line, language = 'en') => { const value = audioByLine.get(`${line}:${language}`)?.duration; return Number.isFinite(value) ? value : 0; }, isPlaying: () => Boolean(current), currentLine: () => current?.line || null };
}
