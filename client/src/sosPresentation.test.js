import test from 'node:test';
import assert from 'node:assert/strict';
import { getSosPresentation } from './sosPresentation.js';

test('SOS failures show a reason and retry without claiming an alert exists or rendering an empty delivery list', () => {
  const view = getSosPresentation('failed', 'The server is unavailable', []);
  assert.equal(view.title, 'SOS could not be sent');
  assert.equal(view.reason, 'The server is unavailable');
  assert.equal(view.showRetry, true);
  assert.equal(view.showDeliveryList, false);
  assert.equal(view.noSosExists, false);
});

test('an active SOS error offers clear previous alert and retry', () => {
  const view = getSosPresentation('failed', 'An SOS is already active', []);
  assert.equal(view.title, 'SOS could not be sent');
  assert.equal(view.showClearPrevious, true);
  assert.equal(view.noSosExists, false);
});

test('explicit no-active-SOS responses are shown as no SOS exists', () => {
  const view=getSosPresentation('failed','No active SOS exists.',[]);
  assert.equal(view.noSosExists,true);
  assert.equal(view.showClearPrevious,false);
});
