# Alure (proto)

Piattaforma open source per licensing + aggiornamenti software desktop, con dashboard e SDK ufficiali (Python + Rust).

Questo repository parte con un prototipo basato su Firebase per velocizzare la validazione. L'obiettivo finale resta una versione 100% self-hosted (PostgreSQL + storage S3/FS) senza dipendenze SaaS.

## Obiettivi
- Licensing completo (chiavi, attivazioni, revoche, receipt firmati)
- Update service (canali, asset, checksum, promozione/rollback)
- API REST versionata con token + scope
- SDK Python e Rust allineati alla stessa API
- Installazione self-hosted con Docker Compose

## Struttura repo
- `docs/` architettura, roadmap e analisi stack
- `server/` backend API + dashboard (prototipo Firebase)
- `sdk-python/` SDK Python
- `sdk-rust/` SDK Rust
- `infra/` configurazioni per deployment self-hosted

## Stato
- **Fase 0 (prototype):** Firebase per auth/storage/database
- **Fase 1 (self-hosted):** PostgreSQL + storage S3/FS + auth interna

## Quick start (placeholder)
Documenti di architettura e roadmap: `docs/architecture.md`, `docs/roadmap.md`.

## License
Da definire (consigliato: Apache-2.0 o AGPL-3.0 per forza di condivisione).
