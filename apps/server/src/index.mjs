// index.mjs — fleeet HTTP server

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import postgres from 'postgres';
import { config, version } from './config.mjs';
import { runMigrations } from './migrate.mjs';
import { PostgresStore } from './store/postgres.mjs';
import { requireAdmin, requireAgentToken } from './middleware/auth.mjs';
import { rateLimit } from './middleware/rate-limit.mjs';
import { registerEventRoutes } from './routes/events.mjs';
import { registerTokenRoutes } from './routes/tokens.mjs';
import { registerBoardRoutes } from './routes/boards.mjs';

const app = new Hono();

// Initialize database
const sql = postgres(config.databaseUrl);
const store = new PostgresStore(sql);
store.sql = sql; // Expose sql for token routes

// Healthcheck
app.get('/healthz', (c) => {
  return c.json({ status: 'ok', version });
});

// Version endpoint
app.get('/api/version', async (c) => {
  const { readFileSync } = await import('node:fs');
  const schemaPath = new URL('../../../packages/core/schema/event-schema.json', import.meta.url);
  let schema;
  try {
    schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  } catch {
    return c.json({ error: 'schema not found' }, 500);
  }
  
  // Extract major version from schema $id
  const schemaVersion = schema.$id?.match(/\/v?(\d+)\./)?.[1] || '1';
  
  return c.json({
    server: version,
    schema: {
      version: schemaVersion,
      accepted: [schemaVersion],
    },
  });
});

// Event ingest (agent token required, rate limited)
const eventsApp = new Hono();
eventsApp.use('*', requireAgentToken(store));
eventsApp.use('*', rateLimit({ maxRequests: 300, windowMs: 60000, keyBy: 'accountId' }));
registerEventRoutes(eventsApp, { store });
app.route('/', eventsApp);

// Admin API (admin token required)
const adminApp = new Hono();
adminApp.use('*', requireAdmin(config));
registerTokenRoutes(adminApp, { store, config });
app.route('/', adminApp);

// Board read API (public or read token required)
registerBoardRoutes(app, { store });

// Board UI at /b/:slug
app.get('/b/:slug', async (c) => {
  const { readFileSync } = await import('node:fs');
  const path = new URL('../public/board.html', import.meta.url);
  const html = readFileSync(path, 'utf8');
  return c.html(html);
});

// Startup
async function main() {
  console.log('fleeet-server starting...');
  console.log(`Database: ${config.databaseUrl.replace(/:[^:@]+@/, ':***@')}`);
  
  console.log('Running migrations...');
  await runMigrations(sql);
  
  console.log(`Starting server on port ${config.port}...`);
  serve({
    fetch: app.fetch,
    port: config.port,
  });
  
  console.log(`✓ Server running at ${config.publicUrl}`);
}

main().catch((err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});
