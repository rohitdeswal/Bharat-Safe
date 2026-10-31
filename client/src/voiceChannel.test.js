import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceChannel, leadDistance, shouldMoveWalker, VOICE_PRIORITY, voiceMutedAtSpeed, walkStepIntervalMs, SAFE_RESUME_DELAY_MS, scheduleSafeResume } from './voiceChannel.js';
import { initialAlarm, startAlarm, tickAlarm } from './alarmMachine.js';

class FakeAudio {
  constructor() { this.duration = 2; this.paused = true; this.currentTime = 0; this.src = ''; }
  load() { queueMicrotask(() => this.onloadedmetadata?.()); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; this.pauseCount = (this.pauseCount || 0) + 1; }
}

test('one voice channel lets higher priorities interrupt and drops lower priorities', async () => {
  const audios=[];const channel = createVoiceChannel({ audioFactory: () => { const audio=new FakeAudio();audios.push(audio);return audio; } }); await channel.preload('en');
  assert.equal(channel.play('guide_start', { priority: VOICE_PRIORITY.WALK }), true);
  const routeAudio = channel.currentLine();
  assert.equal(channel.play('alarm', { priority: VOICE_PRIORITY.ALARM }), true);
  assert.equal(channel.currentLine(), 'alarm'); assert.equal(routeAudio, 'guide_start');assert.equal(audios.find(audio=>audio.src.endsWith('guide_start_en.mp3')).pauseCount,1);
  assert.equal(channel.play('guide_help', { priority: VOICE_PRIORITY.HELP }), false);
});

test('voice drops stale lines, observes six-second spacing, quiet uniqueness, and two-help limit', async () => {
  let now = 10000; const channel = createVoiceChannel({ audioFactory: () => new FakeAudio(), now: () => now }); await channel.preload('en');
  assert.equal(channel.play('guide_start', { priority: VOICE_PRIORITY.WALK, eventAt: now }), true);
  assert.equal(channel.play('guide_quiet', { priority: VOICE_PRIORITY.QUIET, eventAt: now - 2001, kind: 'quiet', key: 'q1' }), false);
  now += 5000; assert.equal(channel.play('guide_quiet', { priority: VOICE_PRIORITY.QUIET, eventAt: now, kind: 'quiet', key: 'q1' }), false);
  now += 1000; assert.equal(channel.play('guide_quiet', { priority: VOICE_PRIORITY.QUIET, eventAt: now, kind: 'quiet', key: 'q1' }), true);
  channel.stopAll(); now += 6000; assert.equal(channel.play('guide_quiet', { priority: VOICE_PRIORITY.QUIET, eventAt: now, kind: 'quiet', key: 'q1' }), false);
  channel.stopAll(); now += 6000;
  assert.equal(channel.play('guide_help', { priority: VOICE_PRIORITY.HELP, eventAt: now, kind: 'help' }), true); channel.stopAll(); now += 6000;
  assert.equal(channel.play('guide_help', { priority: VOICE_PRIORITY.HELP, eventAt: now, kind: 'help' }), true); channel.stopAll(); now += 6000;
  assert.equal(channel.play('guide_help', { priority: VOICE_PRIORITY.HELP, eventAt: now, kind: 'help' }), false);
});

test('SOS and alarm block route voice, mute above 2x, and walker pauses for both overlays', async () => {
  const channel = createVoiceChannel({ audioFactory: () => new FakeAudio() }); await channel.preload('en');
  assert.equal(channel.play('guide_start', { priority: VOICE_PRIORITY.WALK }), true);
  channel.setBlocked('alarm', true); assert.equal(channel.currentLine(), null);
  assert.equal(channel.play('guide_quiet', { priority: VOICE_PRIORITY.QUIET }), false);
  assert.equal(channel.play('alarm', { priority: VOICE_PRIORITY.ALARM }), true);
  channel.setBlocked('sos', true); assert.equal(channel.play('alarm', { priority: VOICE_PRIORITY.ALARM }), false);
  channel.setBlocked('sos', false); channel.setBlocked('alarm', false);
  assert.equal(channel.play('guide_quiet', { priority: VOICE_PRIORITY.QUIET, eventAt: Date.now() - 3000 }), false);
  assert.equal(shouldMoveWalker(true, 'countdown'), false); assert.equal(shouldMoveWalker(true, 'sos_sent'), false); assert.equal(shouldMoveWalker(true, 'checking'), true); let resume,delay,resumed=false;const timer=scheduleSafeResume(()=>{resumed=true},(fn,ms)=>{resume=fn;delay=ms;return 9});assert.equal(timer,9);assert.equal(delay,3000);resume();assert.equal(resumed,true);
  assert.equal(voiceMutedAtSpeed(2), false); assert.equal(voiceMutedAtSpeed(4), true);
});

test('route pace is 75 seconds at 1x for every length and lead distance uses metadata duration', () => {
  for (const length of [500, 2500, 12000]) assert.equal(walkStepIntervalMs(length, 50, 1) * 50, 75000);
  assert.equal(walkStepIntervalMs(500, 50, 2) * 50, 37500);
  assert.equal(leadDistance(4, 3), 16);
});

test('Hindi clips fall back to English and unavailable English clips are skipped', async () => {
  class HindiMissing extends FakeAudio { load() { queueMicrotask(() => this.src.endsWith('_hi.mp3') ? this.onerror?.() : this.onloadedmetadata?.()); } }
  const fallback = createVoiceChannel({ audioFactory: () => new HindiMissing() }); await fallback.preload('hi');
  assert.equal(fallback.play('guide_start', { priority: VOICE_PRIORITY.WALK, language: 'hi' }), true);
  class AllMissing extends FakeAudio { load() { queueMicrotask(() => this.onerror?.()); } }
  const missing = createVoiceChannel({ audioFactory: () => new AllMissing() }); await missing.preload('en');
  assert.equal(missing.play('guide_start', { priority: VOICE_PRIORITY.WALK, language: 'en' }), false);
});

test('audio failure cannot delay the existing SOS countdown', async () => {
  class BrokenAudio extends FakeAudio { load() { queueMicrotask(() => this.onerror?.()); } }
  const channel = createVoiceChannel({ audioFactory: () => new BrokenAudio() }); await channel.preload('en');
  assert.equal(channel.play('alarm', { priority: VOICE_PRIORITY.ALARM }), false);
  const countdown = tickAlarm(startAlarm(initialAlarm(), 1000, 10), 11000, { countdownSeconds: 1 });
  assert.equal(countdown.status, 'countdown');
  assert.equal(tickAlarm(countdown, 12000).status, 'sos_sent');
});
