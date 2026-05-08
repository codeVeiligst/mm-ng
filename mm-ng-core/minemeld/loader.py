import logging
import importlib
import json
import os
import os.path

try:
    from pkg_resources import working_set, WorkingSet
except ModuleNotFoundError:
    from importlib.metadata import entry_points

    working_set = None
    WorkingSet = None

from collections import namedtuple

LOG = logging.getLogger(__name__)

MM_NODES_ENTRYPOINT = 'minemeld_nodes'
MM_NODES_GCS_ENTRYPOINT = 'minemeld_nodes_gcs'
MM_NODES_VALIDATORS_ENTRYPOINT = 'minemeld_nodes_validators'
MM_PROTOTYPES_ENTRYPOINT = 'minemeld_prototypes'
MM_API_ENTRYPOINT = 'minemeld_api'
MM_WEBUI_ENTRYPOINT = 'minemeld_webui'

MMEntryPoint = namedtuple(
    'MMEntryPoint',
    ['ep', 'name', 'loadable', 'conflicts']
)

_ENTRYPOINT_GROUPS = {}

_WS = None


class _SourceEntryPoint(object):
    def __init__(self, target):
        self.target = target

    def load(self):
        if ':' in self.target:
            module_name, attr_name = self.target.split(':', 1)
        else:
            module_name, attr_name = self.target.rsplit('.', 1)
        module = importlib.import_module(module_name)
        return getattr(module, attr_name)


def _conflicts(requirements, installed):
    result = []

    for r in requirements:
        installed_dist = installed.get(r.project_name, None)
        if installed_dist is None:
            result.append('{} not installed'.format(r.project_name))
            continue

        if installed_dist.version not in r:
            result.append('{}=={} not compatible with {}'.format(
                installed_dist.project_name,
                installed_dist.version,
                str(r)
            ))

    return result


def _initialize_entry_point_group(entrypoint_group):
    global _WS

    if WorkingSet is None:
        result = {}
        eps = entry_points()
        if hasattr(eps, 'select'):
            eps = eps.select(group=entrypoint_group)
        else:
            eps = eps.get(entrypoint_group, [])

        for ep in eps:
            result[ep.name] = MMEntryPoint(
                ep=ep,
                name=ep.name,
                conflicts=[],
                loadable=True
            )

        _ENTRYPOINT_GROUPS[entrypoint_group] = result
        return

    installed = {d.project_name: d for d in working_set}

    if _WS is None:
        _WS = WorkingSet()

    cache = {}
    result = {}
    for ep in _WS.iter_entry_points(entrypoint_group):
        egg_name = ep.dist.egg_name()
        conflicts = cache.get(egg_name, None)
        if conflicts is None:
            conflicts = _conflicts(
                ep.dist.requires(),
                installed
            )
            cache[egg_name] = conflicts

        if len(conflicts) != 0:
            LOG.error('{} not loadable: {}'.format(
                ep.name,
                ', '.join(conflicts)
            ))
        result[ep.name] = MMEntryPoint(
            ep=ep,
            name=ep.name,
            conflicts=conflicts,
            loadable=(len(conflicts) == 0)
        )

    _ENTRYPOINT_GROUPS[entrypoint_group] = result


def _load_source_node_entry_points(entrypoint_group):
    key_map = {
        MM_NODES_ENTRYPOINT: 'class',
        MM_NODES_GCS_ENTRYPOINT: 'gc',
        MM_NODES_VALIDATORS_ENTRYPOINT: 'validator'
    }
    node_key = key_map.get(entrypoint_group, None)
    if node_key is None:
        return {}

    nodes_path = None
    for candidate in (
        os.environ.get('MINEMELD_NODES_PATH'),
        os.path.join(os.path.dirname(os.path.dirname(__file__)), 'nodes.json'),
        '/src/mm-ng-core/nodes.json'
    ):
        if candidate and os.path.exists(candidate):
            nodes_path = candidate
            break

    if nodes_path is None:
        LOG.debug('No source nodes.json available for %s', entrypoint_group)
        return {}

    try:
        with open(nodes_path) as f:
            nodes = json.load(f)
    except (IOError, OSError, ValueError):
        LOG.exception('Unable to load source node entry points from %s', nodes_path)
        return {}

    result = {}
    for node_name, node_config in nodes.items():
        target = node_config.get(node_key, None)
        if target is None:
            continue

        result[node_name] = MMEntryPoint(
            ep=_SourceEntryPoint(target),
            name=node_name,
            conflicts=[],
            loadable=True
        )

    return result


def bump_workingset():
    global _WS, _ENTRYPOINT_GROUPS

    _WS = None
    _ENTRYPOINT_GROUPS = {}


def list(entrypoint_group):
    if entrypoint_group not in _ENTRYPOINT_GROUPS:
        _initialize_entry_point_group(entrypoint_group)
    eg = _ENTRYPOINT_GROUPS[entrypoint_group]
    if len(eg) == 0:
        eg.update(_load_source_node_entry_points(entrypoint_group))

    return list(eg.keys())


def map(entrypoint_group):
    if entrypoint_group not in _ENTRYPOINT_GROUPS:
        _initialize_entry_point_group(entrypoint_group)
    eg = _ENTRYPOINT_GROUPS[entrypoint_group]
    if len(eg) == 0:
        eg.update(_load_source_node_entry_points(entrypoint_group))

    return eg


def load(entrypoint_group, entrypoint_name):
    LOG.info('Loading %s:%s', entrypoint_group, entrypoint_name)
    if entrypoint_group not in _ENTRYPOINT_GROUPS:
        _initialize_entry_point_group(entrypoint_group)
    eg = _ENTRYPOINT_GROUPS[entrypoint_group]
    if len(eg) == 0:
        eg.update(_load_source_node_entry_points(entrypoint_group))

    mmep = eg.get(entrypoint_name, None)
    if mmep is None:
        raise RuntimeError('Unknown entry point: {}:{}'.format(entrypoint_group, entrypoint_name))

    if not mmep.loadable:
        raise RuntimeError('Entry point {}:{} not loadable: {}'.format(
            entrypoint_group,
            entrypoint_name,
            ', '.join(mmep.conflicts)
        ))

    return mmep.ep.load()
