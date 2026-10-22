// middleware/auth.mjs — Authentication middleware

import { bearer, hashToken, compareTokens } from '@fleeet/core/token';

export function requireAdmin(config) {
  return async (c, next) => {
    const token = bearer(c.req);
    if (!token || !compareTokens(token, config.adminToken)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    await next();
  };
}

export function requireAgentToken(store) {
  return async (c, next) => {
    const token = bearer(c.req);
    if (!token) {
      return c.json({ error: 'Unauthorized: Bearer token required' }, 401);
    }

    const hash = hashToken(token);
    const dbToken = await store.getTokenByHash(hash);
    
    if (!dbToken) {
      return c.json({ error: 'Unauthorized: Invalid token' }, 401);
    }
    
    if (dbToken.revoked) {
      return c.json({ error: 'Unauthorized: Token revoked' }, 401);
    }

    // Update last_seen_at
    await store.updateToken(hash, { last_seen_at: new Date().toISOString() });

    // Attach token and account to context
    c.set('token', dbToken);
    c.set('accountId', dbToken.account_id);
    
    await next();
  };
}
