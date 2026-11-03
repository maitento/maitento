"""A fake ``/notifications`` WebSocket server on 127.0.0.1, running its own event loop in a thread."""

from __future__ import annotations

import asyncio
import json
import threading
import time
from typing import Any, List, Optional, Set, Tuple

from websockets.asyncio.server import Server, ServerConnection, serve
from websockets.http11 import Request, Response


class FakeNotifications:
    def __init__(self, *, authorization: Optional[str] = None) -> None:
        self.authorization = authorization
        self.requests: List[Tuple[str, Optional[str], Optional[str]]] = []
        """``(path, Authorization, User-Agent)`` of every handshake."""
        self.received: List[str] = []
        self.connections: Set[ServerConnection] = set()
        self.accepted = 0
        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._loop.run_forever, daemon=True)
        self._server: Optional[Server] = None
        self.url = ""

    def __enter__(self) -> "FakeNotifications":
        self._thread.start()
        self._server = asyncio.run_coroutine_threadsafe(self._start(), self._loop).result(10)
        port = list(self._server.sockets)[0].getsockname()[1]
        self.url = f"http://127.0.0.1:{port}"
        return self

    def __exit__(self, *_: Any) -> None:
        async def stop() -> None:
            assert self._server is not None
            self._server.close()
            await self._server.wait_closed()

        asyncio.run_coroutine_threadsafe(stop(), self._loop).result(10)
        self._loop.call_soon_threadsafe(self._loop.stop)
        self._thread.join(10)
        self._loop.close()

    async def _start(self) -> Server:
        return await serve(self._handler, "127.0.0.1", 0, process_request=self._check)

    def _check(self, connection: ServerConnection, request: Request) -> Optional[Response]:
        auth = request.headers.get("Authorization")
        self.requests.append((request.path, auth, request.headers.get("User-Agent")))
        if self.authorization is not None and auth != self.authorization:
            return connection.respond(401, "")
        return None

    async def _handler(self, connection: ServerConnection) -> None:
        self.connections.add(connection)
        self.accepted += 1
        await connection.send(json.dumps({"name": "setup", "id": 1, "message": {}}))
        try:
            async for message in connection:
                self.received.append(message if isinstance(message, str) else message.decode())
        except Exception:
            pass
        finally:
            self.connections.discard(connection)

    def send(self, name: str, message: Any, frame_id: int = 7) -> None:
        """Pushes one frame to every open connection."""
        text = json.dumps({"name": name, "id": frame_id, "message": message})

        async def push() -> None:
            for connection in list(self.connections):
                await connection.send(text)

        asyncio.run_coroutine_threadsafe(push(), self._loop).result(10)

    def drop_all(self) -> None:
        """Closes every connection from the server side (the client should reconnect)."""

        async def drop() -> None:
            for connection in list(self.connections):
                await connection.close(code=1011, reason="restart")

        asyncio.run_coroutine_threadsafe(drop(), self._loop).result(10)

    def wait_for(self, predicate: Any, timeout: float = 5.0) -> bool:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if predicate():
                return True
            time.sleep(0.01)
        return False
