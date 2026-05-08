# mm-ng-webui-vite

`mm-ng-webui-vite` is the modern React-based WebUI for the `mm-ng`
project. It modernizes the frontend while preserving the legacy
MineMeld user model: nodes, prototypes, feeds, tables, pipelines, status,
configuration, logs, system administration, and local session handling.

The legacy AngularJS application in `../mm-ng-webui` remains supported during
the transition. This project does not remove it, replace backend APIs, or
change MineMeld configuration semantics.

## How It Differs From mm-ng-webui

`mm-ng-webui` is the legacy AngularJS 1.x UI with Gulp, Bower, and Angular
services. `mm-ng-webui-vite` is a clean Vite application built for incremental
feature parity.

Key differences:

- React components replace AngularJS controllers and templates.
- React Router routes mirror the legacy route hierarchy.
- Fetch-based API modules replace Angular `$resource` services.
- TanStack Query handles server-state caching and refresh behavior.
- Authentication is isolated in `src/auth`; local auth works by default and
  OIDC is available when explicitly configured on the backend.
- Tailwind CSS is available for utility use, with project CSS carrying the
  MineMeld-like shell and table styling.

The goal is modernization without a new operational workflow. The UI may look
new, but it should feel like MineMeld.

## Technology Stack

- React
- TypeScript
- Vite
- React Router
- Fetch API
- TanStack Query
- Pluggable OIDC client boundary
- Tailwind CSS, used minimally

The stack keeps build tooling small, makes data fetching explicit, and separates
API, auth, route, layout, and page concerns from the start.

## Project Structure

```text
src/
  api/          MineMeld HTTP client and endpoint wrappers
  auth/         local session auth and backend-mediated OIDC boundary
  components/   reusable UI primitives
  layouts/      application shell and navigation
  pages/        route-level screens mapped to legacy WebUI areas
  routes/       React Router tree and route guards
  styles/       base styling and light Tailwind entrypoint
  types/        MineMeld API/domain TypeScript types
```

## Development

Install dependencies:

```bash
npm install
```

Run the Vite dev server:

```bash
npm run dev
```

Open:

```text
http://localhost:5173/
```

The dev server proxies MineMeld API paths to `http://localhost:5000` by
default. Override that target when needed:

```bash
VITE_MM_API_TARGET=http://localhost:5000 npm run dev
```

Run type checking and production build:

```bash
npm run typecheck
npm run build
```

## Connecting to mm-ng-core

Start the workspace compose stack from the repository root:

```bash
docker compose up -d redis core traced api
```

Then start this UI:

```bash
cd mm-ng-webui-vite
npm run dev
```

For the production-style container, run from the repository root:

```bash
docker compose up -d --build webui-vite
```

Open:

```text
http://localhost:8088/
```

The legacy AngularJS WebUI remains available separately on `http://localhost:8080/`.

The local development login is the same as the legacy stack:

```text
admin / minemeld
```

The Vite proxy preserves same-origin browser behavior for API calls such as:

- `/login` and `/logout`
- `/aaa/users/current`
- `/status`, `/status/system`, `/status/minemeld`
- `/config/running`, `/config/full`
- `/prototype`
- `/api/logs/engine`, `/api/logs/web`, `/extensions`, `/supervisor`

The modern UI uses the existing MineMeld-compatible API surface and additive
backend OIDC/config endpoints while preserving legacy WebUI behavior.

## Authentication

Local authentication is active now:

1. The login form posts `u` and `p` to `POST /login`.
2. The backend creates the same server-side session cookie used by the legacy UI.
3. The React auth provider sets the legacy `mm-ec-login` client hint cookie.
4. Authenticated API calls use same-origin cookies.
5. `/aaa/users/current` is used to discover the current identity.
6. Logout calls `/logout` and clears the client hint.

OIDC is backend-mediated. The SPA does not store provider tokens. OIDC is
disabled unless explicitly enabled through Admin -> Authentication or the
matching backend configuration. When OIDC is enabled, set:

```bash
VITE_MM_OIDC_ENABLED=true
VITE_MM_OIDC_LOGIN_PATH=/auth/oidc/login
```

The pluggable OIDC boundary in `src/auth/oidcClient.ts` redirects to the
backend OIDC start endpoint. The backend validates claims, maps roles, and
creates the same MineMeld-compatible session used by local auth.

## Implemented Parity

The modern UI now covers the primary operator and admin workflows:

- Dashboard status, health summaries, and metric charts
- Nodes list with state and type badges
- Node detail with Stats, Info, Graph, and whitelist Indicators tabs
- Clickable topology graph and output-to-originating-feed navigation
- Prototype libraries, prototype detail, and local prototype editing
- Candidate configuration overview, node creation, change status, and commit
- Logs with bounded fetches rather than loading entire log files
- System dashboard and extensions route
- Admin local users, feed users, and GUI-managed OIDC configuration
- About and login pages
- Production-style nginx container on `http://localhost:8088/`

## Remaining Parity Work

- Candidate node edit and delete flows
- Import/export flows when operators need them
- Generic Add Indicator route and table/feed indicator workflows beyond whitelist miners
- Logs table parity and optional log entry detail views
- Backup, restore, extension upload, and install-from-Git workflows
- Tag management if required for full legacy parity
- SSE-backed status updates where useful

## Non-Goals

- Do not remove or modify `../mm-ng-webui`.
- Do not break backend APIs or legacy WebUI behavior.
- Do not change MineMeld configuration file semantics.
- Do not put OIDC provider token handling directly in the SPA.

## License

`mm-ng-webui-vite` is licensed under the Apache License, Version 2.0, matching
the mm-ng core and legacy WebUI components.

The production container includes `LICENSE`, `NOTICE`, and
`THIRD-PARTY-NOTICES.md` in the nginx document root. Runtime package license
references are listed in `THIRD-PARTY-NOTICES.md`; full dependency metadata is
kept in `package-lock.json`.
