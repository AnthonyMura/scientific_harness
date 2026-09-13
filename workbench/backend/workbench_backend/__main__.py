"""CLI entry point: `python -m workbench_backend serve`."""

import argparse
import sys

from .app import serve


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="workbench-backend")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_serve = sub.add_parser("serve", help="run the HTTP service on 127.0.0.1:<random port>")
    p_serve.add_argument(
        "--token",
        default=None,
        help="auth token (default: $WORKBENCH_TOKEN or a generated one)",
    )
    p_serve.add_argument(
        "--port",
        type=int,
        default=None,
        help="bind this port instead of an OS-assigned one (dev mode)",
    )
    p_serve.add_argument(
        "--reload",
        action="store_true",
        help="dev only: restart the server automatically when backend code changes",
    )
    args = parser.parse_args(argv)
    if args.cmd == "serve":
        serve(token=args.token, port=args.port, reload=args.reload)
    return 0


if __name__ == "__main__":
    sys.exit(main())