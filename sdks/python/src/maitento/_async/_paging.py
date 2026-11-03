"""Cursor-paged lists (``runs.list``, ``builds.list``, ``partitions.files``)."""

from __future__ import annotations

from typing import Any, AsyncIterator, Awaitable, Callable, Generic, List, Optional, TypeVar

T = TypeVar("T")


class AsyncPage(Generic[T]):
    """One page of a cursor-paged list, newest first.

    ``items`` and ``next_cursor`` are the page itself. Iterating the page walks **every** item of every page,
    fetching the next page only when it is reached::

        async for run in page: ...
    """

    def __init__(
        self,
        items: List[T],
        next_cursor: Optional[str],
        fetch: Optional[Callable[[str], Awaitable["AsyncPage[T]"]]] = None,
        raw: Any = None,
    ) -> None:
        self.items = items
        self.next_cursor = next_cursor
        self.raw = raw
        """The page as the API returned it (its model)."""
        self._fetch = fetch

    def has_next_page(self) -> bool:
        return bool(self.next_cursor) and self._fetch is not None

    async def next_page(self) -> Optional["AsyncPage[T]"]:
        """The following page, or ``None`` on the last one."""
        if not self.next_cursor or self._fetch is None:
            return None
        return await self._fetch(self.next_cursor)

    async def __aiter__(self) -> AsyncIterator[T]:
        page: Optional[AsyncPage[T]] = self
        while page is not None:
            for item in page.items:
                yield item
            page = await page.next_page()

    async def to_list(self, limit: Optional[int] = None) -> List[T]:
        """Every item of this and the following pages (at most ``limit``)."""
        result: List[T] = []
        async for item in self:
            if limit is not None and len(result) >= limit:
                break
            result.append(item)
        return result

    def __repr__(self) -> str:
        return f"{type(self).__name__}(items={len(self.items)}, next_cursor={self.next_cursor!r})"
