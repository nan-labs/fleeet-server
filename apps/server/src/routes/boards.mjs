// routes/boards.mjs — Public read-only board API

import { groupRuns, deriveRun, parseRange, cleanTz, RangeError400 } from '@fleeet/core/runs';
import { snapshotCounts } from '@fleeet/core/summary';
import { boardSettings, hiddenRunIds } from '@fleeet/core/board';
import { hashToken, compareTokens } from '@fleeet/core/token';

// Authenticate board read tokens for private boards
function requireBoardAccess(store) {
  return async (c, next) => {
    const slug = c.req.param('slug');
    
    // Get account by space slug
    const account = await store.getAccountBySpace(slug);
    if (!account) {
      return c.json({ error: 'Board not found' }, 404);
    }
    
    c.set('account', account);
    
    // If board is public, allow access
    if (account.board_visibility === 'public') {
      return await next();
    }
    
    // Private board - require read token
    const auth = c.req.header('authorization');
    if (!auth) {
      return c.json({ 
        error: 'Unauthorized', 
        message: 'This board is private. A read token is required.' 
      }, 401);
    }
    
    const [scheme, token] = auth.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token || !token.startsWith('flr_')) {
      return c.json({ error: 'Invalid read token format' }, 401);
    }
    
    const hash = hashToken(token);
    const readToken = await store.getBoardReadTokenByHash(hash);
    
    if (!readToken || readToken.revoked || readToken.account_id !== account.id) {
      return c.json({ error: 'Invalid or revoked read token' }, 401);
    }
    
    return await next();
  };
}

export function registerBoardRoutes(app, { store }) {
  // Get board events
  app.get('/api/boards/:slug/events', requireBoardAccess(store), async (c) => {
    const account = c.get('account');
    
    // Parse time range
    const sinceRaw = c.req.query('since');
    const untilRaw = c.req.query('until');
    const tzRaw = c.req.query('tz');
    
    let from, to;
    try {
      const tz = cleanTz(tzRaw);
      const range = parseRange({ since: sinceRaw, until: untilRaw, tz });
      from = new Date(range.from).toISOString();
      to = new Date(range.to).toISOString();
    } catch (err) {
      if (err instanceof RangeError400) {
        return c.json({ error: err.message }, 400);
      }
      throw err;
    }
    
    // Fetch events
    const events = await store.listEvents({
      accountId: account.id,
      since: from,
      limit: 1000
    });
    
    // Filter events within range
    const inRange = events.filter(e => {
      const ts = new Date(e.ts).getTime();
      return ts >= new Date(from).getTime() && ts < new Date(to).getTime();
    });
    
    // Get board settings and hidden runs
    const settings = boardSettings(account);
    const hiddenRuns = await store.getHiddenRuns(account.id);
    const hidden = hiddenRunIds(inRange, settings, hiddenRuns);
    
    // Get deleted runs
    const deletedHashes = await store.getDeletedRunHashes(account.id);
    const deleted = new Set();
    for (const e of inRange) {
      const runHash = await hashRunId(account.id, e.run_id);
      if (deletedHashes.has(runHash)) {
        deleted.add(e.run_id);
      }
    }
    
    // Filter out hidden and deleted runs
    const visible = inRange.filter(e => !hidden.has(e.run_id) && !deleted.has(e.run_id));
    
    // Get run overrides
    const overrides = await store.getRunOverrides(account.id);
    
    // Apply overrides to events
    const withOverrides = visible.map(e => {
      const override = overrides.get(e.run_id);
      if (!override) return e;
      return {
        ...e,
        ...(override.task && { task: override.task }),
        ...(override.summary && { summary: override.summary }),
        edited: true
      };
    });
    
    // Group by run and derive summaries
    const byRun = groupRuns(withOverrides);
    const runs = [];
    for (const [runId, evs] of byRun) {
      const run = deriveRun(runId, evs);
      if (run) runs.push(run);
    }
    
    // Sort by last activity
    runs.sort((a, b) => new Date(b.last_at) - new Date(a.last_at));
    
    return c.json({
      board: account.space,
      from,
      to,
      runs
    });
  });
  
  // Get board summary
  app.get('/api/boards/:slug/summary', requireBoardAccess(store), async (c) => {
    const account = c.get('account');
    const period = c.req.query('period') || 'day';
    
    if (!['day', 'week'].includes(period)) {
      return c.json({ error: 'period must be day or week' }, 400);
    }
    
    // Fetch recent events (last 14 days for weekly summary)
    const lookback = period === 'week' ? 14 * 24 * 60 * 60 * 1000 : 2 * 24 * 60 * 60 * 1000;
    const since = new Date(Date.now() - lookback).toISOString();
    
    const events = await store.listEvents({
      accountId: account.id,
      since,
      limit: 1000
    });
    
    // Get board settings and hidden runs
    const settings = boardSettings(account);
    const hiddenRuns = await store.getHiddenRuns(account.id);
    const hidden = hiddenRunIds(events, settings, hiddenRuns);
    
    // Get deleted runs
    const deletedHashes = await store.getDeletedRunHashes(account.id);
    const deleted = new Set();
    for (const e of events) {
      const runHash = await hashRunId(account.id, e.run_id);
      if (deletedHashes.has(runHash)) {
        deleted.add(e.run_id);
      }
    }
    
    // Filter out hidden and deleted runs
    const visible = events.filter(e => !hidden.has(e.run_id) && !deleted.has(e.run_id));
    
    // Get run overrides
    const overrides = await store.getRunOverrides(account.id);
    
    // Apply overrides
    const withOverrides = visible.map(e => {
      const override = overrides.get(e.run_id);
      if (!override) return e;
      return {
        ...e,
        ...(override.task && { task: override.task }),
        ...(override.summary && { summary: override.summary })
      };
    });
    
    // Group by run and derive summaries
    const byRun = groupRuns(withOverrides);
    const runs = [];
    for (const [runId, evs] of byRun) {
      const run = deriveRun(runId, evs);
      if (run) {
        runs.push({
          agent: run.agent,
          project: run.project,
          lastAt: new Date(run.last_at).getTime()
        });
      }
    }
    
    const summary = snapshotCounts(runs, Date.now(), period);
    
    return c.json({
      board: account.space,
      ...summary
    });
  });
}

// Helper to hash run ID for deletion check
async function hashRunId(accountId, runId) {
  const text = `${accountId}:${runId}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
