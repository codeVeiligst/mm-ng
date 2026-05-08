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

import json
import base64
import hmac
from functools import wraps
from urllib.parse import urlparse

import gevent
import gevent.lock
import flask_login
from flask import current_app, Blueprint, request, session

from . import config
from .logger import LOG


ANONYMOUS = 'mm-anonymous'
PREVENT_WRITE_GUARD = None
PREVENT_WRITE = None
CSRF_SESSION_KEY = '_mm_csrf_token'
CSRF_HEADER_NAMES = ('X-CSRF-Token', 'X-XSRF-TOKEN')


def _is_authenticated(user):
    result = user.is_authenticated
    if callable(result):
        return result()
    return result


def _request_host():
    return request.headers.get('X-Forwarded-Host') or request.host


def _request_scheme():
    return request.headers.get('X-Forwarded-Proto') or request.scheme


def _same_origin_url(value):
    if not value:
        return None
    if value == 'null':
        return False

    parsed = urlparse(value)
    if not parsed.scheme or not parsed.netloc:
        return True

    return parsed.scheme == _request_scheme() and parsed.netloc == _request_host()


def _same_origin_request():
    origin = request.headers.get('Origin')
    if origin:
        return _same_origin_url(origin)

    referer = request.headers.get('Referer')
    if referer:
        return _same_origin_url(referer)

    # Compatibility mode for legacy clients and direct API tooling. Set
    # CSRF_STRICT=True to require a token or same-origin Origin/Referer.
    return not config.get('CSRF_STRICT', False)


def _csrf_token_valid():
    expected = session.get(CSRF_SESSION_KEY)
    if not expected:
        return False

    supplied = None
    for header_name in CSRF_HEADER_NAMES:
        supplied = request.headers.get(header_name)
        if supplied:
            break

    if not supplied:
        supplied = request.values.get('_csrf')

    if not supplied:
        return False

    return hmac.compare_digest(str(expected), str(supplied))


def _csrf_allowed(read_write, feeds):
    if not read_write or feeds:
        return True

    authorization = request.headers.get('Authorization', '')
    if authorization.lower().startswith('basic '):
        return True

    if _csrf_token_valid():
        return True

    if _same_origin_request():
        LOG.warning(
            'CSRF token missing for same-origin-compatible request: %s %s',
            request.method,
            request.path
        )
        return True

    return False


def disable_prevent_write(locker):
    global PREVENT_WRITE

    with PREVENT_WRITE_GUARD:
        if PREVENT_WRITE == locker:
            LOG.info('Disabled prevent write from locker {}'.format(locker))
            PREVENT_WRITE = None


def enable_prevent_write(locker, timeout=900):
    global PREVENT_WRITE

    def _cleanup_prevent_write():
        gevent.sleep(timeout)
        LOG.info('Checking if prevent write still enabled by locker {}'.format(locker))
        disable_prevent_write(locker)

    with PREVENT_WRITE_GUARD:
        if PREVENT_WRITE is None:
            PREVENT_WRITE = locker
            gevent.spawn(_cleanup_prevent_write)

    return False


class MMBlueprint(Blueprint):
    def __init__(self, *args, **kwargs):
        super(MMBlueprint, self).__init__(*args, **kwargs)

        self.send_static_file = self._login_required(
            super(MMBlueprint, self).send_static_file,
            login_required=True,
            read_write=False,
            feeds=False
        )

    def _audit(self, f, audit_required):
        if not audit_required:
            return f

        @wraps(f)
        def audited_view(*args, **kwargs):
            if request and flask_login.current_user:
                params = []

                for key, values in request.values.lists():
                    if key == '_':
                        continue

                    params.append(('value:{}'.format(key), values))

                for filename, files in request.files.lists():
                    params.append(('file:{}'.format(filename), [file.filename for file in files]))

                body = request.get_json(silent=True)
                if body is not None:
                    params.append(['jsonbody', json.dumps(body)[:1024]])

                LOG.audit(
                    user_id=flask_login.current_user.get_id(),
                    action_name='{} {}'.format(request.method, request.path),
                    params=params
                )

            else:
                LOG.critical('no request or current_user in audited_view')

            return f(*args, **kwargs)

        return audited_view

    def _login_required(self, f, login_required, read_write, feeds):
        @wraps(f)
        def decorated_view(*args, **kwargs):
            if not login_required:
                return f(*args, **kwargs)

            if not config.get('API_AUTH_ENABLED', True) and not feeds:
                return f(*args, **kwargs)

            if not config.get('FEEDS_AUTH_ENABLED', False) and feeds:
                return f(*args, **kwargs)

            if not feeds:
                if not _is_authenticated(flask_login.current_user):
                    return current_app.login_manager.unauthorized()
                if flask_login.current_user.get_id().startswith('feeds/'):
                    return current_app.login_manager.unauthorized()

            if read_write and not flask_login.current_user.is_read_write():
                return 'Forbidden', 403

            if not _csrf_allowed(read_write, feeds):
                return 'Forbidden - invalid CSRF token', 403

            return f(*args, **kwargs)

        return decorated_view

    def _write_prevented(self, f, read_write):
        @wraps(f)
        def decorated_view(*args, **kwargs):
            if read_write and PREVENT_WRITE is not None:
                return 'Changes disabled by {}'.format(PREVENT_WRITE), 403

            return f(*args, **kwargs)

        return decorated_view

    def route(self, rule, **options):
        def decorator(f):
            login_required = options.pop('login_required', True)
            read_write = options.pop('read_write', True)
            feeds = options.pop("feeds", False)

            super_decorator = super(MMBlueprint, self).route(rule, **options)

            _wp_f = self._write_prevented(f, read_write)
            _lr_f = self._login_required(_wp_f, login_required, read_write, feeds)
            _audit_f = self._audit(_lr_f, read_write)

            return super_decorator(_audit_f)

        return decorator


