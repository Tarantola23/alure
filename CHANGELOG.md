# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]
- TBD

## [2026-01-27]
- Added project modules with CRUD management in the dashboard.
- Added per-license module configuration with force on/off overrides.
- Added per-activation module overrides with edit modal and receipt refresh.
- Added receipt refresh on verify when modules change.
- Added encrypted device hostname storage with masked display and password-gated reveal.
- Added activation last_seen tracking and display in dashboard.
- Added releases status flow (draft/published/deprecated) and unique version constraint per project.
- Added release filters for status/channel and improved release cards.
- Added overview KPIs for releases status and module usage.

## [2026-01-17]
- Added SMTP settings with verification flow and encrypted credentials.
- Added bulk license creation with email delivery and recipient hashing.
- Added admin user invite flow with temporary password + one-hour link.
- Added invite accept page to set the initial password.
- Added dashboard favorites sidebar with project management (create/delete + confirmation).
- Added bulk batches grouping and expanded licenses list in dashboard.
- Improved mobile licenses UX (collapsible forms, stacked table rows, icon-only actions).
- Added Cloud Run deploy script and deployment notes.

## [2026-01-15]
- Added contributor guidelines (`AGENTS.md`).
- Added hamburger menu for project navigation on mobile.
- Improved dashboard/ API configuration defaults (CORS + Swagger toggle).
- Added receipt key normalization for PEM env values.
- Updated Dockerfile to include Prisma client generation in runtime image.
- Added expiry display in the Python SDK example client.
