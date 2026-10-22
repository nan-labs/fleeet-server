# Changelog

All notable changes to fleeet-server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- npm workspace with `@fleeet/core` package extracted from fleeet-core (#1)
- Vendored event JSON schema from fleeet-core
- Core portable logic: sanitization, model validation, colors, size computation, runs, summary, board rules, token handling
- Server scaffold with Node 22 + Hono + PostgreSQL storage (#2)
- PostgreSQL Store implementation of `@fleeet/core` Store interface
- Migration runner applying SQL files on startup
- Docker Compose setup with Postgres 16 and healthchecks
- Multi-stage Dockerfile with non-root user
- Healthcheck endpoint (`/healthz`) and version endpoint (`/api/version`)
- Event ingest API with JSON schema validation (#3)
- Agent token authentication (flt_ tokens, SHA-256 hashed, constant-time comparison)
- Admin API for token management (create, list, revoke)
- CLI tool: `npm run token:create`
- Rate limiting (300 req/min per account, in-memory)
- Kit-compatible event format support
- Security: Postgres bound to 127.0.0.1, password required from env
- Gitleaks secret scanning in CI (using CLI directly)
- Comprehensive hosted-strings checker

### Security
- Docker Compose Postgres port bound to localhost only
- Required POSTGRES_PASSWORD from environment (no hardcoded defaults)
- Gitleaks scanning on every push and PR

## Version History

Versions: `@fleeet/core` 0.1.0, Event schema v1 (2024-10-06)
