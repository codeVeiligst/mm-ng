# mm-ng Local Compose

This workspace-level compose file runs the current `mm-ng` development stack:

- `mm-ng-core`: the MineMeld-compatible core runtime, running `mm-run`
- `mm-ng-api`: the MineMeld-compatible HTTP API used by the WebUI
- `mm-ng-traced`: the MineMeld-compatible trace query worker used by the logs UI
- `redis`: message bus dependency for the core runtime
- `mm-ng-webui`: static AngularJS WebUI served by nginx
- `mm-ng-webui-vite`: modern React/Vite WebUI served by nginx

Both WebUI containers proxy API paths such as `/login`, `/status`, `/config`,
`/aaa`, and `/auth` to the `mm-ng-api` service. The core worker and API share
Redis and the same minimal config.

The shipped sample config remains read-only under `/etc/mm-ng-core`. On first
start, `core` and `api` copy `running-config.yml` into the writable runtime
path `/var/lib/mm-ng-core/config/running-config.yml`, and UI commits write
`committed-config.yml` in that same runtime directory.

In this workspace, that writable runtime directory is bind-mounted from:

- `./runtime/local` -> `/var/lib/mm-ng-core`
- `./runtime/run` -> `/var/run/minemeld`

The `runtime/` tree is ignored by git so imported legacy MineMeld state stays
local to your machine.

The core process runs from `/var/lib/mm-ng-core/data`, matching the original
MineMeld layout where node LevelDB folders and checkpoint files live under
`./runtime/local/data`. Core startup also removes stale IPC socket files from
`./runtime/run`; those files are runtime-only bus sockets and can otherwise
survive an unclean restart.

Local CA trust is also stored under the runtime tree:

- `./runtime/local/certs/site` -> drop internal CA files here (`.crt`, `.pem`, or `.cer`)
- `./runtime/local/certs/ca-bundle.crt` -> generated on container startup

The generated bundle contains the container's public global trust roots, the
Python `certifi` public roots when present, the legacy
`./runtime/local/certs/bundle.crt` if it exists, and every valid CA file in
`./runtime/local/certs/site`. The core, API, and traced containers point
`REQUESTS_CA_BUNDLE`, `SSL_CERT_FILE`, and `CURL_CA_BUNDLE` at that generated
bundle, so Python `requests`, OpenSSL defaults, and curl-compatible tools share
the same trust configuration. By default compose makes the local CA directory
writable by UID/GID `1002:1002`; override this with `LOCAL_UID` and `LOCAL_GID`
when running compose from a different host user.

The compose prototype path is populated from `mm-ng-core/docker/minimal/prototypes/`.
That directory now ships the deferred `minemeld-node-prototypes` base libraries
(`minemeld.yml` and `stdlib.yml`) plus a small local `mmng.yml` used by the
minimal LocalCSV example. The deferred `minemeld-prisma-access` source is kept
out of core for now because it is an extension with its own custom node class.

## Extension Install Security

Installing or activating an extension from Git is a privileged operation. The
extension workflow fetches third-party source code and activates it inside the
API/core Python environment, so it should be treated as equivalent to running
trusted admin code on the mm-ng host.

Only install extensions from repositories and revisions you trust. Keep the
extension routes restricted to authenticated administrators, review extension
source before activation, and prefer pinned tags or commit SHAs over mutable
branches for repeatable deployments.

## Build and Run

```bash
docker compose build
docker compose up -d
docker compose logs -f mm-ng-core
docker compose logs -f mm-ng-api
docker compose logs -f mm-ng-traced
```

By default, the core, API, and traced services run at `INFO` logging level.
To temporarily enable verbose `DEBUG` logging, override the command for the
service you are troubleshooting:

```bash
docker compose run --rm core --verbose --multiprocessing 16 --nodes-per-chassis 10 /var/lib/mm-ng-core/config/running-config.yml
docker compose run --rm api --host 0.0.0.0 --port 5000 --verbose
docker compose run --rm traced /etc/mm-ng-core/traced.yml --verbose
```

For a persistent local debug session, add `--verbose` back to the matching
service command in `docker-compose.yml`, then recreate that service. Remove it
again before normal operation to avoid noisy DEBUG logs.

Open the WebUI container at:

```text
http://localhost:8080/
```

The modern React/Vite WebUI can run alongside it at:

```text
http://localhost:8088/
```

## How This Differs From Original MineMeld

This compose stack is intentionally not a verbatim recreation of the original
MineMeld appliance layout.

Key differences:

