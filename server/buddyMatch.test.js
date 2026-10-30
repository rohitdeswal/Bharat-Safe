import test from 'node:test';import assert from 'node:assert/strict';import {matchQuietStretch,withinWindow} from './buddyMatch.js';
const route=Array.from({length:60},(_,i)=>[28.6+i*.0001,77.2]);
test('buddy time window allows plus or minus fifteen minutes only',()=>{assert.equal(withinWindow(15),true);assert.equal(withinWindow(-15),true);assert.equal(withinWindow(16),false)});
test('returns only overlapping section and requires an open meeting place',()=>{const places=[{name:'Cafe',category:'food',at:100,open:true}];const match=matchQuietStretch(route,route,300,900,5,places);assert.ok(match);assert.ok(match.overlapM>=200);assert.ok(match.overlap.coordinates.length<route.length)});
test('rejects short quiet stretch and missing open public meeting place',()=>{assert.equal(matchQuietStretch(route,route,10,100,0,[]),null);assert.equal(matchQuietStretch(route,route,300,900,0,[{at:100,open:false,category:'food'}]),null)});
