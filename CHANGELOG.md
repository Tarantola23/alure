# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog and this project follows semantic, date-based release notes.

## [Unreleased]

### Added
- Consistent API error code mapping and HTTP error response shaping.
- SDK examples for simpler first-run integration (Python and Rust).

### Changed
- License creation UX in dashboard migrated to a guided wizard flow (Single and Bulk in one modal).
- Dashboard release download behavior now preserves asset filename when available.
- Filtering UX for Licenses, Activations, and Releases defaults to collapsed sections.

### Fixed
- Bulk license validation now accepts non-email recipient labels when email delivery is disabled.
- Mobile layout improvements for login and license wizard modals (overflow, spacing, alignment).
- Module metadata blocks in license/activation modals now wrap correctly on small screens.

## [2026-01-27]

### Added
- Project modules with CRUD management in the dashboard.
- Per-license module configuration with force on/off overrides.
- Per-activation module overrides with edit modal and receipt refresh.
- Encrypted device hostname storage with masked display and password-gated reveal.
- Activation `last_seen` tracking and dashboard visibility.
- Release status flow (`draft`, `published`, `deprecated`) and unique version constraint per project.
- Release filters for status/channel and extended release overview KPIs.

### Changed
- Receipt verification flow now refreshes receipts when module state changes.

## [2026-01-17]

### Added
- SMTP settings with verification flow and encrypted credentials.
- Bulk license creation with optional email delivery and recipient hashing.
- Admin user invite flow with temporary password and one-hour invite link.
- Invite acceptance page to set initial password.
- Favorites sidebar and project management actions (create/delete with confirmation).
- Bulk batch grouping for issued licenses.
- Cloud Run deployment script and deployment notes.

### Changed
- Mobile license management UX (collapsible forms, stacked table rows, icon-first actions).

## [2026-01-15]

### Added
- Contributor guidelines (`AGENTS.md`).
- Mobile hamburger menu for project navigation.
- Receipt key normalization for PEM environment values.
- Python SDK example updates with expiration visibility.

### Changed
- Dashboard and API default configuration behavior (CORS and Swagger toggle).
- Dockerfile runtime flow now includes Prisma client generation.
