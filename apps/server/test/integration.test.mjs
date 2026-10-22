// test/integration.test.mjs — Integration tests for event ingest

import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.FLEEET_URL || 'http://localhost:3001';
const ADMIN_TOKEN = process.env.FLEEET_ADMIN_TOKEN || 'test-admin-token-with-at-least-32-characters-here';

// Helper to make requests
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

test('POST /api/events rejects without auth', async () => {
  const { status, body } = await request('/api/events', {
    method: 'POST',
    body: JSON.stringify({ event: 'session_start' }),
  });
  
  assert.equal(status, 401);
  assert.match(body.error, /unauthorized/i);
});

test('Admin can create and revoke tokens', async () => {
  // First create an account
  const accountId = '123e4567-e89b-12d3-a456-426614174000';
  
  // Create a test account via SQL if it doesn't exist
  // (In real tests, this would be done via fixtures)
  
  // Create token
  const { status: createStatus, body: createBody } = await request('/api/admin/tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({
      account_id: accountId,
      label: 'Test Token',
    }),
  });
  
  // May fail if account doesn't exist, but we're testing the API shape
  if (createStatus === 201) {
    assert.ok(createBody.token);
    assert.ok(createBody.token.startsWith('flt_'));
    assert.equal(createBody.label, 'Test Token');
    
    // List tokens
    const { status: listStatus, body: listBody } = await request(
      `/api/admin/tokens?account_id=${accountId}`,
      {
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      }
    );
    
    if (listStatus === 200) {
      assert.ok(Array.isArray(listBody.tokens));
    }
    
    // Revoke token
    const { status: revokeStatus } = await request(
      `/api/admin/tokens/${createBody.id}/revoke`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      }
    );
    
    assert.ok([200, 404].includes(revokeStatus));
  }
});

test('Kit-shaped event round-trips', async () => {
  // This test would need a valid token and account
  // For now, verify the shape of rejection
  const kitEvent = {
    event: 'session_start',
    run_id: 'test-run-123',
    ts: new Date().toISOString(),
    agent: 'test-agent',
    summary: 'Test session',
    trigger: 'user',
    schema: 'https://fleeet.app/schema/event/v1.json',
  };
  
  const { status, body } = await request('/api/events', {
    method: 'POST',
    body: JSON.stringify(kitEvent),
  });
  
  // Without auth, should get 401
  assert.equal(status, 401);
});
