# mm-ng-core

`mm-ng-core` is a community-driven revival of the MineMeld-compatible core
runtime for indicator processing. It is part of the `mm-ng` project family.

The package name is `mm-ng-core`. Internal Python modules intentionally remain
under `minemeld` for compatibility with existing MineMeld configuration files
and node class names.

## Independence

This project is not affiliated with, sponsored by, or endorsed by Palo Alto
Networks.

MineMeld is a trademark of Palo Alto Networks. References to MineMeld in this
repository describe compatibility with existing configuration semantics and do
not imply affiliation.

## Minimal Docker Runtime

The included Docker setup starts:

- `mm-ng-core`, running `mm-run`
- `mm-ng-api`, running the MineMeld-compatible Flask API
- `mm-ng-traced`, running the MineMeld-compatible trace query worker
- Redis, used by the core message bus
- a minimal LocalCSV miner
- a table-backed aggregate node

The sample feed is mounted from `docker/minimal/feeds/trivial.csv`. The sample
config is shipped in `docker/minimal/running-config.yml`, then copied on first
container start into the writable runtime path
`/var/lib/mm-ng-core/config/running-config.yml`.

The shipped prototype path in `docker/minimal/prototypes/` now includes:

- `minemeld.yml` and `stdlib.yml`, imported from the deferred
  `minemeld-node-prototypes` reference repo
- `mmng.yml`, a small local library used by the minimal compose example

The deferred `minemeld-prisma-access` source was not merged into `mm-ng-core`.
It defines its own extension class and should be revived later as a separate
extension package, not as a built-in core prototype library.

Build and run:

```bash
docker compose build
docker compose up
```

Run in the background:

```bash
docker compose up -d
docker compose logs -f mm-ng-core
docker compose logs -f mm-ng-api
docker compose logs -f mm-ng-traced
```

The compose services default to `INFO` logging. To temporarily enable verbose
`DEBUG` logging, run the service command with `--verbose`:

```bash
docker compose run --rm mm-ng-core --verbose --multiprocessing 1 --nodes-per-chassis 10 /etc/mm-ng-core/running-config.yml
```

For a persistent local debug session, add `--verbose` back to the service
command in `docker-compose.yml`, then recreate the service. Remove it again for
normal operation.

The compose API service listens on `http://localhost:5000/`. Its development
credential is `admin/minemeld`, stored in
`docker/minimal/api/wsgi.htpasswd`.

The minimal image does not install native RRD/collectd metrics support. In this
compose stack, dashboard metrics are sampled by the core status loop into Redis
and served by the API through the existing `/metrics/*` endpoints. This keeps
the dashboard charts usable without restoring the legacy native metrics stack.

Editable runtime config state, including `committed-config.yml`, lives under
the bind-mounted host path `../runtime/local` at `/var/lib/mm-ng-core/config`.
The bind-mounted sample tree under `/etc/mm-ng-core` stays read-only.

Trace queries from the WebUI logs page are handled by the separate
`mm-ng-traced` service using `docker/minimal/traced.yml`.

## Differences From Original MineMeld

`mm-ng-core` currently preserves MineMeld-compatible runtime behavior where it
matters most for configs, node classes, API routes, and WebUI expectations, but
the container packaging differs from the original MineMeld distribution.

Current differences:

- `mm-run`, the Flask API, and `mm-traced` run as separate services in compose.
- The WebUI is external to the core runtime and talks to the API over HTTP.
- Dashboard metrics use Redis-backed samples when native RRD support is absent.
- The minimal image skips optional providers and other non-essential native
  integrations.

These changes were made to support the revival effort cleanly:

- modern container workflows favor one service per process boundary
- isolating engine, API, and tracing makes debugging and restart behavior much
  clearer
- avoiding the original `collectd + rrdtool` path reduces native dependency
  risk on Python 3.14
- keeping the minimal runtime small improves reproducibility and makes it
  easier to verify compatibility work incrementally

Stop and remove containers:

```bash
docker compose down
```

Remove the local runtime data as well:

```bash
rm -rf ../runtime/
```

## Local Python Checks

The local source tree can be checked without installing optional providers:

```bash
python3 -m compileall -q setup.py minemeld tests
python3 -m unittest tests.test_startupplanner tests.test_run_config
```

For a minimal local install, skip bundled native extensions:

```bash
export MM_NG_SKIP_NATIVE=1
export MINEMELD_PROTOTYPE_PATH="$PWD/docker/minimal/prototypes"
python3 -m pip install -r requirements-runtime.txt
python3 -m pip install --no-build-isolation --no-deps .
```

## Repository Status

This repository is prepared as a fresh `mm-ng-core` project. It does not depend
on archived upstream Git history. Future CI, WebUI, and optional provider work
should be added as separate, focused changes.
