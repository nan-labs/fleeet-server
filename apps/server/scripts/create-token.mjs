#!/usr/bin/env node
// create-token.mjs — CLI tool to create agent tokens

import postgres from 'postgres';
import { newToken, hashToken, cleanLabel } from '../../../packages/core/src/token.mjs';
import { randomUUID } from 'node:crypto';
import { config } from '../src/config.mjs';
import { PostgresStore } from '../src/store/postgres.mjs';

async function main() {
  const args = process.argv.slice(2);
  const accountId = args[0];
  const label = args[1];

  if (!accountId) {
    console.error('Usage: npm run token:create <account_id> [label]');
    console.error('');
    console.error('Example:');
    console.error('  npm run token:create 123e4567-e89b-12d3-a456-426614174000 "My Agent"');
    process.exit(1);
  }

  const sql = postgres(config.databaseUrl);
  const store = new PostgresStore(sql);

  try {
    // Check account exists
    const account = await store.getAccount(accountId);
    if (!account) {
      console.error(`Error: Account ${accountId} not found`);
      process.exit(1);
    }

    // Generate token
    const token = newToken();
    const hash = hashToken(token);
    const cleanedLabel = cleanLabel(label);

    const dbToken = {
      id: randomUUID(),
      account_id: accountId,
      token_hash: hash,
      label: cleanedLabel || null,
      created_at: new Date().toISOString(),
      revoked: false,
      revoked_at: null,
      last4: token.slice(-4),
      agent_kind: null,
    };

    await store.insertToken(dbToken);

    console.log('✓ Token created');
    console.log('');
    console.log('  ID:', dbToken.id);
    console.log('  Account:', account.space);
    console.log('  Label:', cleanedLabel || '(none)');
    console.log('');
    console.log('  Token (save this, it will not be shown again):');
    console.log('  ' + token);
    console.log('');

    await sql.end();
  } catch (err) {
    console.error('Error:', err.message);
    await sql.end();
    process.exit(1);
  }
}

main();
