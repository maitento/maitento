"""Retry policy: only idempotent calls, on network errors, 429 and 502/503/504, honouring Retry-After."""

from __future__ import annotations

from typing import List

import httpx
import pytest
import respx

import maitento
from factories import sample
from helpers import API_KEY, BASE
from maitento._http import retry_after_seconds, retry_delay


def test_get_is_retried_on_503_then_succeeds(mock: respx.MockRouter, client: maitento.Maitento, sleeps: List[float]) -> None:
    route = mock.get("/namespaces").mock(side_effect=[httpx.Response(503), httpx.Response(502), httpx.Response(200, json=[])])
    assert client.namespaces.list() == []
    assert route.call_count == 3
    assert len(sleeps) == 2 and all(0 < s <= 8 for s in sleeps)


def test_retry_after_is_honoured(mock: respx.MockRouter, client: maitento.Maitento, sleeps: List[float]) -> None:
    mock.get("/namespaces").mock(side_effect=[httpx.Response(429, headers={"Retry-After": "7"}), httpx.Response(200, json=[])])
    client.namespaces.list()
    assert sleeps == [7.0]


def test_gives_up_after_max_retries(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.get("/namespaces").mock(return_value=httpx.Response(504))
    with pytest.raises(maitento.ApiError) as caught:
        client.namespaces.list()
    assert caught.value.status == 504
    assert route.call_count == 3  # the call and two retries (max_retries=2)


def test_max_retries_zero(mock: respx.MockRouter, sleeps: List[float]) -> None:
    route = mock.get("/namespaces").mock(return_value=httpx.Response(503))
    with maitento.Maitento(API_KEY, base_url=BASE, max_retries=0, environ={}) as mt:
        with pytest.raises(maitento.ApiError):
            mt.namespaces.list()
    assert route.call_count == 1


def test_delete_is_retried(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.delete("/agents/by-id/a1").mock(side_effect=[httpx.Response(503), httpx.Response(204)])
    client.agents.delete("a1")
    assert route.call_count == 2


@pytest.mark.parametrize("status", [429, 502, 503, 504])
def test_a_start_is_never_retried(mock: respx.MockRouter, client: maitento.Maitento, status: int) -> None:
    route = mock.put("/namespaces/demo/interactions/by-name/hello/start").mock(return_value=httpx.Response(status))
    with pytest.raises(maitento.ApiError):
        client.interactions.start("hello")
    assert route.call_count == 1


def test_a_start_is_not_retried_on_network_errors(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.put("/namespaces/demo/interactions/by-name/hello/start").mock(side_effect=httpx.ConnectError("refused"))
    with pytest.raises(maitento.ConnectionError):
        client.interactions.start("hello")
    assert route.call_count == 1


def test_deploy_and_upload_are_never_retried(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    build = mock.put("/namespaces/demo/build").mock(return_value=httpx.Response(503))
    upload = mock.put("/files/partitions/p1").mock(return_value=httpx.Response(503))
    with pytest.raises(maitento.ApiError):
        client.deploy({"agents/a.mtr": 'model = @ref("m")'})
    with pytest.raises(maitento.ApiError):
        client.files.upload("p1", b"hello", filename="a.txt")
    assert build.call_count == 1 and upload.call_count == 1


def test_network_errors_on_a_get_are_retried_then_raised(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.get("/namespaces").mock(side_effect=httpx.ConnectError("refused"))
    with pytest.raises(maitento.ConnectionError) as caught:
        client.namespaces.list()
    assert route.call_count == 3
    assert isinstance(caught.value.__cause__, httpx.ConnectError)


def test_timeouts_raise_timeout_error(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    mock.get("/namespaces").mock(side_effect=httpx.ReadTimeout("slow"))
    with pytest.raises(maitento.TimeoutError):
        client.namespaces.list()
    with pytest.raises(TimeoutError):  # the built-in name catches it too
        client.namespaces.list()


def test_per_call_timeout_is_passed_to_httpx(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.get("/namespaces").mock(return_value=httpx.Response(200, json=[]))
    client.namespaces.list(timeout=3.5)
    assert route.calls.last.request.extensions["timeout"]["read"] == 3.5
    client.namespaces.list()
    assert route.calls.last.request.extensions["timeout"]["read"] == 120.0


def test_idempotent_put_is_retried(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    body = sample("ProcessRetentionStatus")
    route = mock.put("/processes/Interaction/r1/retention-lease").mock(side_effect=[httpx.Response(503), httpx.Response(200, json=body)])
    client.runs.retain("r1", type="Interaction")
    assert route.call_count == 2


async def test_async_retries(mock: respx.MockRouter, aclient: maitento.AsyncMaitento, sleeps: List[float]) -> None:
    route = mock.get("/namespaces").mock(side_effect=[httpx.Response(503), httpx.Response(200, json=[])])
    assert await aclient.namespaces.list() == []
    assert route.call_count == 2 and len(sleeps) == 1
    start = mock.put("/namespaces/demo/interactions/by-name/hello/start").mock(return_value=httpx.Response(503))
    with pytest.raises(maitento.ApiError):
        await aclient.interactions.start("hello")
    assert start.call_count == 1


def test_retry_delay_policy() -> None:
    assert retry_delay(0, rng=lambda: 1.0) == pytest.approx(0.5)
    assert retry_delay(1, rng=lambda: 0.0) == pytest.approx(0.5)
    assert retry_delay(10, rng=lambda: 1.0) == pytest.approx(8.0)
    assert retry_delay(0, retry_after=3) == 3
    assert retry_delay(0, retry_after=600) == 60


def test_retry_after_parsing() -> None:
    assert retry_after_seconds({"Retry-After": "5"}) == 5
    assert retry_after_seconds({"retry-after": "Wed, 21 Oct 2015 07:28:10 GMT"}, now=1445412480.0) == pytest.approx(10.0)
    assert retry_after_seconds({}, {"retryAfterSeconds": 4}) == 4
    assert retry_after_seconds({"Retry-After": "soon"}) is None
