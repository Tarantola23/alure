# Analisi stack backend

## Criteri
- API REST + OpenAPI come source of truth
- Integrazione con Firebase per prototipo
- Migrazione facile a PostgreSQL + storage S3/FS
- Team productivity e ecosistema enterprise
- Supporto a dashboard web

## Opzione A: NestJS (Node/TypeScript)
**Pro**
- Ottima integrazione con Firebase Admin SDK
- Struttura enterprise, DI, moduli, validazione
- OpenAPI/Swagger integrato
- Ecosistema ampio per web dashboard (Next/React)
- TypeScript end-to-end

**Contro**
- Runtime Node meno adatto a carichi CPU-bound
- Performance inferiore rispetto a .NET/Rust

## Opzione B: FastAPI (Python)
**Pro**
- OpenAPI automatico e docs eccellenti
- Rapidità di sviluppo e prototyping
- Facile integrazione con SDK Python lato client

**Contro**
- Firebase Admin SDK per Python meno ergonomico
- Ecosistema enterprise meno standardizzato
- Dashboard separata in altro stack

## Opzione C: .NET 8 (ASP.NET Core)
**Pro**
- Performance elevate e solidità enterprise
- Ottimo supporto OpenAPI
- Infrastruttura di sicurezza robusta

**Contro**
- Integrazione Firebase meno naturale
- Velocità di prototyping inferiore rispetto a NestJS

## Scelta consigliata
**NestJS** per il prototipo Firebase e come base per la versione self-hosted. Offre il miglior equilibrio tra velocità, integrazione Firebase e scalabilità enterprise. In fase self-hosted, sostituiamo il data layer con PostgreSQL e storage S3/FS mantenendo lo stesso contratto OpenAPI.
