import csv
import logging
import os
import os.path
import re

from . import basepoller

LOG = logging.getLogger(__name__)


class LocalCSVFT(basepoller.BasePollerFT):
    """Miner node for CSV files mounted on the local filesystem."""

    def __init__(self, name, chassis, config):
        self.file_monitor_mtime = None
        super(LocalCSVFT, self).__init__(name, chassis, config)

    def configure(self):
        super(LocalCSVFT, self).configure()

        self.path = self.config.get('path', None)
        if self.path is None:
            self.path = os.path.join(
                os.environ['MM_CONFIG_DIR'],
                '{}.csv'.format(self.name)
            )

        self.ignore_regex = self.config.get('ignore_regex', None)
        if self.ignore_regex is not None:
            self.ignore_regex = re.compile(self.ignore_regex)

        self.fieldnames = self.config.get('fieldnames', None)
        self.dialect = {
            'delimiter': self.config.get('delimiter', ','),
            'doublequote': self.config.get('doublequote', True),
            'escapechar': self.config.get('escapechar', None),
            'quotechar': self.config.get('quotechar', '"'),
            'skipinitialspace': self.config.get('skipinitialspace', False)
        }

    def _flush(self):
        self.file_monitor_mtime = None
        super(LocalCSVFT, self)._flush()

    def _process_item(self, item):
        item.pop(None, None)
        indicator = item.pop('indicator', None)
        return [[indicator, item]]

    def _build_iterator(self, now):
        if self.path is None:
            LOG.warning('%s - no path configured', self.name)
            raise RuntimeError('%s - no path configured' % self.name)

        try:
            mtime = os.stat(self.path).st_mtime
        except OSError as e:
            if e.errno == 2:
                return None

            LOG.exception('%s - error checking mtime of %s', self.name, self.path)
            raise RuntimeError('%s - error checking CSV file' % self.name)

        if mtime == self.file_monitor_mtime:
            return None

        self.file_monitor_mtime = mtime

        def _rows():
            with open(self.path, newline='') as f:
                lines = f
                if self.ignore_regex is not None:
                    lines = (line for line in f if self.ignore_regex.match(line) is None)

                reader = csv.DictReader(lines, fieldnames=self.fieldnames, **self.dialect)
                for row in reader:
                    yield row

        return _rows()
