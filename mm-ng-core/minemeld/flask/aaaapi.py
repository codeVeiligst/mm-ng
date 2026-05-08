#  Copyright 2016 Palo Alto Networks, Inc
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

import collections

from flask import request, jsonify, session
from flask_login import current_user

from . import config
from .aaa import MMBlueprint
from .logger import LOG


__all__ = ['BLUEPRINT']


BLUEPRINT = MMBlueprint('aaa', __name__, url_prefix='/aaa')

# if you change things here change also backup/import API
API_USERS_ATTRS_ATTR = 'API_USERS_ATTRS'
FEEDS_USERS_ATTRS_ATTR = 'FEEDS_USERS_ATTRS'
FEEDS_ATTRS_ATTR = 'FEEDS_ATTRS'
OIDC_CONFIG_ATTR = 'OIDC_CONFIG'


Subsystem = collections.namedtuple(
    'Subsystem',
    ['authdb', 'attrs', 'enabled', 'enabled_default']
)


_SUBSYSTEM_MAP = {
    'api': Subsystem(
        authdb='USERS_DB',
        enabled='API_AUTH_ENABLED',
        enabled_default=True,
        attrs=config.APIConfigDict(attribute=API_USERS_ATTRS_ATTR, level=50)
    ),
    'feeds': Subsystem(
        authdb='FEEDS_USERS_DB',
        enabled='FEEDS_AUTH_ENABLED',
        enabled_default=False,
        attrs=config.APIConfigDict(attribute=FEEDS_USERS_ATTRS_ATTR, level=50)
    )
}


_FEEDS_ATTRS = config.APIConfigDict(attribute=FEEDS_ATTRS_ATTR, level=50)
_OIDC_CONFIG = config.APIConfigDict(attribute=OIDC_CONFIG_ATTR, level=50)


def _oidc_config():
    value = _OIDC_CONFIG.value().get('config', {})
    if not isinstance(value, dict):
        return {}
    return value


def _sanitize_oidc_config(value):
    result = dict(value)
    result.pop('client_secret', None)
    result.pop('clientSecret', None)
    result['client_secret_configured'] = bool(
        value.get('client_secret') or value.get('clientSecret')
    )
    result['status'] = _oidc_status(value)
    return result


def _oidc_status(value):
    if not value.get('enabled', False):
        return 'disabled'

    required = (
        value.get('issuer_url') or value.get('issuerUrl'),
        value.get('client_id') or value.get('clientId'),
        value.get('scopes')
    )
    if not all(required):
        return 'misconfigured'

    return 'active'


def _normalize_oidc_config(value, previous=None):
    if not isinstance(value, dict):
        raise ValueError('Configuration should be a dict')

    previous = previous or {}
    result = {
        'enabled': bool(value.get('enabled', False)),
        'issuer_url': value.get('issuer_url') or value.get('issuerUrl') or '',
        'client_id': value.get('client_id') or value.get('clientId') or '',
        'scopes': value.get('scopes') or ['openid', 'profile', 'email'],
        'role_claim': value.get('role_claim') or value.get('roleClaim') or 'roles',
        'role_mapping': value.get('role_mapping') or value.get('roleMapping') or {},
        'redirect_uri': value.get('redirect_uri') or value.get('redirectUri') or '',
        'post_login_redirect': value.get('post_login_redirect') or value.get('postLoginRedirect') or '/status'
    }

    client_secret = value.get('client_secret') or value.get('clientSecret')
    if client_secret is not None:
        result['client_secret'] = client_secret
    elif previous.get('client_secret') or previous.get('clientSecret'):
        result['client_secret'] = previous.get('client_secret') or previous.get('clientSecret')

    if isinstance(result['scopes'], str):
        result['scopes'] = [s for s in result['scopes'].split() if s]
    if not isinstance(result['scopes'], list):
        raise ValueError('Scopes should be a list or space-separated string')

    if not isinstance(result['role_mapping'], dict):
        raise ValueError('Role mapping should be a dict')

    return result


@BLUEPRINT.route('/users/current', methods=['GET'], read_write=False)
def get_current_user():
    result = {
        'id': current_user.get_id(),
        'read_write': current_user.is_read_write()
    }

    if result['id'].startswith('oidc/'):
        result['auth_method'] = 'oidc'
        result['provider'] = 'oidc'
        result['role'] = session.get('_mm_oidc_role', 'read-only')
        claims = session.get('_mm_oidc_claims', {})
        if isinstance(claims, dict):
            result['username'] = (
                claims.get('preferred_username') or
                claims.get('email') or
                claims.get('name') or
                result['id'][5:]
            )
    else:
        result['auth_method'] = 'local'
        username = result['id'][6:] if result['id'].startswith('admin/') else result['id']
        user_attrs = _SUBSYSTEM_MAP['api'].attrs.value().get(username, {})
        result['role'] = user_attrs.get('role') or ('read-write' if result['read_write'] else 'read-only')

    return jsonify(result=result)


