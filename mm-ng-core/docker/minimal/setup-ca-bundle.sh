#!/bin/sh
set -eu

LOCAL_CA_DIR="${MM_LOCAL_CA_DIR:-/var/lib/mm-ng-core/certs/site}"
CA_BUNDLE="${MM_CA_BUNDLE:-/var/lib/mm-ng-core/certs/ca-bundle.crt}"
SYSTEM_CA_BUNDLE="${MM_SYSTEM_CA_BUNDLE:-/etc/ssl/certs/ca-certificates.crt}"

mkdir -p "${LOCAL_CA_DIR}" "$(dirname "${CA_BUNDLE}")"
if [ -n "${MM_LOCAL_CA_OWNER:-}" ]; then
    chown "${MM_LOCAL_CA_OWNER}" "${LOCAL_CA_DIR}" "$(dirname "${CA_BUNDLE}")" 2>/dev/null || true
fi

tmp_bundle="$(mktemp "${CA_BUNDLE}.XXXXXX")"
trap 'rm -f "${tmp_bundle}"' EXIT
: > "${tmp_bundle}"

append_bundle() {
    source_bundle="$1"
    label="$2"

    if [ ! -s "${source_bundle}" ]; then
        return
    fi

    if ! python -c 'import ssl, sys; ssl.create_default_context(cafile=sys.argv[1])' "${source_bundle}" 2>/dev/null; then
        echo "Skipping invalid CA bundle ${label}: ${source_bundle}" >&2
        return
    fi

    {
        echo
        echo "# ${label}: ${source_bundle}"
        cat "${source_bundle}"
    } >> "${tmp_bundle}"
}

append_local_ca() {
    source_cert="$1"

    if [ ! -s "${source_cert}" ]; then
        return
    fi

    if ! python -c 'import ssl, sys; ssl.create_default_context(cafile=sys.argv[1])' "${source_cert}" 2>/dev/null; then
        echo "Skipping invalid local CA: ${source_cert}" >&2
        return
    fi

    {
        echo
        echo "# local CA: ${source_cert}"
        cat "${source_cert}"
    } >> "${tmp_bundle}"
}

append_bundle "${SYSTEM_CA_BUNDLE}" "system public CA bundle"

certifi_bundle="$(python -c 'import certifi; print(certifi.where())' 2>/dev/null || true)"
if [ -n "${certifi_bundle}" ] && [ "${certifi_bundle}" != "${SYSTEM_CA_BUNDLE}" ]; then
    append_bundle "${certifi_bundle}" "certifi public CA bundle"
fi

if [ -s "$(dirname "${CA_BUNDLE}")/bundle.crt" ] && [ "$(dirname "${CA_BUNDLE}")/bundle.crt" != "${CA_BUNDLE}" ]; then
    append_bundle "$(dirname "${CA_BUNDLE}")/bundle.crt" "legacy local CA bundle"
fi

find "${LOCAL_CA_DIR}" -maxdepth 1 -type f \( -name '*.crt' -o -name '*.pem' -o -name '*.cer' \) | sort | while IFS= read -r cert; do
    append_local_ca "${cert}"
done

if ! python -c 'import ssl, sys; ssl.create_default_context(cafile=sys.argv[1])' "${tmp_bundle}"; then
    echo "Generated CA bundle is invalid: ${tmp_bundle}" >&2
    exit 1
fi

mv "${tmp_bundle}" "${CA_BUNDLE}"
if [ -n "${MM_LOCAL_CA_OWNER:-}" ]; then
    chown "${MM_LOCAL_CA_OWNER}" "${CA_BUNDLE}" 2>/dev/null || true
fi
trap - EXIT
echo "CA bundle ready: ${CA_BUNDLE}"

exec "$@"