- `mm-run`, the HTTP API, and the trace worker run as separate containers
  instead of being supervised together inside one appliance-style runtime.
- The WebUI is served as a separate static nginx container.
- Redis-backed sampled metrics are used for dashboard charts instead of the
  original `collectd + rrdtool` pipeline.
- Optional legacy providers and native integrations are not part of the
  minimal stack by default.
- The stack is being revived for modern Python and container workflows rather
  than for the original VM/appliance model.

Why this was done:

- Separate containers make failures easier to isolate and debug while the
  revival is still stabilizing.
- One long-running process per container is a better fit for current Docker
  operations than the original supervisor-centric layout.
- The original metrics path is the most fragile native dependency chain in the
  project; replacing it with Redis-backed samples keeps the dashboard usable
  without reintroducing `collectd` and `rrdtool`.
- Keeping the minimal stack small reduces rebuild time, narrows the support
  surface, and makes Python 3.14 compatibility work easier to verify.
- Compatibility is preserved at the MineMeld API/config level where practical,
  while the runtime packaging is modernized for `mm-ng`.

For local WebUI development with `gulp serve`, point BrowserSync at the API:

```bash
cd mm-ng-webui
npm run serve -- --port 3000 --url http://localhost:5000
```

For local development of the modern React/Vite WebUI, run:

```bash
cd mm-ng-webui-vite
npm install
npm run dev
```

Open `http://localhost:5173/`. The Vite dev server proxies the same MineMeld
API paths to `http://localhost:5000` by default. This UI coexists with the
AngularJS `mm-ng-webui` during the feature-parity transition and now covers the
primary operator/admin workflows: dashboard charts, nodes, node detail, graph,
whitelist indicators, prototypes, configuration commit, logs, system status,
local users, feed users, and OIDC configuration.

To run the new WebUI as a container alongside the legacy WebUI:

```bash
docker compose up -d --build webui-vite
```

The legacy AngularJS WebUI remains on `http://localhost:8080/`; the React/Vite
WebUI runs on `http://localhost:8088/`.

The local development login is:

```text
admin / minemeld
```

Stop the stack:

```bash
docker compose down
```

Remove runtime data too:

```bash
docker compose down -v
```

With the current bind-mounted runtime layout, remove local runtime state with:

```bash
rm -rf runtime/
```

## Auth Flows

### Existing Local Session Flow

1. Browser loads the static WebUI.
2. User submits username and password to `POST /login` with form fields `u`
   and `p`.
3. The API validates credentials and sets a same-origin session cookie.
4. The UI records a client-side `mm-ec-login` hint cookie.
5. API calls and `/status/events/...` SSE connections use the browser session
   cookie.
6. A `401` response clears the UI login state and routes the browser to
   `/login`.

This flow is active in the compose stack through the `mm-ng-api` service. The
included `admin/minemeld` account is a local development credential backed by
`mm-ng-core/docker/minimal/api/wsgi.htpasswd`.

### OIDC Session Flow

OIDC is additive and disabled unless explicitly configured through the modern
WebUI Admin authentication page or the corresponding backend configuration.
Local authentication remains available and remains compatible with the legacy
WebUI.

1. Browser clicks an OIDC login action in the modern WebUI.
2. Browser is redirected to a backend endpoint such as `/auth/oidc/login`.
3. Backend starts the OIDC authorization flow with the configured provider.
4. Provider redirects back to a backend callback.
5. Backend validates `state`, `nonce`, and ID token claims.
6. Backend maps claims/groups to local MineMeld-compatible roles.
7. Backend creates the same kind of same-origin session used by existing API
   calls.
8. WebUI calls `/aaa/users/current` to discover identity and authorization.
9. Logout calls the backend, clears the local session, and optionally follows
   provider logout.

The SPA does not store provider tokens directly.

## Current Limitation

The container stack intentionally skips the legacy `collectd + rrdtool` path.
Instead, the core records sampled dashboard metrics into Redis and the API
serves those samples through the existing `/metrics/*` endpoints. This keeps
the dashboard charts working without restoring the native RRD dependency chain.

The tracing UI requires the separate `mm-ng-traced` worker. That service is
part of the compose stack and handles `/traced/query` requests used by the logs
page.

Login, session handling, local and OIDC auth, status/config/prototype routes,
tracing, metrics, and the core message bus path are wired for local
development. Remaining work is tracked in `mm-ng-roadmap.md` and is focused on
CI, release hardening, selected legacy parity gaps, and broader provider
verification.
