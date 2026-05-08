import json
import time
import hashlib
import collections


INDEX_KEY = 'mmng:metrics:v1:index'
KEY_PREFIX = 'mmng:metrics:v1:'
DEFAULT_RETENTION_SECONDS = 35 * 24 * 60 * 60


def _sample_key(metric):
    return KEY_PREFIX + metric


def _decode(value):
    if isinstance(value, bytes):
        return value.decode('utf-8')
    return value


def _node_type(status):
    if len(status.get('inputs', [])) == 0:
        return 'miners'
    if not status.get('output', False):
        return 'outputs'
    return 'processors'


def build_metric_samples(answers):
    gstats = collections.defaultdict(lambda: 0)
    result = {}

    for source, status in answers.items():
        ntype = _node_type(status)
        stats = status.get('statistics', {})
        length = status.get('length', None)

        _, _, source = source.split(':', 2)
        source = hashlib.md5(source.encode('utf-8')).hexdigest()[:10]

        for metric, value in stats.items():
            gstats[ntype + '.' + metric] += value
            result[source + '.' + metric] = value

        if length is not None:
            gstats['length'] += length
            gstats[ntype + '.length'] += length
            result[source + '.length'] = length

    for metric, value in gstats.items():
        result['minemeld.' + metric] = value

    return result


def record_samples(redis_client, answers, timestamp_ms=None,
                   retention_seconds=DEFAULT_RETENTION_SECONDS):
    if timestamp_ms is None:
        timestamp_ms = int(time.time() * 1000)

    cutoff = timestamp_ms - (retention_seconds * 1000)
    samples = build_metric_samples(answers)

    pipeline = redis_client.pipeline()
    for metric, value in samples.items():
        sample_key = _sample_key(metric)
        payload = json.dumps([timestamp_ms, value], separators=(',', ':'))
        pipeline.sadd(INDEX_KEY, metric)
        pipeline.zadd(sample_key, {payload: timestamp_ms})
        pipeline.zremrangebyscore(sample_key, 0, cutoff)
    pipeline.execute()


def list_metrics(redis_client, prefix=None):
    metrics = [_decode(m) for m in redis_client.smembers(INDEX_KEY)]
    metrics = sorted(metrics)
    if prefix is None:
        return metrics
    return [m for m in metrics if m.startswith(prefix)]


def _counter_series(samples, bucket_ms):
    buckets = collections.OrderedDict()
    for ts_ms, value in samples:
        bucket = ts_ms - (ts_ms % bucket_ms)
        buckets[bucket] = value
    return [[bucket // 1000, value] for bucket, value in buckets.items()]


def _delta_series(samples, bucket_ms):
    buckets = collections.OrderedDict()
    previous = None

    for ts_ms, value in samples:
        if previous is None:
            previous = value
            continue

        delta = value
        if value is not None and previous is not None and value >= previous:
            delta = value - previous

        bucket = ts_ms - (ts_ms % bucket_ms)
        buckets[bucket] = buckets.get(bucket, 0) + delta
        previous = value

    return [[bucket // 1000, value] for bucket, value in buckets.items()]


def fetch_metric(redis_client, metric, dt=86400, r=1800, type_=None):
    now_ms = int(time.time() * 1000)
    start_ms = now_ms - (dt * 1000)
    bucket_ms = max(r, 1) * 1000

    raw_samples = redis_client.zrangebyscore(_sample_key(metric), start_ms, now_ms)
    samples = [json.loads(_decode(sample)) for sample in raw_samples]
    if not samples:
        return []

    if type_ == 'minemeld_counter' or metric.endswith('.length') or metric == 'minemeld.length':
        return _counter_series(samples, bucket_ms)

    return _delta_series(samples, bucket_ms)
