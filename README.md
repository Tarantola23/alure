# Alure

## Overview (EN)
Alure is an open source, self-hosted platform for desktop software licensing and update distribution. It includes a web dashboard, a REST API, and official SDKs (Python and Rust) so teams can manage projects, licenses, and releases without relying on external SaaS.

## Features (EN)
- Multi-project management with plans (Basic/Pro/Enterprise), activation limits, revocation, and notes.
- Bulk license creation with email delivery (SMTP) and recipient hashing.
- Signed activation receipts for offline-first validation with configurable grace period.
- Update channels (stable/beta/hotfix), release promotion/rollback, and asset checksums (SHA256).
- Version check endpoint can be public, while downloads are protected via auth or download token.
- API is versioned (`/api/v1`) and designed for CI/CD usage.
- SDKs for Python and Rust implement the same licensing and update rules.
- Admin SMTP settings and invite-only user provisioning (one-hour invite link).

## Architecture (EN)
- API: NestJS (TypeScript) with Prisma ORM.
- Database: PostgreSQL.
- Storage: local filesystem for dev, Google Cloud Storage (GCS) for production assets.
- Dashboard: React + Vite (TypeScript).
- SDKs: Python package and Rust crate.

## Core Flows (EN)
1) Activate license -> server returns signed receipt.
2) Verify online -> server validates receipt and returns updated info.
3) Verify offline -> client validates receipt signature and expiry locally.
4) Check update -> `/updates/latest` returns latest release metadata.
5) Download -> protected by JWT or download token (`/updates/download-token`).

## Repository Layout (EN)
- `server/` NestJS API + Prisma schema.
- `dashboard/` React + Vite UI.
- `sdk-python/` Python SDK and examples.
- `sdk-rust/` Rust SDK.
- `docs/` architecture and roadmap.
- `infra/` deployment notes.

## Local Development (EN)
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

## Configuration (EN)
Required env vars:
- `DATABASE_URL` (PostgreSQL)
- `JWT_SECRET`
- `RECEIPT_PRIVATE_KEY`
- `DOWNLOAD_TOKEN_SECRET`

Optional:
- `GCS_BUCKET` and `GCS_PREFIX` for persistent asset storage on GCS.
- `SWAGGER_ENABLED=true` to expose `/api` docs.
- `CORS_ORIGINS` (comma-separated) to restrict dashboard origins.
- `SMTP_ENCRYPTION_KEY` to encrypt SMTP passwords (fallbacks to `JWT_SECRET`).
- `DASHBOARD_URL` for invite links (defaults to `http://localhost:5173`).

## Production Notes (EN)
Cloud Run filesystem is ephemeral. Use `GCS_BUCKET` to persist release assets. After enabling GCS, re-upload assets so `storagePath` becomes `gs://...`.

## Changelog (EN)
See `CHANGELOG.md` for dated release notes.

---

## Panoramica (IT)
Alure e una piattaforma open source e self-hosted per licensing e distribuzione update di applicazioni desktop. Include dashboard web, API REST e SDK ufficiali (Python e Rust) per gestire progetti, licenze e release senza dipendere da SaaS esterni.

## Funzionalita (IT)
- Gestione multi-progetto con piani, limiti attivazioni, revoca e note.
- Creazione licenze bulk con invio email (SMTP) e hash destinatari.
- Receipt firmati per verifica offline-first con grace period configurabile.
- Canali update (stable/beta/hotfix), promozione/rollback e checksum SHA256.
- Check versione pubblico e download protetto tramite token o JWT.
- API versionata (`/api/v1`) pronta per integrazione CI/CD.
- SDK Python e Rust allineati alla stessa logica di licensing e update.
- Configurazione SMTP e invito utenti con link valido 1 ora.

## Architettura (IT)
- API: NestJS (TypeScript) con Prisma.
- Database: PostgreSQL.
- Storage: filesystem locale in dev, Google Cloud Storage in produzione.
- Dashboard: React + Vite (TypeScript).
- SDK: Python package e Rust crate.

## Flussi principali (IT)
1) Attivazione licenza -> receipt firmato dal server.
2) Verifica online -> validazione server e refresh dati.
3) Verifica offline -> validazione firma e scadenza lato client.
4) Check update -> `/updates/latest` ritorna metadati release.
5) Download -> protetto da JWT o token (`/updates/download-token`).

## Struttura repo (IT)
- `server/` API NestJS + Prisma.
- `dashboard/` UI React + Vite.
- `sdk-python/` SDK Python + esempi.
- `sdk-rust/` SDK Rust.
- `docs/` architettura e roadmap.
- `infra/` note di deployment.

## Avvio locale (IT)
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

## Configurazione (IT)
Variabili richieste:
- `DATABASE_URL`, `JWT_SECRET`, `RECEIPT_PRIVATE_KEY`, `DOWNLOAD_TOKEN_SECRET`

Opzionali:
- `GCS_BUCKET`, `GCS_PREFIX` per asset persistenti su GCS.
- `SWAGGER_ENABLED=true` per la documentazione `/api`.
- `CORS_ORIGINS` per limitare gli origin della dashboard.
- `SMTP_ENCRYPTION_KEY` per cifrare le password SMTP (fallback su `JWT_SECRET`).
- `DASHBOARD_URL` per i link di invito (default `http://localhost:5173`).

## Note produzione (IT)
Il filesystem di Cloud Run non e persistente. In produzione usa `GCS_BUCKET` per gli asset. Dopo aver abilitato GCS, ricarica gli asset per ottenere `storagePath` con `gs://...`.

## Changelog (IT)
Consulta `CHANGELOG.md` per le note di rilascio con data.

## License
TBD. Recommended: Apache-2.0 or AGPL-3.0 depending on your distribution needs.
