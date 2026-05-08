FROM python:3.14-slim@sha256:5b3879b6f3cb77e712644d50262d05a7c146b7312d784a18eff7ff5462e77033

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MM_NG_SKIP_NATIVE=1 \
    MINEMELD_PROTOTYPE_PATH=/etc/mm-ng-core/prototypes \
    REDIS_URL=redis://redis:6379/0

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
        7zip \
        git \
        libleveldb-dev \
        libsnappy-dev \
        libzmq3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src/mm-ng-core

COPY pyproject.toml setup.py README.md nodes.json requirements-runtime.txt requirements-api.txt sitecustomize.py ./
COPY minemeld ./minemeld

RUN python -m pip install --upgrade pip setuptools wheel \
    && python -m pip install --no-cache-dir -r requirements-runtime.txt \
    && python -m pip install --no-cache-dir -r requirements-api.txt \
    && python -m pip install --no-cache-dir --no-build-isolation --no-deps . \
    && python -c "import shutil, site; shutil.copyfile('/src/mm-ng-core/nodes.json', site.getsitepackages()[0] + '/nodes.json')"

RUN mkdir -p /etc/mm-ng-core/prototypes /var/lib/mm-ng-core /var/log/mm-ng-core /var/run/minemeld

WORKDIR /var/lib/mm-ng-core

ENTRYPOINT ["mm-run"]
CMD ["--multiprocessing", "1", "--nodes-per-chassis", "10", "/etc/mm-ng-core/running-config.yml"]
