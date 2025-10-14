import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandsFreeState } from '../public/handsFreeState.mjs';

test('hands-free alternates between available targets', () => {
  const state = createHandsFreeState({ health: { anthropic: true, openai: true }, nextAutoTarget: 'claude' });

  assert.equal(state.chooseNextTarget(), 'claude');
  assert.equal(state.chooseNextTarget(), 'guest');
  assert.equal(state.chooseNextTarget(), 'claude');
});

test('hands-free respects missing providers', () => {
  const state = createHandsFreeState();
  state.setHealth({ anthropic: true, openai: false });
  assert.deepEqual(state.getAvailableTargets(), ['claude']);
  assert.equal(state.chooseNextTarget(), 'claude');
  assert.equal(state.chooseNextTarget(), 'claude');
});

test('hands-free recalibrates when health changes mid-session', () => {
  const state = createHandsFreeState();
  state.setHealth({ anthropic: true, openai: true });
  assert.equal(state.chooseNextTarget(), 'claude');
  state.setHealth({ anthropic: false });
  assert.equal(state.chooseNextTarget(), 'guest');
  state.setHealth({ openai: false });
  assert.equal(state.chooseNextTarget(), null);
});