@BLUEPRINT.route('/users/<subsystem>', methods=['GET'], read_write=False)
def get_users(subsystem):
    subsystem = _SUBSYSTEM_MAP.get(subsystem, None)
    if subsystem is None:
        return jsonify(error='Invalid subsystem'), 400

    result = {
        'enabled': config.get(subsystem.enabled, subsystem.enabled_default),
        'users': {}
    }
    users = config.get(subsystem.authdb).users()
    users_attrs = subsystem.attrs.value()
    for u in users:
        attrs = {}
        if u in users_attrs:
            attrs = users_attrs[u]
        result['users'][u] = attrs

    return jsonify(result=result)


@BLUEPRINT.route('/users/<subsystem>/<username>', methods=['PUT'], read_write=True)
def set_user_password(subsystem, username):
    subsystem = _SUBSYSTEM_MAP.get(subsystem, None)
    if subsystem is None:
        return jsonify(error='Invalid subsystem'), 400

    with config.lock():
        users_db = config.get(subsystem.authdb)
        if not users_db.path:
            return jsonify(error='Users database not available'), 500

        try:
            password = request.get_json()['password']
        except Exception:
            return jsonify(error='Invalid request'), 400

        users_db.set_password(username, password)
        users_db.save()

        return jsonify(result='ok')


@BLUEPRINT.route('/users/<subsystem>/<username>/attributes', methods=['POST'], read_write=True)
def set_user_attributes(subsystem, username):
    subsystem = _SUBSYSTEM_MAP.get(subsystem, None)
    if subsystem is None:
        return jsonify(error='Invalid subsystem'), 400

    with config.lock():
        users_db = config.get(subsystem.authdb)
        if not users_db.path:
            return jsonify(error='Users database not available'), 500

        if username not in users_db.users():
            return jsonify(error='Unknown user'), 400

        try:
            attributes = request.get_json()
        except Exception:
            return jsonify(error='Invalid request'), 400

        if not isinstance(attributes, dict):
            return jsonify(error='Attributes should be a dict'), 400

        subsystem.attrs.set(username, attributes)

        return jsonify(result='ok')


@BLUEPRINT.route('/users/<subsystem>/<username>', methods=['DELETE'], read_write=True)
def delete_user(subsystem, username):
    subsystem = _SUBSYSTEM_MAP.get(subsystem, None)
    if subsystem is None:
        return jsonify(error='Invalid subsystem'), 400

    with config.lock():
        users_db = config.get(subsystem.authdb)
        if not users_db.path:
            return jsonify(error='Users database not available'), 500

        # delete user from database and tags
        if users_db.delete(username):
            users_db.save()

        subsystem.attrs.delete(username)

        return jsonify(result='ok')


@BLUEPRINT.route('/feeds', methods=['GET'], read_write=False)
def get_feeds():
    result = {
        'enabled': config.get(
            _SUBSYSTEM_MAP['feeds'].enabled,
            _SUBSYSTEM_MAP['feeds'].enabled_default
        ),
        'feeds': _FEEDS_ATTRS.value()
    }
    return jsonify(result=result)


@BLUEPRINT.route('/feeds/<feedname>/attributes', methods=['PUT', 'POST'], read_write=True)
def set_feed_attributes(feedname):
    with config.lock():
        try:
            attributes = request.get_json()
        except Exception:
            return jsonify(error='Invalid request'), 400

        if not isinstance(attributes, dict):
            return jsonify(error='Attributes should be a dict'), 400

        _FEEDS_ATTRS.set(feedname, attributes)

        return jsonify(result='ok')


@BLUEPRINT.route('/feeds/<feedname>', methods=['DELETE'], read_write=True)
def delete_feed(feedname):
    with config.lock():
        _FEEDS_ATTRS.delete(feedname)

        return jsonify(result='ok')


@BLUEPRINT.route('/tags', methods=['GET'], read_write=False)
def get_tags():
    tags = set()

    for _, subsystem in _SUBSYSTEM_MAP.items():
        for _, attributes in subsystem.attrs.value().items():
            if 'tags' in attributes:
                for t in attributes['tags']:
                    tags.add(t)
    for _, attributes in _FEEDS_ATTRS.value().items():
        if 'tags' in attributes:
            for t in attributes['tags']:
                tags.add(t)

    return jsonify(result=list(tags - set(['any', 'anonymous'])))


@BLUEPRINT.route('/oidc/config', methods=['GET'], read_write=False)
def get_oidc_config():
    return jsonify(result=_sanitize_oidc_config(_oidc_config()))


@BLUEPRINT.route('/oidc/config', methods=['PUT'], read_write=True)
def set_oidc_config():
    try:
        body = request.get_json()
        oidc_config = _normalize_oidc_config(body, previous=_oidc_config())
    except Exception as e:
        return jsonify(error={'message': str(e)}), 400

    with config.lock():
        _OIDC_CONFIG.set('config', oidc_config)

    return jsonify(result=_sanitize_oidc_config(oidc_config))
