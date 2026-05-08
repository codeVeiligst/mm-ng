#  Copyright 2015 Palo Alto Networks, Inc
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

from flask import Response, send_file, send_from_directory, jsonify

from . import config
from .aaa import MMBlueprint
from .logger import LOG


__all__ = ['BLUEPRINT']


BLUEPRINT = MMBlueprint('logs', __name__, url_prefix='/logs')


def _send_log(filename, env_key):
    log_file = config.get(env_key, None)
    if log_file is not None and os.path.isfile(log_file):
        return send_file(log_file, as_attachment=True, download_name=filename)

    log_directory = config.get('MINEMELD_LOG_DIRECTORY_PATH', None)
    if log_directory is None:
        return jsonify(error={'message': 'LOG_DIRECTORY not set'}), 500

    directory_log_file = os.path.join(log_directory, filename)
    if os.path.isfile(directory_log_file):
        return send_from_directory(log_directory, filename, as_attachment=True)

    return Response(
        '{} is not available yet in this container.\n'.format(filename),
        mimetype='text/plain'
    )


@BLUEPRINT.route('/minemeld-engine.log', methods=['GET'], read_write=True)
def get_minemeld_engine_log():
    return _send_log('minemeld-engine.log', 'MM_ENGINE_LOG_FILE')


@BLUEPRINT.route('/minemeld-web.log', methods=['GET'], read_write=True)
def get_minemeld_web_log():
    return _send_log('minemeld-web.log', 'MM_WEB_LOG_FILE')
