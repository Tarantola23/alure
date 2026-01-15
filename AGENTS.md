# Repository Guidelines

## Project Structure & Module Organization
- `server/`: NestJS API (licensing, updates, auth) + Prisma schema and tests.
- `dashboard/`: React + Vite web UI for projects, licenses, activations, releases.
- `sdk-python/` and `sdk-rust/`: client SDKs.
- `docs/`: architecture notes and roadmap.
- `infra/`: deployment notes.
- `server/openapi/openapi.yaml`: API contract (source of truth).

## Build, Test, and Development Commands
Server (`server/`):
- `npm run start:dev`: run API in watch mode.
- `npm run build`: compile NestJS to `dist/`.
- `npm run db:push`: push Prisma schema to the database.
- `npm run test`: unit tests.
- `npm run test:e2e`: end-to-end tests.

Dashboard (`dashboard/`):
- `npm run dev`: run Vite dev server.
- `npm run build`: typecheck and build to `dist/`.
- `npm run preview`: preview production build.

## Coding Style & Naming Conventions
- TypeScript uses ESLint + Prettier; run `npm run lint` or `npm run format` in `server/`.
- React components use `.tsx`. Keep names PascalCase (e.g., `ProjectCard.tsx`).
- API DTOs live in `server/src/*/*.types.ts`.

## Testing Guidelines
- Unit tests: `*.spec.ts` under `server/src/`.
- E2E tests: `server/test/*.e2e-spec.ts` (run with `npm run test:e2e`).
- Add tests for new endpoints and critical flows (activate, verify, update, download).

## Commit & Pull Request Guidelines
- No established commit convention yet; use clear, imperative messages (e.g., `Add download token endpoint`).
- PRs should include:
  - Summary of changes and affected modules.
  - API or DB changes (update `server/openapi/openapi.yaml` and Prisma schema if needed).
  - UI screenshots for dashboard changes.

## Security & Configuration Tips
- Use `.env` for secrets (DB URL, JWT, receipt keys). Do not commit secrets.
- When deploying, ensure `PORT` is honored by the server and Cloud Run env vars are set.
