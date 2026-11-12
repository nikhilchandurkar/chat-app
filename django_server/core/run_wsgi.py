"""
Dedicated multi-threaded WSGI HTTP server powered by Twisted WSGIResource.

Isolates synchronous Django REST Framework HTTP views into a bounded worker
ThreadPool so concurrent HTTP/login bursts do not contend with ASGI WebSocket
event loops or leak per-request ThreadSensitiveContext threads/MySQL connections.
"""

from __future__ import annotations

import os
import signal
import sys

# Ensure django_server root is importable when invoked as `python -m core.run_wsgi`
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")

# Load Django/daphne first so AsyncioSelectorReactor is installed cleanly before Twisted reactor import
from core.wsgi import application  # noqa: E402
from twisted.internet import endpoints, reactor  # noqa: E402
from twisted.python.threadpool import ThreadPool  # noqa: E402
from twisted.web.server import Site  # noqa: E402
from twisted.web.wsgi import WSGIResource  # noqa: E402


def main() -> None:
    host = os.environ.get("WSGI_HOST", "127.0.0.1")
    port = int(os.environ.get("WSGI_PORT", os.environ.get("PORT", "3010")))
    min_threads = int(os.environ.get("WSGI_MIN_THREADS", "12"))
    max_threads = int(os.environ.get("WSGI_THREADS", "24"))
    backlog = int(os.environ.get("WSGI_BACKLOG", "4096"))

    pool = ThreadPool(minthreads=min_threads, maxthreads=max_threads, name=f"wsgi-{port}")
    pool.start()
    reactor.addSystemEventTrigger("after", "shutdown", pool.stop)

    def _handle_signal(*_args):
        if reactor.running:
            reactor.callFromThread(reactor.stop)

    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    resource = WSGIResource(reactor, pool, application)
    site = Site(resource, logPath=None)
    endpoint = endpoints.serverFromString(
        reactor, f"tcp:port={port}:interface={host}:backlog={backlog}"
    )
    endpoint.listen(site)
    print(f"Twisted WSGI serving on {host}:{port} (threads={min_threads}..{max_threads}, backlog={backlog})", flush=True)
    reactor.run()


if __name__ == "__main__":
    main()

