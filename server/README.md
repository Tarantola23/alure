# Alure Server API

NestJS API for licensing, activation validation, modules, releases, and administrative settings.

## Tech Stack

- NestJS (TypeScript)
- Prisma ORM
- PostgreSQL
- JWT authentication
- OpenAPI contract in `server/openapi/openapi.yaml`

## Requirements

- Node.js 20+
- npm 10+
- PostgreSQL instance

## Environment Variables

Required:
- `DATABASE_URL`
- `JWT_SECRET`
- `RECEIPT_PRIVATE_KEY`
- `DOWNLOAD_TOKEN_SECRET`

Recommended:
- `DATA_ENCRYPTION_KEY` (device metadata encryption)
- `SMTP_ENCRYPTION_KEY` (SMTP password encryption)
- `CORS_ORIGINS` (comma-separated allowlist)
- `SWAGGER_ENABLED=true` (enable `/api` docs)
- `DASHBOARD_URL` (invite links)
- `PORT` (server bind port)

## Setup

```bash
npm install
npm run db:push
npm run start:dev
```

Server base URL in local development: `http://localhost:3000/api/v1`

## Available Scripts

- `npm run start:dev`: start in watch mode
- `npm run build`: compile to `dist/`
- `npm run start:prod`: run compiled app
- `npm run db:push`: apply Prisma schema to database
- `npm run test`: unit tests
- `npm run test:e2e`: end-to-end tests

## API Contract

- Source of truth: `server/openapi/openapi.yaml`
- Keep this file updated when endpoint contracts change.

## Testing Guidance

- Unit tests are under `server/src/**/*.spec.ts`
- E2E tests are under `server/test/*.e2e-spec.ts`
- Add tests for critical licensing and update flows:
  - license activation and verify
  - bulk issuance behavior
  - download token and asset delivery
  - module override propagation in receipts

## Operational Notes

- For Cloud Run or other ephemeral filesystems, configure GCS for release assets.
- Protect production secrets via secure secret management; do not commit `.env`.
