# Alure Dashboard

React + Vite administrative UI for Alure licensing, activations, modules, and release distribution.

## Scope

The dashboard is intended for internal operators and administrators. It provides:
- Project management (create, delete, favorites, overview KPIs)
- License lifecycle management (single and bulk creation, revoke, module overrides)
- Activation inspection and remediation (device details, revoke, module override)
- Release management (channels, status, assets, protected download links)
- SMTP and invite-based user provisioning workflows

## Requirements

- Node.js 20+
- npm 10+
- Running Alure API (`server/`) reachable via `VITE_API_BASE`

## Configuration

Create `dashboard/.env`:

```env
VITE_API_BASE=http://localhost:3000/api/v1
```

For production builds, use `dashboard/.env.production` with the same variable.

## Development

```bash
npm install
npm run dev
```

The app will be available on the Vite dev server (usually `http://localhost:5173`).

## Build and Preview

```bash
npm run build
npm run preview
```

## Scripts

- `npm run dev`: start development server
- `npm run build`: type-check and production build
- `npm run preview`: serve built output locally

## UX Notes

- Mobile-first adjustments are implemented for login, wizard modals, and module controls.
- Filter sections in Licenses, Activations, and Releases are collapsible and default to hidden.
- The license creation flow uses a guided wizard with mode switch (`Single`/`Bulk`) in one modal.

## Related Docs

- Root documentation: `README.md`
- API contract: `server/openapi/openapi.yaml`
- Release notes: `CHANGELOG.md`
