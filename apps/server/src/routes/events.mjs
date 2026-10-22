// routes/events.mjs — Event ingest endpoint

import draft2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { sanitizeEvent } from '@fleeet/core/sanitize';

// Load and compile schema
const schemaPath = new URL('../../../../packages/core/schema/event-schema.json', import.meta.url);
const rawSchema = JSON.parse(readFileSync(schemaPath, 'utf8'));

const ajv = new draft2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(rawSchema);

// Extract schema major version
const SCHEMA_VERSION = rawSchema.$id?.match(/\/v?(\d+)\./)?.[1] || '1';
const ACCEPTED_MAJORS = new Set([SCHEMA_VERSION]);

// Payload limits (matching kit)
const MAX_EVENT_SIZE = 64 * 1024; // 64 KB per event
const MAX_BATCH_SIZE = 512 * 1024; // 512 KB per request
const MAX_EVENTS_PER_BATCH = 50;

export function registerEventRoutes(app, { store }) {
  // GET events for an account
  app.get('/api/events', async (c) => {
    const accountId = c.get('accountId');
    const since = c.req.query('since');
    const limit = parseInt(c.req.query('limit') || '100', 10);
    
    const events = await store.listEvents({ 
      accountId, 
      since, 
      limit: Math.min(limit, 500) 
    });
    
    return c.json({ events });
  });

  app.post('/api/events', async (c) => {
    // Check content length
    const contentLength = parseInt(c.req.header('content-length') || '0', 10);
    if (contentLength > MAX_BATCH_SIZE) {
      return c.json({ error: 'Payload too large', limit: MAX_BATCH_SIZE }, 413);
    }

    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400);
    }

    // Single event or batch
    const events = Array.isArray(body) ? body : [body];
    
    if (events.length > MAX_EVENTS_PER_BATCH) {
      return c.json({ 
        error: 'Batch too large', 
        limit: MAX_EVENTS_PER_BATCH 
      }, 400);
    }

    // Check individual event sizes
    for (let i = 0; i < events.length; i++) {
      const eventJson = JSON.stringify(events[i]);
      if (eventJson.length > MAX_EVENT_SIZE) {
        return c.json({ 
          error: `Event ${i} too large`, 
          limit: MAX_EVENT_SIZE 
        }, 400);
      }
    }

    const accountId = c.get('accountId');
    const tokenId = c.get('token').id;
    const results = [];
    const errors = [];

    for (let i = 0; i < events.length; i++) {
      const raw = events[i];
      
      // Check schema major
      const eventMajor = raw.schema?.match(/\/v?(\d+)\./)?.[1];
      if (eventMajor && !ACCEPTED_MAJORS.has(eventMajor)) {
        errors.push({ 
          index: i, 
          error: 'Unsupported schema version', 
          version: eventMajor, 
          accepted: Array.from(ACCEPTED_MAJORS) 
        });
        continue;
      }

      // Validate against schema
      const valid = validate(raw);
      if (!valid) {
        errors.push({ 
          index: i, 
          error: 'Schema validation failed', 
          details: validate.errors 
        });
        continue;
      }

      // Sanitize
      const { event: sanitized, redactions } = sanitizeEvent(raw);

      // Add server metadata
      const dbEvent = {
        account_id: accountId,
        token_id: tokenId,
        event: sanitized.event,
        run_id: sanitized.run_id,
        ts: sanitized.ts,
        received_at: new Date().toISOString(),
        retain_until: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
        agent: sanitized.agent,
        surface: sanitized.surface || null,
        project: sanitized.project || null,
        trigger: sanitized.trigger || 'user',
        visibility: sanitized.visibility || null,
        summary: sanitized.summary,
        task: sanitized.task || null,
        source: sanitized.source ? JSON.stringify(sanitized.source) : null,
        progress: sanitized.progress ? JSON.stringify(sanitized.progress) : null,
        blocker: sanitized.blocker ? JSON.stringify(sanitized.blocker) : null,
        outcome: sanitized.outcome ? JSON.stringify(sanitized.outcome) : null,
        client: sanitized.client ? JSON.stringify(sanitized.client) : null,
      };

      try {
        await store.insertEvent(dbEvent);
        results.push({ index: i, status: 'accepted', redactions });
      } catch (err) {
        errors.push({ index: i, error: 'Database error', message: err.message });
      }
    }

    const status = errors.length === 0 ? 200 : (results.length === 0 ? 400 : 207);
    return c.json({ 
      accepted: results.length, 
      rejected: errors.length, 
      results: results.length > 0 ? results : undefined,
      errors: errors.length > 0 ? errors : undefined,
    }, status);
  });
}
