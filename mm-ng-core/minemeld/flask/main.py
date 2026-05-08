import argparse
import logging

from . import create_app

app = create_app()


def main(argv=None):
    parser = argparse.ArgumentParser(
        description='Run the mm-ng-core MineMeld-compatible HTTP API'
    )
    parser.add_argument('--host', default='0.0.0.0')
    parser.add_argument('--port', default=5000, type=int)
    parser.add_argument('--verbose', action='store_true')
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format='%(asctime)s %(levelname)s: %(message)s'
    )

    logging.getLogger(__name__).info(
        'Starting mm-ng-core API on %s:%d',
        args.host,
        args.port
    )
    app.run(
        host=args.host,
        port=args.port,
        debug=False,
        use_reloader=False,
        threaded=True
    )


if __name__ == '__main__':
    main()
