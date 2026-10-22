// index.mjs — fleeet HTTP server

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import postgres from 'postgres';
import { config, version } from './config.mjs';
import { runMigrations } from './migrate.mjs';
import { PostgresStore } from './store/postgres.mjs';

const app = new Hono();

// Initialize database
const sql = postgres(config.databaseUrl);
const store = new PostgresStore(sql);

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
