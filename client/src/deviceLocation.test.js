import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeviceLocation, isSecureLocationContext, locationOptions, shouldSendLocationUpdate, createSosLocationPayload, formatLocalSosTime } from './deviceLocation.js';

function mockGeo() {
  let success, failure, cleared = [];
  return { api: { watchPosition(ok, bad, options) { success=ok;failure=bad;assert.deepEqual(options,locationOptions);return 7 }, clearWatch(id) { cleared.push(id) } },
    fix({lat=28.5,lng=77.2,accuracy=12,fixedAt=1000}={}) { success({coords:{latitude:lat,longitude:lng,accuracy},timestamp:fixedAt}) },
    fail(code) { failure({code}) }, cleared };
}

test('granted permission keeps the latest valid fix in memory without making any request', () => {
  const geo=mockGeo(), states=[], sent=[];const tracker=createDeviceLocation({geolocation:geo.api,secure:true,now:()=>2000,onChange:v=>states.push(v)});
  assert.equal(tracker.start(),true);assert.equal(states.at(-1).status,'requesting');geo.fix({fixedAt:1000});
  assert.deepEqual(tracker.latest(),{lat:28.5,lng:77.2,accuracy:12,fixedAt:1000});assert.equal(states.at(-1).status,'ready');assert.deepEqual(sent,[]);
  tracker.stop();assert.deepEqual(geo.cleared,[7]);assert.equal(tracker.latest(),null);
});

test('waits for the first GPS fix and formats the SOS time in the user time zone',async()=>{const geo=mockGeo(),tracker=createDeviceLocation({geolocation:geo.api,secure:true});tracker.start();const waiting=tracker.waitForFix(5000);geo.fix({fixedAt:Date.now()});assert.equal((await waiting).lat,28.5);assert.equal(formatLocalSosTime(Date.parse('2026-10-30T03:12:00Z'),'Asia/Kolkata'),'8:42 AM')});
test('first-fix wait ends after its timeout when the GPS has no fix',async()=>{const geo=mockGeo(),tracker=createDeviceLocation({geolocation:geo.api,secure:true});tracker.start();assert.equal(await tracker.waitForFix(1),null)});

test('denied permission and unavailable geolocation have distinct status',()=>{const geo=mockGeo(),tracker=createDeviceLocation({geolocation:geo.api,secure:true});tracker.start();geo.fail(1);assert.equal(tracker.snapshot().status,'denied');const missing=createDeviceLocation({secure:true});missing.start();assert.equal(missing.snapshot().status,'unavailable')});
test('an insecure non-local origin cannot request real location',()=>{let calls=0;const tracker=createDeviceLocation({geolocation:{watchPosition(){calls++}},secure:false,hostname:'example.test',protocol:'http:'});tracker.start();assert.equal(calls,0);assert.equal(tracker.snapshot().status,'unavailable');assert.match(tracker.snapshot().error,/secure link/);assert.equal(isSecureLocationContext({hostname:'localhost',protocol:'http:'}),true)});
test('a fix becomes stale after 60 seconds',()=>{let now=61001;const geo=mockGeo(),tracker=createDeviceLocation({geolocation:geo.api,secure:true,now:()=>now});tracker.start();geo.fix({fixedAt:1000});assert.equal(tracker.snapshot().status,'stale')});
test('position updates are immediate, then movement-throttled to ten seconds with a 30-second heartbeat',()=>{const previous={lat:1,lng:2,accuracy:5,fixedAt:1},next={lat:1.1,lng:2,accuracy:5,fixedAt:2000};assert.equal(shouldSendLocationUpdate(null,next,NaN,2000),true);assert.equal(shouldSendLocationUpdate(previous,next,10000,19999),false);assert.equal(shouldSendLocationUpdate(previous,next,10000,20000),true);assert.equal(shouldSendLocationUpdate(previous,previous,10000,40000),true)});

test('SOS payload uses only a real device fix and never the simulated walker position',()=>{const location={lat:28.5,lng:77.2,accuracy:8,fixedAt:1234};assert.deepEqual(createSosLocationPayload({journeyId:'walk',routeIndex:1,time:'22:00',sosTime:'8:42 AM',location,position:[29,78]}),{journeyId:'walk',routeIndex:1,time:'22:00',sosTime:'8:42 AM',location});const pending=createSosLocationPayload({journeyId:'walk',routeIndex:0,time:'22:00',location:null,locationStatus:'pending',position:[29,78]});assert.deepEqual(pending,{journeyId:'walk',routeIndex:0,time:'22:00',locationStatus:'pending'});assert.equal('position'in pending,false)});
