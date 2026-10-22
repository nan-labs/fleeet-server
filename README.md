# fleeet-server

Portable fleeet logic and HTTP server with Postgres storage.

## Structure

- `packages/core` — `@fleeet/core`, shared portable logic
- `apps/server` — HTTP server with Postgres storage

## Quickstart

Requires Docker and Docker Compose.

```bash
# Generate a secure admin token (32+ characters)
export FLEEET_ADMIN_TOKEN=$(openssl rand -base64 32)

# Start the server and Postgres
docker compose up

# Server runs at http://localhost:3000
# Healthcheck: http://localhost:3000/healthz
# Version: http://localhost:3000/api/version
```

### Local development

Requires Node.js 22+ and Postgres 16+.

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env and set DATABASE_URL and FLEEET_ADMIN_TOKEN

# Run migrations and start server
cd apps/server
npm start

# Development mode with auto-reload
npm run dev
```

## @fleeet/core

Portable, hosted-agnostic logic for fleeet event processing:

- **sanitize** — Event sanitization, PII/secret redaction
- **model** — Event data model rules (trigger, surface, project normalization)
- **colors** — Agent identity colors with collision detection
- **size** — Task size computation (XS/S/M/L/XL from tokens or proxy signals)
- **runs** — Run summary derivation from event streams
- **summary** — Snapshot counts and statistics
- **board** — Board visibility and privacy rules
- **token** — Token hashing, generation, and comparison
- **store** — Storage interface (no implementation)

### Event Schema

The event JSON schema is vendored from [`nan-labs/fleeet`](https://github.com/nan-labs/fleeet). Run `node scripts/sync-schema.mjs` to update, or `node scripts/sync-schema.mjs --check` to verify it matches upstream.

## Development

```bash
npm install
npm test
npm run ci:check-hosted  # Check for leaked hosted service strings
```

## License

Apache-2.0

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)
