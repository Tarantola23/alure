# Architettura

## Visione
Piattaforma self-hosted per licensing e distribuzione update, con dashboard e SDK ufficiali. Il prototipo usa Firebase per ridurre time-to-market, ma l'API e i modelli restano compatibili con una migrazione totale a PostgreSQL + storage S3/FS.

## Moduli principali
- **API Service**: REST `/api/v1` con auth token + scope (licensing, update, download)
- **Dashboard Web**: gestione progetti, licenze, release, attivazioni
- **Licensing Core**: gestione chiavi, attivazioni, revoche, receipt firmati
- **Update Core**: canali, asset, checksum, promozione/rollback
- **SDK Python/Rust**: attivazione, validazione offline, update check

## Modello dati (concettuale)
- Project
- LicenseKey (hash)
- Activation (device, revoked)
- Receipt (firmato)
- Release (version, channel, checksum)
- Asset (file, metadata)

## API (overview)
- `POST /api/v1/licenses/activate`
- `POST /api/v1/licenses/verify`
- `POST /api/v1/licenses/revoke`
- `GET /api/v1/updates/latest`
- `GET /api/v1/updates/download/{assetId}`

## Sicurezza
- Token con scope
- Hashing di chiavi e receipt
- Firma server-side dei receipt
- Checksum SHA256 per asset

## Storage
- **Prototype**: Firebase Auth + Firestore + Storage
- **Self-hosted**: PostgreSQL + storage S3/FS

## Roadmap tecnica
Vedi `docs/roadmap.md`.
