#  Copyright 2015-2017 Palo Alto Networks, Inc
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

import os
import time
import shutil
from signal import SIGHUP

import psutil
import gevent
import xmlrpc.client
import supervisor.xmlrpc

from flask import jsonify

from . import config
from .supervisorclient import MMSupervisor
from .aaa import MMBlueprint
from .logger import LOG
from .utils import committed_config_path, running_config_path


__all__ = ['BLUEPRINT']


BLUEPRINT = MMBlueprint('supervisor', __name__, url_prefix='')


def _runtime_control_dir():
    return config.get('MM_RUNTIME_CONTROL_DIR', '/var/lib/mm-ng-core/control')


def _supervisor_url():
    return config.get('SUPERVISOR_URL', 'unix:///var/run/supervisor.sock')


def _supervisor_socket_path():
    supervisorurl = _supervisor_url()
    if not supervisorurl.startswith('unix://'):
        return None

    return supervisorurl[len('unix://'):]


def _supervisor_available():
    socket_path = _supervisor_socket_path()
    if socket_path is None:
        return True

    return os.path.exists(socket_path)


def _engine_start_time():
    start_file = os.path.join(_runtime_control_dir(), 'engine-start')
    try:
        with open(start_file, 'r') as f:
            return int(f.read().strip())
    except Exception:
        return int(time.time())


def _api_start_time():
    try:
        return int(psutil.Process(os.getpid()).create_time())
    except Exception:
        return int(time.time())


def _compat_supervisor_state():
    return {
        'statename': 'RUNNING',
        'processes': {
            'minemeld-engine': {
                'statename': 'RUNNING',
                'start': _engine_start_time(),
                'children': 1
            },
            'minemeld-web': {
                'statename': 'RUNNING',
                'start': _api_start_time(),
                'children': 1
            }
        }
    }


def _request_runtime_restart():
    control_dir = _runtime_control_dir()
    os.makedirs(control_dir, exist_ok=True)
    request_file = os.path.join(control_dir, 'restart-engine')
    with open(request_file, 'w'):
        pass


def _container_restart_engine():
    shutil.copyfile(committed_config_path(), running_config_path())
    _request_runtime_restart()
    LOG.info('Requested container-native engine restart')


def _restart_engine():
    LOG.info('Restarting minemeld-engine')

    sserver = xmlrpc.client.ServerProxy(
        'http://127.0.0.1',
        transport=supervisor.xmlrpc.SupervisorTransport(
            None,
            None,
            _supervisor_url()
        )
    )

    try:
        result = sserver.supervisor.stopProcess('minemeld-engine', False)
        if not result:
            LOG.error('Stop minemeld-engine returned False')
            return

    except xmlrpc.client.Fault as e:
        LOG.error('Error stopping minemeld-engine: {!r}'.format(e))

    LOG.info('Stopped minemeld-engine for API request')

    now = time.time()
    info = None
    while (time.time()-now) < 60*10*1000:
        info = sserver.supervisor.getProcessInfo('minemeld-engine')
        if info['statename'] in ('FATAL', 'STOPPED', 'UNKNOWN', 'EXITED'):
            break
        gevent.sleep(5)
    else:
        LOG.error('Timeout during minemeld-engine restart')
        return

    sserver.supervisor.startProcess('minemeld-engine', False)
    LOG.info('Started minemeld-engine')


@BLUEPRINT.route('/supervisor', methods=['GET'], read_write=False)
def service_status():
    if not _supervisor_available():
        return jsonify(result=_compat_supervisor_state())

    try:
        supervisorstate = MMSupervisor.supervisor.getState()

    except Exception as e:
        LOG.warning('Supervisor status unavailable, using compatibility response: %s', e)
        return jsonify(result=_compat_supervisor_state())

    supervisorstate['processes'] = {}
    pinfo = MMSupervisor.supervisor.getAllProcessInfo()
    for p in pinfo:
        process = {
            'statename': p['statename'],
            'start': p['start'],
            'children': None
        }

        try:
            ps = psutil.Process(pid=p['pid'])
            process['children'] = len(ps.children())

        except:
            LOG.exception("Error retrieving childen of %d" % p['pid'])

        supervisorstate['processes'][p['name']] = process

    return jsonify(result=supervisorstate)


@BLUEPRINT.route('/supervisor/minemeld-engine/start', methods=['GET', 'POST'], read_write=True)
def start_minemeld_engine():
    if not _supervisor_available():
        return jsonify(error={
            'message': 'supervisor is not available in container mode'
        }), 400

    result = MMSupervisor.supervisor.startProcess('minemeld-engine', False)

    return jsonify(result=result)


@BLUEPRINT.route('/supervisor/minemeld-engine/stop', methods=['GET', 'POST'], read_write=True)
def stop_minemeld_engine():
    if not _supervisor_available():
        return jsonify(error={
            'message': 'supervisor is not available in container mode'
        }), 400

    result = MMSupervisor.supervisor.stopProcess('minemeld-engine', False)

    return jsonify(result=result)


@BLUEPRINT.route('/supervisor/minemeld-engine/restart', methods=['GET', 'POST'], read_write=True)
def restart_minemeld_engine():
    if not _supervisor_available():
        try:
            _container_restart_engine()
        except Exception as e:
            return jsonify(error={'message': str(e)}), 500

        return jsonify(result='OK')

    try:
        info = MMSupervisor.supervisor.getProcessInfo('minemeld-engine')
        if info['statename'] == 'STARTING' or info['statename'] == 'STOPPING':
            return jsonify(error={
                'message': ('minemeld-engine not in RUNNING state: %s' %
                            info['statename'])
            }), 400

        gevent.spawn(_restart_engine)

    except Exception as e:
        LOG.warning('Supervisor restart unavailable, using container-native restart: %s', e)
        try:
            _container_restart_engine()
        except Exception as e:
            return jsonify(error={'message': str(e)}), 500

    return jsonify(result='OK')


@BLUEPRINT.route('/supervisor/minemeld-web/hup', methods=['GET', 'POST'], read_write=True)
def hup_minemeld_web():
    if not _supervisor_available():
        return jsonify(result='OK')

    try:
        info = MMSupervisor.supervisor.getProcessInfo('minemeld-web')
        apipid = info['pid']
        os.kill(apipid, SIGHUP)
    except Exception as e:
        LOG.warning('Supervisor API hup unavailable, using no-op compatibility response: %s', e)

    return jsonify(result='OK')
