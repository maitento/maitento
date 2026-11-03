"""Every error body shape the server produces maps to its typed error."""

from __future__ import annotations

import builtins
from typing import Any, Dict, Optional

import httpx
import pytest
import respx

import maitento
from maitento import errors


def fail(mock: respx.MockRouter, status: int, body: Any = None, headers: Optional[Dict[str, str]] = None) -> None:
    if body is None:
        response = httpx.Response(status, headers=headers)
    elif isinstance(body, str):
        response = httpx.Response(status, text=body, headers=headers)
    else:
        response = httpx.Response(status, json=body, headers=headers)
    mock.get("/agents/by-id/a1").mock(return_value=response)


def test_validation_failures(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    fail(
        mock,
        400,
        {
            "validationFailures": [
                {"errorCode": "api:validation-failure:system-prompt", "memberName": "SystemPrompt", "message": "Required"},
                {"errorCode": "api:agent:delete:in-use", "memberName": "request", "message": "In use"},
            ]
        },
    )
    with pytest.raises(maitento.ValidationError) as caught:
        client.agents.get("a1")
    error = caught.value
    assert error.status == 400
    assert error.codes == ["api:validation-failure:system-prompt", "api:agent:delete:in-use"]
    assert error.failures[0] == maitento.ValidationFailure("api:validation-failure:system-prompt", "SystemPrompt", "Required")
    assert error.code == "api:validation-failure:system-prompt"
    assert "SystemPrompt: Required" in str(error)


def test_plain_400_is_an_api_error(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    fail(mock, 400, {"error": "Path must be absolute"})
    with pytest.raises(maitento.ApiError) as caught:
        client.agents.get("a1")
    assert type(caught.value) is maitento.ApiError
    assert caught.value.status == 400 and "Path must be absolute" in str(caught.value)
    assert caught.value.body == {"error": "Path must be absolute"}


def test_401_empty(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    fail(mock, 401, headers={"WWW-Authenticate": "ApiKey"})
    with pytest.raises(maitento.AuthenticationError) as caught:
        client.agents.get("a1")
    assert caught.value.status == 401 and caught.value.body is None


@pytest.mark.parametrize("body,code", [(None, None), ({"code": "api:loom:erase-forbidden", "error": "No"}, "api:loom:erase-forbidden")])
def test_403(mock: respx.MockRouter, client: maitento.Maitento, body: Any, code: Optional[str]) -> None:
    fail(mock, 403, body)
    with pytest.raises(maitento.PermissionError) as caught:
        client.agents.get("a1")
    assert caught.value.code == code
    assert isinstance(caught.value, builtins.PermissionError)


@pytest.mark.parametrize("body", [None, {"error": "VFS 'notes' not found"}, {"type": "x", "title": "Not Found", "status": 404}])
def test_404_shapes(mock: respx.MockRouter, client: maitento.Maitento, body: Any) -> None:
    fail(mock, 404, body)
    with pytest.raises(maitento.NotFoundError):
        client.agents.get("a1")
    assert client.agents.find("a1") is None


def test_empty_204_on_a_get_is_not_found(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    fail(mock, 204)
    with pytest.raises(maitento.NotFoundError):
        client.agents.get("a1")
    assert client.agents.find("a1") is None


def test_409(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    fail(mock, 409, {"error": "The loom changed; re-read it"})
    with pytest.raises(maitento.ConflictError):
        client.agents.get("a1")


def test_413(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    fail(mock, 413, {"code": "api:request-too-large", "error": "Request body too large", "maxRequestBodyBytes": 30000000})
    with pytest.raises(maitento.RequestTooLargeError) as caught:
        client.agents.get("a1")
    assert caught.value.max_request_body_bytes == 30000000 and caught.value.code == "api:request-too-large"


def test_422_file_ingestion(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    body = {"error": "Too little text", "category": "ThinText", "ocrAttempted": True, "guidance": "Upload a text PDF"}
    mock.put("/files/partitions/p1").mock(return_value=httpx.Response(422, json=body))
    with pytest.raises(maitento.FileIngestionError) as caught:
        client.files.upload("p1", b"%PDF-1.7", filename="scan.pdf")
    error = caught.value
    assert (error.category, error.ocr_attempted, error.guidance) == ("ThinText", True, "Upload a text PDF")


def test_422_without_category(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    fail(mock, 422, {"error": "Could not parse"})
    with pytest.raises(maitento.FileIngestionError) as caught:
        client.agents.get("a1")
    assert caught.value.category is None


def test_429_carries_retry_after(mock: respx.MockRouter) -> None:
    mock.put("/auth").mock(
        return_value=httpx.Response(
            429, json={"code": "api:rate-limited", "error": "Slow down", "retryAfterSeconds": 17}, headers={"Retry-After": "12"}
        )
    )
    with maitento.Maitento(email="a@b.c", password="pw", base_url="http://mt.test", environ={}) as mt:
        with pytest.raises(maitento.RateLimitError) as caught:
            mt.namespaces.list()
    assert caught.value.retry_after == 12 and caught.value.code == "api:rate-limited"


def test_429_body_retry_after_when_no_header(mock: respx.MockRouter) -> None:
    mock.post("/namespaces").mock(return_value=httpx.Response(429, json={"retryAfterSeconds": 9}))
    with maitento.Maitento("u:s", base_url="http://mt.test", environ={}) as mt:
        with pytest.raises(maitento.RateLimitError) as caught:
            mt.namespaces.create("demo")
    assert caught.value.retry_after == 9


def test_500_is_an_api_error(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    fail(mock, 500)
    with pytest.raises(maitento.ApiError) as caught:
        client.agents.get("a1")
    assert caught.value.status == 500 and caught.value.method == "GET" and caught.value.url.endswith("/agents/by-id/a1")


def test_hierarchy() -> None:
    for name in errors.__all__:
        cls = getattr(errors, name)
        if isinstance(cls, type) and issubclass(cls, Exception):
            assert issubclass(cls, maitento.MaitentoError) or cls is maitento.MaitentoError, name
    for cls in (
        maitento.ValidationError,
        maitento.AuthenticationError,
        maitento.PermissionError,
        maitento.NotFoundError,
        maitento.ConflictError,
        maitento.RequestTooLargeError,
        maitento.FileIngestionError,
        maitento.RateLimitError,
    ):
        assert issubclass(cls, maitento.ApiError)
    assert issubclass(maitento.TimeoutError, builtins.TimeoutError)
    assert issubclass(maitento.ConnectionError, builtins.ConnectionError)


def test_unparseable_success_body_is_a_response_parse_error(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    mock.get("/agents/by-id/a1").mock(return_value=httpx.Response(200, json={"unexpected": True}))
    with pytest.raises(maitento.ResponseParseError) as caught:
        client.agents.get("a1")
    assert caught.value.body == {"unexpected": True}


def test_process_failed_error_status() -> None:
    class Run:
        status = "Killed"

    error = maitento.ProcessFailedError("ended", run=Run(), failure_details="stopped")
    assert error.status == "Killed" and error.failure_details == "stopped"
