# mm-ng-webui

`mm-ng-webui` is the MineMeld-compatible WebUI for the `mm-ng` project
family. It is a legacy AngularJS application that is being modernized so it
can be built and maintained with a supported Node.js toolchain.

This project is not affiliated with, sponsored by, or endorsed by Palo Alto
Networks. MineMeld is a trademark of Palo Alto Networks. References to
MineMeld describe compatibility with existing UI and API semantics.

## Frontend Stack

- AngularJS 1.5 with `ui-router`
- TypeScript application code
- Bower-managed browser dependencies
- Gulp 4 build tasks
- webpack 5 for TypeScript and legacy JavaScript bundling
- Sass compiled with Dart Sass
- nginx for the containerized static WebUI

The target build runtime is Node.js 20 LTS with npm 10.

## Local Build

```bash
npm ci
npm run bower:install
npm run build
```

The generated static WebUI is written to `dist/`.

For local development with an API proxy, use:

```bash
npm run serve -- --port 3000 --url http://127.0.0.1:5000
```

The workspace-level compose file now exposes the development API on port 5000.
Start it from the parent directory with `docker compose up -d redis core api`.
The development login is `admin/minemeld`.

## Docker Build

```bash
docker build -t mm-ng-webui .
docker run --rm -p 8080:80 mm-ng-webui
```

Open `http://localhost:8080/`.

## API Communication

The WebUI assumes same-origin API paths. The Angular services call relative
URLs such as:

- `/login` and `/logout`
- `/status`, `/status/events/...`, `/metrics`
- `/config`, `/prototype`, `/supervisor`, `/feeds`
- `/validate`, `/traced`, `/aaa`, `/logs`, `/extensions`, `/jobs`

During `gulp serve`, BrowserSync proxies those paths to the configured backend
using `--url`. In Docker, nginx proxies the same paths to the compose `api`
service and serves static assets for all other routes.

## Current Local Authentication Model

The existing UI uses a local session model:

- The login form posts URL-encoded credentials to `/login` using fields `u`
  and `p`.
- The API is expected to validate credentials and set a server-side session
  cookie, historically `mm-session`.
- The UI sets its own `mm-ec-login` cookie as a client-side hint that a user
  has logged in.
- API calls are same-origin `$resource` calls that rely on browser cookies.
- A `401` response clears the UI login state and routes back to `/login`.
- Server-sent events under `/status/events/...` also rely on same-origin
  cookie authentication.

## OIDC Requirements

Supporting OIDC should be implemented in the API/backend first, not only in
the SPA. Required backend work:

- OIDC discovery configuration for issuer, client ID, scopes, redirect URI,
  and logout URI.
- Authorization Code flow with PKCE.
- `state` and `nonce` validation.
- Callback endpoint that validates ID tokens and creates the existing
  MineMeld-compatible session.
- Role/group/claim mapping into the existing local authorization model.
- Session refresh and expiry behavior.
- Logout behavior, including optional provider-initiated or RP-initiated
  logout.
- CSRF protection for state-changing API calls.

UI changes needed later:

- Add an OIDC login action that redirects to the backend OIDC start endpoint.
- Keep local username/password login only if explicitly enabled.
- Replace cookie-only route guarding with a current-user check such as
  `/aaa/users/current`.
- Show authorization failures separately from unauthenticated sessions.
- Update logout to call the backend logout endpoint and follow any federated
  logout redirect.
- Display current user identity and mapped roles from backend claims.

OIDC differs from the current local auth model because the UI should not
handle provider tokens directly. The backend should translate OIDC identity
into a normal same-origin session so existing API calls and SSE connections can
continue to use cookies.
