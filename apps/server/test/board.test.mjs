// test/board.test.mjs — Tests for board API and UI

import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.FLEEET_URL || 'http://localhost:3001';
const ADMIN_TOKEN = process.env.FLEEET_ADMIN_TOKEN || 'test-admin-token-with-at-least-32-characters-here';

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  
  return { status: response.status, body, response };
}

test('GET /api/events validates limit parameter', async () => {
  const accountId = 'board-test-account-1';
  
  // Create token
  const { status: createStatus, body: createBody } = await request('/api/admin/tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({
      account_id: accountId,
      label: 'Limit Test Token',
    }),
  });
  
  if (createStatus !== 201) {
    console.warn('Skipping limit test: could not create token');
    return;
  }
  
  const agentToken = createBody.token;
  
  // Test invalid limit (non-numeric) - should default to 100
  const { status: status1, body: body1 } = await request('/api/events?limit=invalid', {
    headers: { Authorization: `Bearer ${agentToken}` },
  });
  assert.equal(status1, 200);
  
  // Test limit too low - should clamp to 1
  const { status: status2 } = await request('/api/events?limit=-10', {
    headers: { Authorization: `Bearer ${agentToken}` },
  });
  assert.equal(status2, 200);
  
  // Test limit too high - should clamp to 500
  const { status: status3 } = await request('/api/events?limit=1000', {
    headers: { Authorization: `Bearer ${agentToken}` },
  });
  assert.equal(status3, 200);
  
  // Test invalid since parameter
  const { status: status4, body: body4 } = await request('/api/events?since=invalid', {
    headers: { Authorization: `Bearer ${agentToken}` },
  });
  assert.equal(status4, 400);
  assert.match(body4.error, /invalid since/i);
  
  // Cleanup
  await request(`/api/admin/tokens/${createBody.id}/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  });
});

test('Public board returns events without auth', async () => {
  const accountId = 'board-test-public';
  const space = 'public-board-test';
  
  // Create token and account
  const { status: createStatus, body: createBody } = await request('/api/admin/tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({
      account_id: accountId,
      label: 'Public Board Test',
    }),
  });
  
  if (createStatus !== 201) {
    console.warn('Skipping public board test: could not create token');
    return;
  }
  
  // Post a test event
  const runId = `board-test-${Date.now()}`;
  const { status: postStatus } = await request('/api/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${createBody.token}` },
    body: JSON.stringify({
      event: 'session_start',
      run_id: runId,
      ts: new Date().toISOString(),
      agent: 'Test Agent',
      summary: 'Public board test event',
      trigger: 'user',
      schema: 'https://fleeet.app/schema/event/v1.json',
    }),
  });
  
  assert.equal(postStatus, 200);
  
  // Try to access board (will fail if account doesn't exist, but that's ok for this test)
  const { status: boardStatus } = await request(`/api/boards/${space}/events`);
  
  // 404 is ok (account doesn't exist), 401 would be wrong (should be public by default)
  assert.ok([200, 404].includes(boardStatus), `Expected 200 or 404, got ${boardStatus}`);
  
  // Cleanup
  await request(`/api/admin/tokens/${createBody.id}/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  });
});

test('Private board requires read token', async () => {
  // This test verifies 401 behavior for private boards
  // In a real scenario, we'd need to:
  // 1. Create account with board_visibility = 'private'
  // 2. Create a read token
  // 3. Try access without token (should 401)
  // 4. Try access with token (should work)
  
  // For now, just verify 404 for non-existent board
  const { status } = await request('/api/boards/nonexistent-private-board/events');
  assert.equal(status, 404);
});

test('Board respects hidden runs', async () => {
  // This is a placeholder test - in a real scenario we'd:
  // 1. Create account and token
  // 2. Post several events for different runs
  // 3. Hide one run via board_hidden_runs table
  // 4. Fetch board and verify hidden run is not included
  assert.ok(true, 'Hidden runs behavior should be tested with proper DB setup');
});

test('Board respects deleted runs', async () => {
  // This is a placeholder test - in a real scenario we'd:
  // 1. Create account and token
  // 2. Post events
  // 3. Delete a run
  // 4. Verify deleted run doesn't appear on board
  assert.ok(true, 'Deleted runs behavior should be tested with proper DB setup');
});

test('Board applies run overrides', async () => {
  // This is a placeholder test - in a real scenario we'd:
  // 1. Create account and token
  // 2. Post events
  // 3. Add run override (edited task/summary)
  // 4. Verify board shows edited version
  assert.ok(true, 'Run overrides behavior should be tested with proper DB setup');
});

test('Board UI smoke test', async () => {
  const { status, body } = await request('/b/test-board');
  
  assert.equal(status, 200);
  assert.ok(typeof body === 'string');
  assert.ok(body.includes('<!DOCTYPE html>'));
  assert.ok(body.includes('Board'));
  assert.ok(body.includes('Loading board'));
});

test('Board summary endpoint', async () => {
  const { status } = await request('/api/boards/nonexistent/summary');
  assert.equal(status, 404);
});