class MMAnonynmousUser(object):
    def __init__(self):
        self._id = ANONYMOUS

    def get_id(self):
        return self._id

    def is_authenticated(self):
        return False

    def is_active(self):
        return True

    def is_anonymous(self):
        return True

    def is_read_write(self):
        return False

    def check_feed(self, feedname):
        if not config.get('FEEDS_AUTH_ENABLED', False):
            return True

        fattributes = config.get('FEEDS_ATTRS', None)
        if fattributes is None or feedname not in fattributes:
            return False
        ftags = set(fattributes[feedname].get('tags', []))

        if 'anonymous' in ftags:
            return True

        return False

class MMAuthenticatedUser(object):
    def __init__(self, _id=None):
        self._id = str(_id)

    def get_id(self):
        return self._id

    def is_authenticated(self):
        return True

    def is_active(self):
        return True

    def is_anonymous(self):
        return False


class MMAuthenticatedAdminUser(MMAuthenticatedUser):
    def __init__(self, _id):
        super(MMAuthenticatedAdminUser, self).__init__(_id='admin/{}'.format(_id))

    def is_read_write(self):
        user_attrs = config.get('API_USERS_ATTRS', {})
        role = user_attrs.get(self._id[6:], {}).get('role')
        if role in ('admin', 'read-write', 'read_write'):
            return True
        if role in ('read-only', 'read_only'):
            return False

        read_write = config.get('READ_WRITE', None)
        if read_write is None:
            return True

        if isinstance(read_write, str) or isinstance(read_write, str):
            read_write = read_write.split(',')
        elif not isinstance(read_write, list):
            LOG.error('Unknown READ_WRITE format')
            return False

        if self._id[6:] in read_write:
            return True

        return False

    def check_feed(self, feedname):
        return True


class MMAuthenticatedOIDCUser(MMAuthenticatedUser):
    def __init__(self, _id):
        super(MMAuthenticatedOIDCUser, self).__init__(_id='oidc/{}'.format(_id))

    def is_read_write(self):
        return bool(session.get('_mm_oidc_read_write', False))

    def check_feed(self, feedname):
        return True


class MMAuthenticatedFeedUser(MMAuthenticatedUser):
    def __init__(self, _id):
        super(MMAuthenticatedFeedUser, self).__init__(_id='feeds/{}'.format(_id))

    def is_read_write(self):
        # this should never be called
        return False

    def check_feed(self, feedname):
        if not config.get('FEEDS_AUTH_ENABLED', False):
            return True

        fattributes = config.get('FEEDS_ATTRS', None)
        if fattributes is None or feedname not in fattributes:
            return False
        ftags = set(fattributes[feedname].get('tags', []))

        # if 'any' is present, any authenticated user can access
        # the feed
        if 'any' in ftags:
            return True

        uattributes = config.get('FEEDS_USERS_ATTRS', None)
        if uattributes is None or self._id[6:] not in uattributes:
            return False
        tags = set(uattributes[self._id[6:]].get('tags', []))

        return len(tags.intersection(ftags)) != 0


def authenticated_user_factory(_id):
    if _id.startswith('feeds/'):
        return MMAuthenticatedFeedUser(_id=_id[6:])

    if _id.startswith('admin/'):
        return MMAuthenticatedAdminUser(_id=_id[6:])

    if _id.startswith('oidc/'):
        return MMAuthenticatedOIDCUser(_id=_id[5:])

    if _id == ANONYMOUS:
        return MMAnonynmousUser()

    raise RuntimeError('Unknown user_id prefix: {}'.format(_id))


LOGIN_MANAGER = flask_login.LoginManager()
LOGIN_MANAGER.session_protection = None
LOGIN_MANAGER.anonymous_user = MMAnonynmousUser


@LOGIN_MANAGER.request_loader
def request_loader(request):
    api_key = request.headers.get('Authorization')
    if api_key is None:
        return None

    api_key = api_key.replace('Basic', '', 1)

    try:
        api_key = base64.b64decode(api_key)
    except TypeError:
        return None

    if isinstance(api_key, bytes):
        api_key = api_key.decode('utf-8')

    try:
        user, password = api_key.split(':', 1)
    except ValueError:
        return None

    auth_user = check_feeds_user(user, password)
    if auth_user is not None:
        return auth_user

    auth_user = check_admin_user(user, password)
    if auth_user is not None:
        return auth_user

    return None


@LOGIN_MANAGER.user_loader
def user_loader(_id):
    return authenticated_user_factory(_id)


def check_feeds_user(username, password):
    if not config.get('FEEDS_USERS_DB').check_password(username, password):
        return None

    return MMAuthenticatedFeedUser(_id=username)


def check_admin_user(username, password):
    if not config.get('USERS_DB').check_password(username, password):
        return None

    return MMAuthenticatedAdminUser(_id=username)


@LOGIN_MANAGER.unauthorized_handler
def unauthorized():
    return 'Unauthorized', 401


def init_app(app):
    global PREVENT_WRITE
    global PREVENT_WRITE_GUARD

    app.config['REMEMBER_COOKIE_NAME'] = None  # to block remember cookie
    LOGIN_MANAGER.init_app(app)

    # initialize PREVENT_WRITE
    PREVENT_WRITE_GUARD = gevent.lock.BoundedSemaphore()
    PREVENT_WRITE = None
