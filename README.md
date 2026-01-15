# Alure

Alure is an open source, self-hosted platform for desktop software licensing and update distribution. It bundles a web dashboard, a REST API, and official SDKs (Python and Rust) so teams can manage projects, licenses, and releases without relying on external SaaS.

## Key Features
- Multi-project dashboard with licensing, activations, and releases.
- License keys, activation limits, revocation, and signed receipts.
- Update channels (stable/beta/hotfix) with asset upload and checksums.
- Public update check endpoint with protected downloads.
- Offline-first verification using receipts and configurable grace period.
- SDKs for Python and Rust using the same API rules.

## Repository Layout
- `server/` NestJS API + Prisma schema.
- `dashboard/` React + Vite web UI.
- `sdk-python/` Python SDK and examples.
- `sdk-rust/` Rust SDK crate.
- `docs/` architecture and roadmap.
- `infra/` deployment notes.

## Quick Start (Local)
Backend:
```bash
cd server
npm install
npx prisma db push
npm run start:dev
```

Dashboard:
```bash
cd dashboard
npm install
npm run dev
```

By default the dashboard reads `VITE_API_BASE` from `dashboard/.env`.

## Configuration
Required env vars for the server:
- `DATABASE_URL` (PostgreSQL)
- `JWT_SECRET`
- `RECEIPT_PRIVATE_KEY`
- `DOWNLOAD_TOKEN_SECRET`

Optional:
- `GCS_BUCKET` and `GCS_PREFIX` for persistent asset storage on Google Cloud Storage.
- `SWAGGER_ENABLED=true` to expose `/api` docs.

## Storage Notes
Cloud Run filesystem is ephemeral. For production use, configure `GCS_BUCKET` so release assets are stored in a bucket. Local development can use the filesystem.

## Auth Bootstrap
On first run, the dashboard shows an admin creation form. After the first admin is created, bootstrap is disabled.

## License
TBD. Recommended: Apache-2.0 or AGPL-3.0 depending on your distribution needs.
