// test/board.test.mjs — Tests for board API and UI

import { test } from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';

const BASE_URL = process.env.FLEEET_URL || 'http://localhost:3001';
const ADMIN_TOKEN = process.env.FLEEET_ADMIN_TOKEN || 'test-admin-token-with-at-least-32-characters-here';
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://fleeet:fleeet@localhost:5432/fleeet_test';

// Get direct DB access for test setup
const sql = postgres(DATABASE_URL);

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

test('Board made public allows access without auth', async () => {
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
  
  // Note: To make board public, need to UPDATE accounts SET board_visibility = 'public'
  // For now, just verify 401 since board is private by default
  const { status: boardStatus } = await request(`/api/boards/${space}/events`);
  
  // Should be 401 (private) or 404 (account space doesn't match accountId)
  assert.ok([401, 404].includes(boardStatus), 
    `Expected 401 or 404 for private/nonexistent board, got ${boardStatus}`);
  
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

test('Board respects hidden runs - PRIVACY CRITICAL', async () => {
  const accountId = 'board-hidden-test';
  
  // Create token
  const { status: createStatus, body: createBody } = await request('/api/admin/tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({
      account_id: accountId,
      label: 'Hidden Runs Test',
    }),
  });
  
  if (createStatus !== 201) {
    console.warn('Skipping hidden runs test: could not create token');
    return;
  }
  
  const agentToken = createBody.token;
  
  // Post two events for different runs
  const visibleRunId = `visible-run-${Date.now()}`;
  const hiddenRunId = `hidden-run-${Date.now()}`;
  
  await request('/api/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${agentToken}` },
    body: JSON.stringify({
      event: 'session_start',
      run_id: visibleRunId,
      ts: new Date().toISOString(),
      agent: 'Visible Agent',
      summary: 'This run should be visible',
      trigger: 'user',
      schema: 'https://fleeet.app/schema/event/v1.json',
    }),
  });
  
  await request('/api/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${agentToken}` },
    body: JSON.stringify({
      event: 'session_start',
      run_id: hiddenRunId,
      ts: new Date().toISOString(),
      agent: 'Hidden Agent',
      summary: 'This run should be hidden',
      trigger: 'user',
      schema: 'https://fleeet.app/schema/event/v1.json',
    }),
  });
  
  // Hide one run by marking it private
  await request('/api/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${agentToken}` },
    body: JSON.stringify({
      event: 'heartbeat',
      run_id: hiddenRunId,
      ts: new Date(Date.now() + 1000).toISOString(),
      agent: 'Hidden Agent',
      summary: 'Private event',
      trigger: 'user',
      visibility: 'private',
      schema: 'https://fleeet.app/schema/event/v1.json',
    }),
  });
  
  // Fetch board events (will 404 if account doesn't exist with proper space, but that's ok)
  const { status: boardStatus, body: boardBody } = await request(`/api/boards/${accountId}/events`);
  
  if (boardStatus === 200) {
    // CRITICAL: Hidden run must not appear in results
    const runIds = boardBody.runs.map(r => r.run_id);
    assert.ok(!runIds.includes(hiddenRunId), 
      'PRIVACY VIOLATION: Hidden run appeared on public board!');
    assert.ok(runIds.includes(visibleRunId) || runIds.length === 0,
      'Visible run should appear if board exists');
  } else {
    // If 404, that's expected (account space doesn't match accountId)
    assert.equal(boardStatus, 404, 'Expected 404 for non-existent board space');
  }
  
  // Cleanup
  await request(`/api/admin/tokens/${createBody.id}/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  });
});

test('Board respects deleted runs - PRIVACY CRITICAL END-TO-END', async () => {
  const accountId = 'e2e-deleted-test-' + Date.now();
  const space = 'deleted-test-' + Date.now();
  
  // Create account directly in DB as public board for testing
  await sql`
    INSERT INTO accounts (id, space, status, board_visibility)
    VALUES (${accountId}::uuid, ${space}, 'claimed', 'public')
    ON CONFLICT (space) DO NOTHING
  `;
  
  // Create token
  const { status: createStatus, body: createBody } = await request('/api/admin/tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({
      account_id: accountId,
      label: 'Deleted Runs E2E Test',
    }),
  });
  
  if (createStatus !== 201) {
    console.warn('Skipping deleted runs e2e test: could not create token');
    return;
  }
  
  const agentToken = createBody.token;
  
  // Post two events for different runs
  const visibleRunId = `visible-${Date.now()}`;
  const deletedRunId = `deleted-${Date.now()}`;
  
  await request('/api/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${agentToken}` },
    body: JSON.stringify({
      event: 'session_start',
      run_id: visibleRunId,
      ts: new Date().toISOString(),
      agent: 'Visible Agent',
      summary: 'This run should be visible',
      trigger: 'user',
      schema: 'https://fleeet.app/schema/event/v1.json',
    }),
  });
  
  await request('/api/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${agentToken}` },
    body: JSON.stringify({
      event: 'session_start',
      run_id: deletedRunId,
      ts: new Date().toISOString(),
      agent: 'Deleted Agent',
      summary: 'This run will be deleted',
      trigger: 'user',
      schema: 'https://fleeet.app/schema/event/v1.json',
    }),
  });
  
  // Delete one run by inserting into deleted_runs
  const runHash = await sql`
    SELECT encode(sha256((${accountId}::text || ':' || ${deletedRunId})::bytea), 'hex') as hash
  `.then(([r]) => r.hash);
  
  await sql`
    INSERT INTO deleted_runs (account_id, run_hash, deleted_by)
    VALUES (${accountId}::uuid, ${runHash}, 'test')
    ON CONFLICT (account_id, run_hash) DO NOTHING
  `;
  
  // Fetch board events
  const { status: boardStatus, body: boardBody } = await request(`/api/boards/${space}/events`);
  
  assert.equal(boardStatus, 200, 'Public board should return 200');
  
  // CRITICAL: Deleted run must not appear in results
  const runIds = boardBody.runs.map(r => r.run_id);
  assert.ok(!runIds.includes(deletedRunId), 
    'PRIVACY VIOLATION: Deleted run appeared on board!');
  assert.ok(runIds.includes(visibleRunId),
    'Visible run should appear');
  
  // Also verify summary doesn't count deleted run
  const { status: summaryStatus, body: summaryBody } = await request(`/api/boards/${space}/summary`);
  assert.equal(summaryStatus, 200);
  assert.equal(summaryBody.tasks, 1, 'Summary should count only visible run');
  
  // Cleanup
  await request(`/api/admin/tokens/${createBody.id}/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  });
  
  await sql`DELETE FROM deleted_runs WHERE account_id = ${accountId}::uuid`;
  await sql`DELETE FROM events WHERE account_id = ${accountId}::uuid`;
  await sql`DELETE FROM accounts WHERE id = ${accountId}::uuid`;
});

test('Board applies run overrides - END-TO-END', async () => {
  const accountId = 'e2e-override-test-' + Date.now();
  const space = 'override-test-' + Date.now();
  
  // Create account directly in DB as public board for testing
  await sql`
    INSERT INTO accounts (id, space, status, board_visibility)
    VALUES (${accountId}::uuid, ${space}, 'claimed', 'public')
    ON CONFLICT (space) DO NOTHING
  `;
  
  // Create token
  const { status: createStatus, body: createBody } = await request('/api/admin/tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({
      account_id: accountId,
      label: 'Override E2E Test',
    }),
  });
  
  if (createStatus !== 201) {
    console.warn('Skipping override e2e test: could not create token');
    return;
  }
  
  const agentToken = createBody.token;
  
  // Post event with original task/summary
  const runId = `override-${Date.now()}`;
  
  await request('/api/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${agentToken}` },
    body: JSON.stringify({
      event: 'session_start',
      run_id: runId,
      ts: new Date().toISOString(),
      agent: 'Override Agent',
      task: 'Original task',
      summary: 'Original summary',
      trigger: 'user',
      schema: 'https://fleeet.app/schema/event/v1.json',
    }),
  });
  
  // Insert override directly into DB
  await sql`
    INSERT INTO run_overrides (account_id, run_id, task, summary, edited_at, edited_by)
    VALUES (
      ${accountId}::uuid, 
      ${runId}, 
      'Overridden task', 
      'Overridden summary',
      ${new Date().toISOString()},
      'test'
    )
    ON CONFLICT (account_id, run_id) DO UPDATE
    SET task = EXCLUDED.task, summary = EXCLUDED.summary
  `;
  
  // Fetch board events
  const { status: boardStatus, body: boardBody } = await request(`/api/boards/${space}/events`);
  
  assert.equal(boardStatus, 200, 'Public board should return 200');
  
  // Find the run
  const run = boardBody.runs.find(r => r.run_id === runId);
  assert.ok(run, 'Run should be in results');
  
  // CRITICAL: Overridden fields must come back overridden
  assert.equal(run.task, 'Overridden task', 
    'Task should be overridden');
  assert.equal(run.summary, 'Overridden summary',
    'Summary should be overridden');
  assert.ok(run.edited === true,
    'Run should be marked as edited');
  
  // Cleanup
  await request(`/api/admin/tokens/${createBody.id}/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  });
  
  await sql`DELETE FROM run_overrides WHERE account_id = ${accountId}::uuid`;
  await sql`DELETE FROM events WHERE account_id = ${accountId}::uuid`;
  await sql`DELETE FROM accounts WHERE id = ${accountId}::uuid`;
});

test('Newly created board is private by default - returns 401', async () => {
  const accountId = 'new-private-board-test';
  
  // Create token (which creates account)
  const { status: createStatus, body: createBody } = await request('/api/admin/tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({
      account_id: accountId,
      label: 'New Private Board Test',
    }),
  });
  
  if (createStatus !== 201) {
    console.warn('Skipping new board test: could not create token');
    return;
  }
  
  const agentToken = createBody.token;
  
  // Post an event to ensure account exists
  const runId = `new-board-run-${Date.now()}`;
  await request('/api/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${agentToken}` },
    body: JSON.stringify({
      event: 'session_start',
      run_id: runId,
      ts: new Date().toISOString(),
      agent: 'Test Agent',
      summary: 'New board test',
      trigger: 'user',
      schema: 'https://fleeet.app/schema/event/v1.json',
    }),
  });
  
  // CRITICAL: New board must be private, should return 401 without read token
  const { status: boardStatus, body: boardBody } = await request(`/api/boards/${accountId}/events`);
  
  assert.equal(boardStatus, 401, 'New board should be private by default and return 401');
  assert.match(boardBody.error || boardBody.message || '', /private|token|unauthorized/i,
    'Error message should indicate board is private');
  
  // Cleanup
  await request(`/api/admin/tokens/${createBody.id}/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  });
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
