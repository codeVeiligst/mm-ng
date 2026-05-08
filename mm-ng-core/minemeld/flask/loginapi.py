#  Copyright 2015-2016 Palo Alto Networks, Inc
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.

import secrets
from urllib.parse import urlencode

import requests
from flask import request, jsonify, redirect, session, current_app
import flask_login

from . import aaa
from . import config
from .logger import LOG


__all__ = ['BLUEPRINT']


BLUEPRINT = aaa.MMBlueprint('login', __name__, url_prefix='')

OIDC_CONFIG_ATTR = 'OIDC_CONFIG'
_OIDC_CONFIG = config.APIConfigDict(attribute=OIDC_CONFIG_ATTR, level=50)


def _rotate_session():
    session_interface = current_app.session_interface
    old_sid = getattr(session, 'sid', None)

    if old_sid and hasattr(session_interface, 'redis'):
        session_interface.redis.delete(session_interface.prefix + old_sid)

    session.clear()
    if hasattr(session_interface, 'generate_sid'):
        session.sid = session_interface.generate_sid()
    session.modified = True


def _oidc_config():
    value = _OIDC_CONFIG.value().get('config', {})
    if not isinstance(value, dict):
        return {}
    return value


def _oidc_status(value):
    if not value.get('enabled', False):
        return 'disabled'
    if not (value.get('issuer_url') or value.get('issuerUrl')):
        return 'misconfigured'
    if not (value.get('client_id') or value.get('clientId')):
        return 'misconfigured'
    if not value.get('scopes'):
        return 'misconfigured'
    return 'active'


def _oidc_discovery(issuer_url):
    issuer_url = issuer_url.rstrip('/')
    response = requests.get(
        '{}/.well-known/openid-configuration'.format(issuer_url),
        timeout=10
    )
    response.raise_for_status()
    return response.json()


def _oidc_redirect_uri(oidc_config=None):
    oidc_config = oidc_config or {}
    configured_uri = oidc_config.get('redirect_uri') or oidc_config.get('redirectUri')
    if configured_uri:
        return configured_uri

    forwarded_host = request.headers.get('X-Forwarded-Host')
    forwarded_proto = request.headers.get('X-Forwarded-Proto', request.scheme)
    if forwarded_host:
        return '{}://{}/auth/oidc/callback'.format(forwarded_proto, forwarded_host)

    return request.url_root.rstrip('/') + '/auth/oidc/callback'


def _normalize_scopes(scopes):
    if isinstance(scopes, list):
        return ' '.join([str(s) for s in scopes if str(s).strip()])
    if isinstance(scopes, str) and scopes.strip():
        return scopes.strip()
    return 'openid profile email'


def _claim_values(value):
    if isinstance(value, list):
        return [str(v) for v in value]
    if value is None:
        return []
    return [str(value)]


def _map_oidc_role(claims, oidc_config):
    role_claim = oidc_config.get('role_claim') or oidc_config.get('roleClaim') or 'roles'
    role_mapping = oidc_config.get('role_mapping') or oidc_config.get('roleMapping') or {}

    if not isinstance(role_mapping, dict):
        role_mapping = {}

    for claim_value in _claim_values(claims.get(role_claim)):
        mapped_role = role_mapping.get(claim_value)
        if mapped_role in ('admin', 'read-write', 'read_write'):
            return mapped_role, True
        if mapped_role in ('read-only', 'read_only'):
            return mapped_role, False

    return 'read-only', False


def _oidc_subject(claims):
    for key in ('preferred_username', 'email', 'name', 'sub'):
        value = claims.get(key)
        if value:
            return str(value)
    return None


@BLUEPRINT.route('/login', methods=['GET', 'POST'], login_required=False, read_write=False)
def login():
    username = request.values.get('u')
    if username is None:
        return jsonify(error='Missing username'), 400

    password = request.values.get('p')
    if password is None:
        return jsonify(error='Missing password'), 400

    user = aaa.check_admin_user(username, password)
    if user is None:
        return jsonify(error="Wrong credentials"), 401

    _rotate_session()
    flask_login.login_user(user)
    return 'OK'


@BLUEPRINT.route('/logout', methods=['GET', 'POST'], login_required=False, read_write=False)
def logout():
    for key in (
        '_mm_oidc_claims',
        '_mm_oidc_nonce',
        '_mm_oidc_read_write',
        '_mm_oidc_role',
        '_mm_oidc_state'
    ):
        session.pop(key, None)
    flask_login.logout_user()
    return 'OK'


