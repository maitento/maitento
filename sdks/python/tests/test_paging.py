"""Cursor-paged lists are page objects that iterate every item across pages."""

from __future__ import annotations

import httpx
import respx

import maitento
from factories import sample


def summary(run_id: str) -> dict:
    return sample("ProcessSummary", id=run_id)


def two_pages(mock: respx.MockRouter) -> respx.Route:
    def respond(request: httpx.Request) -> httpx.Response:
        if request.url.params.get("cursor") == "c2":
            return httpx.Response(200, json={"items": [summary("r3")], "nextCursor": None})
        return httpx.Response(200, json={"items": [summary("r1"), summary("r2")], "nextCursor": "c2"})

    return mock.get("/processes").mock(side_effect=respond)


def test_sync_page_iterates_every_item(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = two_pages(mock)
    page = client.runs.list(state="Terminal", limit=2)
    assert isinstance(page, maitento.Page)
    assert [r.id for r in page.items] == ["r1", "r2"] and page.next_cursor == "c2" and page.has_next_page()
    assert [r.id for r in page] == ["r1", "r2", "r3"]
    second = route.calls.last.request.url.params
    assert second["cursor"] == "c2" and second["state"] == "Terminal" and second["limit"] == "2"
    assert page.to_list(limit=2) == page.items


def test_next_page_and_last_page(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    two_pages(mock)
    page = client.runs.list()
    nxt = page.next_page()
    assert nxt is not None and [r.id for r in nxt.items] == ["r3"]
    assert not nxt.has_next_page() and nxt.next_page() is None
    assert isinstance(page.raw, maitento.ProcessPage)


async def test_async_page_iterates_every_item(mock: respx.MockRouter, aclient: maitento.AsyncMaitento) -> None:
    two_pages(mock)
    page = await aclient.runs.list()
    assert isinstance(page, maitento.AsyncPage)
    assert [r.id async for r in page] == ["r1", "r2", "r3"]
    assert [r.id for r in await page.to_list()] == ["r1", "r2", "r3"]


def test_build_history_pages(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    ns = mock.get("/namespaces/demo/builds").mock(
        return_value=httpx.Response(200, json={"items": [sample("BuildRecordSummary")], "nextCursor": None})
    )
    tenant = mock.get("/builds").mock(return_value=httpx.Response(200, json={"items": [], "nextCursor": None}))
    assert len(client.builds.list(namespace="demo", is_deploy=True).items) == 1
    assert ns.calls.last.request.url.params["isDeploy"] == "true"
    client.builds.list(namespaces=["a", "b"], outcome="Failed")
    assert tenant.calls.last.request.url.params.get_list("namespace") == ["a", "b"]


def test_partition_files_page(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    def respond(request: httpx.Request) -> httpx.Response:
        if request.url.params.get("cursor"):
            return httpx.Response(200, json={"items": [sample("IngestedFileListItem", name="b.md")], "nextCursor": None})
        return httpx.Response(200, json={"items": [sample("IngestedFileListItem", name="a.md")], "nextCursor": "n"})

    mock.get("/partitions/by-id/p1/files").mock(side_effect=respond)
    assert [f.name for f in client.partitions.files("p1", limit=1)] == ["a.md", "b.md"]
