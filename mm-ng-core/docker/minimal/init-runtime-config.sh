#!/bin/sh
set -eu

RUNTIME_CONFIG_DIR="${MM_RUNTIME_CONFIG_DIR:-/var/lib/mm-ng-core/config}"
SAMPLE_CONFIG_DIR="${MM_SAMPLE_CONFIG_DIR:-/etc/mm-ng-core}"
LOCAL_LIBRARY_DIR="${MINEMELD_LOCAL_LIBRARY_PATH:-/var/lib/mm-ng-core/library}"
LOG_DIRECTORY="${MINEMELD_LOG_DIRECTORY_PATH:-/var/log/mm-ng-core}"

mkdir -p "${RUNTIME_CONFIG_DIR}" "${LOCAL_LIBRARY_DIR}" "${LOG_DIRECTORY}"

if [ -f /etc/mm-ng-core/setup-ca-bundle.sh ]; then
    /bin/sh /etc/mm-ng-core/setup-ca-bundle.sh true
fi

for name in running-config.yml committed-config.yml; do
    if [ -f "${SAMPLE_CONFIG_DIR}/${name}" ] && [ ! -f "${RUNTIME_CONFIG_DIR}/${name}" ]; then
        cp "${SAMPLE_CONFIG_DIR}/${name}" "${RUNTIME_CONFIG_DIR}/${name}"
    fi
done

if [ -d "${SAMPLE_CONFIG_DIR}/api" ]; then
    mkdir -p "${RUNTIME_CONFIG_DIR}/api"
    for path in "${SAMPLE_CONFIG_DIR}"/api/*; do
        [ -e "${path}" ] || continue
        name="$(basename "${path}")"
        if [ ! -e "${RUNTIME_CONFIG_DIR}/api/${name}" ]; then
            cp -R "${path}" "${RUNTIME_CONFIG_DIR}/api/${name}"
        fi
    done
fi

if [ ! -f "${RUNTIME_CONFIG_DIR}/running-config.yml" ]; then
    echo "missing runtime running-config.yml" >&2
    exit 1
fi

exec "$@"
