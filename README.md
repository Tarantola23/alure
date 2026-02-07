# Alure

## Overview (EN)
Alure is an open source, self-hosted platform for desktop software licensing and update distribution. It includes a web dashboard, a REST API, and official SDKs (Python and Rust) so teams can manage projects, licenses, and releases without relying on external SaaS.

## Features (EN)
- Multi-project management with plans (Basic/Pro/Enterprise), activation limits, revocation, and notes.
- Bulk license creation with email delivery (SMTP) and recipient hashing.
- Signed activation receipts for offline-first validation with configurable grace period.
- Project modules with per-license and per-activation overrides (force on/off).
- Encrypted device hostname storage with password-gated reveal in the dashboard.
- Update channels (stable/beta/hotfix), release status (draft/published/deprecated), and asset checksums (SHA256).
- Unique versions per project (prevents duplicate release versions).
- Version check endpoint can be public, while downloads are protected via auth or download token.
- API is versioned (`/api/v1`) and designed for CI/CD usage.
- SDKs for Python and Rust implement the same licensing and update rules.
- Admin SMTP settings and invite-only user provisioning (one-hour invite link).
 - Overview stats for licenses, activations, modules, and releases in the dashboard.

## Architecture (EN)
- API: NestJS (TypeScript) with Prisma ORM.
- Database: PostgreSQL.
- Storage: local filesystem for dev, Google Cloud Storage (GCS) for production assets.
- Dashboard: React + Vite (TypeScript).
- SDKs: Python package and Rust crate.

## Core Flows (EN)
1) Activate license -> server returns signed receipt.
2) Verify online -> server validates receipt and returns updated info (including refreshed modules).
3) Verify offline -> client validates receipt signature and expiry locally.
4) Check update -> `/updates/latest` returns latest release metadata.
5) Download -> protected by JWT or download token (`/updates/download-token`).

## SDK (EN)
See the detailed Python SDK guide in `sdk-python/README.md`.

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
- `DATA_ENCRYPTION_KEY` to encrypt device hostnames (fallbacks to `JWT_SECRET`).

## API Error Codes (EN)
The API returns a numeric `error_code` in the JSON body and `X-Error-Code` header.

Auth (1xxx):
- 1001 admin_only
- 1002 admin_exists
- 1003 user_exists
- 1004 user_not_found
- 1005 invalid_invite
- 1006 invite_expired
- 1007 invalid_otp
- 1008 auth_required
- 1009 invalid_password
- 1010 missing_user

Licensing (2xxx):
- 2001 license_not_found
- 2002 license_revoked
- 2003 license_expired
- 2004 activation_already_exists
- 2005 activation_limit_reached
- 2006 activation_not_found
- 2007 recipients_required
- 2008 module_not_found
- 2009 module_not_allowed

Releases & Updates (3xxx):
- 3001 release_not_found
- 3002 release_version_exists
- 3003 channel_required
- 3004 invalid_channel
- 3005 invalid_release
- 3006 file_required
- 3007 asset_not_found
- 3008 asset_project_mismatch
- 3009 license_invalid
- 3010 invalid_token
- 3011 missing_token

SMTP (4xxx):
- 4001 smtp_not_verified
- 4002 smtp_not_configured
- 4003 missing_password
- 4004 missing_verification_code
- 4005 verification_code_expired
- 4006 invalid_verification_code

Projects & Modules (5xxx):
- 5001 project_not_found
- 5002 project_name_already_exists
- 5003 module_key_exists

Plans (6xxx):
- 6001 plan_not_found
- 6002 plan_name_already_exists

### Encrypted device hostname (EN)
- The SDK sends `device_meta.hostname` during activation.
- The server stores it encrypted and the dashboard shows a masked value.
- To reveal the full hostname, users must re-enter their password.
- API: `POST /licenses/:licenseId/activations/:activationId/hostname` with `{ "password": "..." }`.

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
- Moduli progetto con override per licenza/attivazione (force on/off).
- Hostname device cifrato con reveal protetto da password.
- Canali update (stable/beta/hotfix), stati release (draft/published/deprecated) e checksum SHA256.
- Versioni uniche per progetto (niente duplicati di release).
- Check versione pubblico e download protetto tramite token o JWT.
- API versionata (`/api/v1`) pronta per integrazione CI/CD.
- SDK Python e Rust allineati alla stessa logica di licensing e update.
- Configurazione SMTP e invito utenti con link valido 1 ora.
 - Overview con KPI per licenze, attivazioni, moduli e release.

## Architettura (IT)
- API: NestJS (TypeScript) con Prisma.
- Database: PostgreSQL.
- Storage: filesystem locale in dev, Google Cloud Storage in produzione.
- Dashboard: React + Vite (TypeScript).
- SDK: Python package e Rust crate.

## Flussi principali (IT)
1) Attivazione licenza -> receipt firmato dal server.
2) Verifica online -> validazione server e refresh dati (inclusi moduli).
3) Verifica offline -> validazione firma e scadenza lato client.
4) Check update -> `/updates/latest` ritorna metadati release.
5) Download -> protetto da JWT o token (`/updates/download-token`).

## SDK (IT)
Consulta la guida SDK Python in `sdk-python/README.md`.

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
- `DATA_ENCRYPTION_KEY` per cifrare gli hostname dei device (fallback su `JWT_SECRET`).

## Codici errore API (IT)
L'API restituisce `error_code` nel JSON e `X-Error-Code` negli header.

Auth (1xxx):
- 1001 admin_only
- 1002 admin_exists
- 1003 user_exists
- 1004 user_not_found
- 1005 invalid_invite
- 1006 invite_expired
- 1007 invalid_otp
- 1008 auth_required
- 1009 invalid_password
- 1010 missing_user

Licensing (2xxx):
- 2001 license_not_found
- 2002 license_revoked
- 2003 license_expired
- 2004 activation_already_exists
- 2005 activation_limit_reached
- 2006 activation_not_found
- 2007 recipients_required
- 2008 module_not_found
- 2009 module_not_allowed

Releases & Updates (3xxx):
- 3001 release_not_found
- 3002 release_version_exists
- 3003 channel_required
- 3004 invalid_channel
- 3005 invalid_release
- 3006 file_required
- 3007 asset_not_found
- 3008 asset_project_mismatch
- 3009 license_invalid
- 3010 invalid_token
- 3011 missing_token

SMTP (4xxx):
- 4001 smtp_not_verified
- 4002 smtp_not_configured
- 4003 missing_password
- 4004 missing_verification_code
- 4005 verification_code_expired
- 4006 invalid_verification_code

Projects & Modules (5xxx):
- 5001 project_not_found
- 5002 project_name_already_exists
- 5003 module_key_exists

Plans (6xxx):
- 6001 plan_not_found
- 6002 plan_name_already_exists

### Hostname device cifrato (IT)
- L'SDK invia `device_meta.hostname` durante l'attivazione.
- Il server lo salva cifrato e la dashboard mostra un valore mascherato.
- Per vedere il valore completo serve reinserire la password utente.
- API: `POST /licenses/:licenseId/activations/:activationId/hostname` con `{ "password": "..." }`.

## Note produzione (IT)
Il filesystem di Cloud Run non e persistente. In produzione usa `GCS_BUCKET` per gli asset. Dopo aver abilitato GCS, ricarica gli asset per ottenere `storagePath` con `gs://...`.

## Changelog (IT)
Consulta `CHANGELOG.md` per le note di rilascio con data.

## License
TBD. Recommended: Apache-2.0 or AGPL-3.0 depending on your distribution needs.
