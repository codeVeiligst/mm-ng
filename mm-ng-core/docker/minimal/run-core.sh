#!/bin/sh
set -eu

RUNTIME_CONFIG_DIR="${MM_RUNTIME_CONFIG_DIR:-/var/lib/mm-ng-core/config}"
CONTROL_DIR="${MM_RUNTIME_CONTROL_DIR:-/var/lib/mm-ng-core/control}"
DATA_DIR="${MM_RUNTIME_DATA_DIR:-/var/lib/mm-ng-core/data}"
RUN_DIR="${MM_RUNTIME_RUN_DIR:-/var/run/minemeld}"
REQUEST_FILE="${CONTROL_DIR}/restart-engine"
START_FILE="${CONTROL_DIR}/engine-start"

mkdir -p "${CONTROL_DIR}" "${DATA_DIR}" "${RUN_DIR}"

/bin/sh /etc/mm-ng-core/init-runtime-config.sh true
find "${RUN_DIR}" -mindepth 1 -maxdepth 1 -type s -delete
cd "${DATA_DIR}"

while true; do
    date +%s > "${START_FILE}"
    "$@" &
    child_pid=$!

    while kill -0 "${child_pid}" 2>/dev/null; do
        if [ -f "${REQUEST_FILE}" ]; then
            rm -f "${REQUEST_FILE}"
            kill -TERM "${child_pid}" 2>/dev/null || true
            wait "${child_pid}" || true
            child_pid=""
            break
        fi

        sleep 1
    done

    if [ -n "${child_pid:-}" ]; then
        wait "${child_pid}"
        status=$?
        exit "${status}"
    fi
done
