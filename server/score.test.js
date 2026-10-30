import test from 'node:test';import assert from 'node:assert/strict';import {scoreRoute} from './score.js';
test('scores seeded open places and emits route segments',()=>{const result=scoreRoute([[77.2,28.6],[77.21,28.61]],[], '22:00');assert.ok(result.score>=0&&result.score<=100);assert.ok(result.segments.features.length>0)});
test('guards empty and single point routes',()=>{assert.equal(scoreRoute([],[]).score,0);assert.equal(scoreRoute([[77,28]],[]).score,0)});
test('guards a zero-length route',()=>{assert.equal(scoreRoute([[28,77],[28,77]],[]).score,0)});
test('quiet distance is measurable on a route without places',()=>{const result=scoreRoute([[77.2,28.6],[77.21,28.61]],[]);assert.ok(result.longestQuietM>0)});