@BLUEPRINT.route('/auth/oidc/status', methods=['GET'], login_required=False, read_write=False)
def oidc_status():
    oidc_config = _oidc_config()
    status = _oidc_status(oidc_config)
    return jsonify(result={
        'enabled': status == 'active',
        'status': status
    })


@BLUEPRINT.route('/auth/oidc/login', methods=['GET'], login_required=False, read_write=False)
def oidc_login():
    oidc_config = _oidc_config()
    if not oidc_config.get('enabled', False):
        return jsonify(error={'message': 'OIDC is disabled'}), 400

    issuer_url = oidc_config.get('issuer_url') or oidc_config.get('issuerUrl')
    client_id = oidc_config.get('client_id') or oidc_config.get('clientId')
    if not issuer_url or not client_id:
        return jsonify(error={'message': 'OIDC is not configured'}), 400

    try:
        discovery = _oidc_discovery(issuer_url)
    except Exception as e:
        LOG.exception('OIDC discovery failed')
        return jsonify(error={'message': str(e)}), 502

    authorization_endpoint = discovery.get('authorization_endpoint')
    if not authorization_endpoint:
        return jsonify(error={'message': 'OIDC authorization endpoint missing'}), 502

    state = secrets.token_urlsafe(24)
    nonce = secrets.token_urlsafe(24)
    session['_mm_oidc_state'] = state
    session['_mm_oidc_nonce'] = nonce

    params = {
        'response_type': 'code',
        'client_id': client_id,
        'redirect_uri': _oidc_redirect_uri(oidc_config),
        'scope': _normalize_scopes(oidc_config.get('scopes')),
        'state': state,
        'nonce': nonce
    }
    return redirect('{}?{}'.format(authorization_endpoint, urlencode(params)))


@BLUEPRINT.route('/auth/oidc/callback', methods=['GET'], login_required=False, read_write=False)
def oidc_callback():
    expected_state = session.pop('_mm_oidc_state', None)
    session.pop('_mm_oidc_nonce', None)
    if not expected_state or expected_state != request.args.get('state'):
        return jsonify(error={'message': 'Invalid OIDC state'}), 400

    code = request.args.get('code')
    if not code:
        return jsonify(error={'message': 'Missing OIDC authorization code'}), 400

    oidc_config = _oidc_config()
    issuer_url = oidc_config.get('issuer_url') or oidc_config.get('issuerUrl')
    client_id = oidc_config.get('client_id') or oidc_config.get('clientId')
    client_secret = oidc_config.get('client_secret') or oidc_config.get('clientSecret')
    if not oidc_config.get('enabled', False) or not issuer_url or not client_id:
        return jsonify(error={'message': 'OIDC is not configured'}), 400

    try:
        discovery = _oidc_discovery(issuer_url)
        token_endpoint = discovery.get('token_endpoint')
        userinfo_endpoint = discovery.get('userinfo_endpoint')
        if not token_endpoint or not userinfo_endpoint:
            return jsonify(error={'message': 'OIDC token or userinfo endpoint missing'}), 502

        token_body = {
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': _oidc_redirect_uri(oidc_config),
            'client_id': client_id
        }
        if client_secret:
            token_body['client_secret'] = client_secret

        token_response = requests.post(token_endpoint, data=token_body, timeout=10)
        token_response.raise_for_status()
        token_data = token_response.json()
        access_token = token_data.get('access_token')
        if not access_token:
            return jsonify(error={'message': 'OIDC access token missing'}), 502

        userinfo_response = requests.get(
            userinfo_endpoint,
            headers={'Authorization': 'Bearer {}'.format(access_token)},
            timeout=10
        )
        userinfo_response.raise_for_status()
        claims = userinfo_response.json()
    except Exception as e:
        LOG.exception('OIDC callback failed')
        return jsonify(error={'message': str(e)}), 502

    subject = _oidc_subject(claims)
    if not subject:
        return jsonify(error={'message': 'OIDC subject missing'}), 400

    role, read_write = _map_oidc_role(claims, oidc_config)
    _rotate_session()
    session['_mm_oidc_claims'] = {
        'sub': claims.get('sub'),
        'preferred_username': claims.get('preferred_username'),
        'email': claims.get('email'),
        'name': claims.get('name')
    }
    session['_mm_oidc_role'] = role
    session['_mm_oidc_read_write'] = read_write

    flask_login.login_user(aaa.MMAuthenticatedOIDCUser(_id=subject))
    return redirect(oidc_config.get('post_login_redirect') or '/status')
