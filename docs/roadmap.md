# Roadmap

## Fase 0: Prototipo Firebase
- Definizione OpenAPI (core licensing + update)
- NestJS API con Firebase Auth/Firestore/Storage
- SDK Python (attivazione, verifica offline, update check)
- SDK Rust (async, update check, receipt verify)
- Dashboard minima: progetti, licenze, release

## Fase 1: Self-hosted MVP
- Migrazione data layer a PostgreSQL
- Storage asset su filesystem o S3-compatible
- Auth interna (token + scope)
- Docker Compose con Postgres + API + web

## Fase 2: Enterprise hardening
- RBAC e audit log
- Rate limiting e API keys per integrazioni CI/CD
- Multi-tenant opzionale
- Backup/restore

## Milestone immediate (prossime 2-4 settimane)
- Stabilire schema OpenAPI v1
- Prototipo API licensing (activate/verify/revoke)
- SDK Python con receipt offline verify
- Proof-of-concept update endpoint
