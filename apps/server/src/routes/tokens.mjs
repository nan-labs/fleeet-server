// routes/tokens.mjs — Admin token management endpoints

import { newToken, hashToken, cleanLabel } from '../../../core/src/token.mjs';
import { randomUUID } from 'node:crypto';

export function registerTokenRoutes(app, { store, config }) {
  // Create token (admin only)
  app.post('/api/admin/tokens', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { account_id, label, last4, agent_kind } = body;

    if (!account_id) {
      return c.json({ error: 'account_id is required' }, 400);
    }

    // Check account exists
    const account = await store.getAccount(account_id);
    if (!account) {
      return c.json({ error: 'Account not found' }, 404);
    }

    // Generate token
    const token = newToken();
    const hash = hashToken(token);
    const cleanedLabel = cleanLabel(label);

    const dbToken = {
      id: randomUUID(),
      account_id,
      token_hash: hash,
      label: cleanedLabel || null,
      created_at: new Date().toISOString(),
      revoked: false,
      revoked_at: null,
      last4: last4 || token.slice(-4),
      agent_kind: agent_kind || null,
    };

    await store.insertToken(dbToken);

    // Return token only once
    return c.json({
      token,
      id: dbToken.id,
      account_id,
      label: cleanedLabel,
      last4: dbToken.last4,
      created_at: dbToken.created_at,
    }, 201);
  });

  // List tokens for an account (admin only)
  app.get('/api/admin/tokens', async (c) => {
    const accountId = c.req.query('account_id');
    
    if (!accountId) {
      return c.json({ error: 'account_id query parameter is required' }, 400);
    }

    const account = await store.getAccount(accountId);
    if (!account) {
      return c.json({ error: 'Account not found' }, 404);
    }

    const tokens = await store.listTokens(account);
    
    // Don't include token_hash in response
    const safe = tokens.map(({ token_hash, ...rest }) => rest);
    
    return c.json({ tokens: safe });
  });

  // Revoke token (admin only)
  app.post('/api/admin/tokens/:id/revoke', async (c) => {
    const { id } = c.req.param();

    // Find token by id
    const tokens = await store.sql`
      select * from tokens where id = ${id}
    `;
    
    if (tokens.length === 0) {
      return c.json({ error: 'Token not found' }, 404);
    }

    const token = tokens[0];
    if (token.revoked) {
      return c.json({ error: 'Token already revoked' }, 400);
    }

    await store.updateToken(token.token_hash, {
      revoked: true,
      revoked_at: new Date().toISOString(),
    });

    return c.json({ 
      id: token.id, 
      revoked: true,
      revoked_at: new Date().toISOString(),
    });
  });
}
