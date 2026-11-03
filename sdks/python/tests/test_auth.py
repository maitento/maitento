"""Credentials: every API-key form, JWT login, proactive renewal, token providers, and re-authentication."""

from __future__ import annotations

import json
import logging
from typing import Any, List

import httpx
import pytest
import respx

import maitento
from factories import sample
from helpers import API_KEY, API_KEY_HEADER, BASE, SECRET, USER_ID, auth_response, jwt
from maitento import ApiKey, ConfigurationError
from maitento._auth import JwtState, jwt_claims, resolve_credentials

NOW = 1_800_000_000.0
DAY = 86_400.0


def namespaces_route(mock: respx.MockRouter) -> respx.Route:
    return mock.get("/namespaces").mock(return_value=httpx.Response(200, json=[]))


# ------------------------------------------------------------------------------------------------------ API keys


@pytest.mark.parametrize(
    "key",
    [
        API_KEY,
        ApiKey(USER_ID, SECRET),
        (USER_ID, SECRET),
        {"user_id": USER_ID, "secret": SECRET},
        {"userId": USER_ID, "secret": SECRET},
    ],
)
def test_api_key_forms_send_the_api_key_header(mock: respx.MockRouter, key: Any) -> None:
    route = namespaces_route(mock)
    with maitento.Maitento(key, base_url=BASE, environ={}) as mt:
        mt.namespaces.list()
    assert route.calls.last.request.headers["Authorization"] == API_KEY_HEADER


def test_api_key_comes_from_the_environment(mock: respx.MockRouter) -> None:
    route = namespaces_route(mock)
    env = {"MAITENTO_API_KEY": API_KEY, "MAITENTO_BASE_URL": BASE, "MAITENTO_NAMESPACE": "demo"}
    with maitento.Maitento(environ=env) as mt:
        assert mt.namespace == "demo"
        assert mt.base_url == BASE
        mt.namespaces.list()
    assert route.calls.last.request.headers["Authorization"] == API_KEY_HEADER


def test_secret_with_colons_and_base64_is_kept_whole() -> None:
    key = ApiKey.parse(f"{USER_ID}:a+b/c==:d")
    assert key.user_id == USER_ID and key.secret == "a+b/c==:d"


@pytest.mark.parametrize("bad", ["", "no-colon", ":secret", "user:", "  :  "])
def test_malformed_api_key_strings_are_rejected(bad: str) -> None:
    with pytest.raises(ConfigurationError):
        ApiKey.parse(bad)


def test_repr_never_shows_the_secret() -> None:
    key = ApiKey(USER_ID, SECRET)
    assert SECRET not in repr(key)
    mt = maitento.Maitento(key, base_url=BASE, environ={})
    assert SECRET not in repr(mt) and SECRET not in repr(mt._transport.credentials)


def test_no_credentials_is_a_configuration_error() -> None:
    with pytest.raises(ConfigurationError, match="MAITENTO_API_KEY"):
        maitento.Maitento(base_url=BASE, environ={})


def test_two_kinds_of_credentials_are_rejected() -> None:
    with pytest.raises(ConfigurationError, match="only one"):
        maitento.Maitento(API_KEY, token="t", base_url=BASE, environ={})
    with pytest.raises(ConfigurationError, match="together"):
        resolve_credentials(api_key=None, token=None, token_provider=None, email="a@b.c", password=None, environ={})


def test_bad_base_url_is_rejected() -> None:
    with pytest.raises(ConfigurationError):
        maitento.Maitento(API_KEY, base_url="api.maitento.com", environ={})


def test_errors_are_maitento_errors() -> None:
    assert issubclass(ConfigurationError, maitento.MaitentoError)
    assert issubclass(ConfigurationError, ValueError)


# ---------------------------------------------------------------------------------------------------- JWT state


def test_jwt_claims_reads_unverified_payload() -> None:
    token = jwt(exp=NOW + DAY, iat=NOW)
    assert jwt_claims(token) == {"oid": USER_ID, "exp": int(NOW + DAY), "iat": int(NOW)}
    assert jwt_claims("opaque-token") is None
    assert jwt_claims("a.!!!.c") is None


def test_renewal_is_due_at_80_percent_of_the_lifetime() -> None:
    state = JwtState.create(jwt(exp=NOW + DAY, iat=NOW), now=NOW)
    assert state.renew_at == pytest.approx(NOW + 0.8 * DAY)
    assert not state.should_renew(NOW + 0.79 * DAY)
    assert state.should_renew(NOW + 0.8 * DAY)


def test_renewal_is_due_when_less_than_five_minutes_remain() -> None:
    state = JwtState.create(jwt(exp=NOW + 600, iat=NOW), now=NOW)  # 10-minute token
    assert state.renew_at == pytest.approx(NOW + 300)
    assert state.should_renew(NOW + 301)


def test_token_without_exp_uses_the_login_expiry() -> None:
    state = JwtState.create("opaque", now=NOW, expires_at=NOW + 1000)
    assert state.expires_at == NOW + 1000 and state.should_renew(NOW + 800)
    assert not JwtState.create("opaque", now=NOW).should_renew(NOW + 10 * DAY)


# ---------------------------------------------------------------------------------------- email/password login


def test_password_login_then_bearer(mock: respx.MockRouter) -> None:
    token = jwt(exp=NOW + DAY, iat=NOW)
    login = mock.put("/auth").mock(return_value=httpx.Response(200, json=auth_response(token, NOW + DAY)))
    route = namespaces_route(mock)
    with maitento.Maitento(email="ada@example.com", password="pw", base_url=BASE, environ={}) as mt:
        mt._transport._clock = lambda: NOW
        mt.namespaces.list()
        mt.namespaces.list()
    assert login.call_count == 1
    sent = login.calls.last.request
    assert "Authorization" not in sent.headers
    assert json.loads(sent.read()) == {"emailAddress": "ada@example.com", "password": "pw"}
    assert route.calls.last.request.headers["Authorization"] == f"Bearer {token}"


def test_proactive_renewal_at_80_percent(mock: respx.MockRouter) -> None:
    first = jwt(exp=NOW + DAY, iat=NOW)
    second = jwt(exp=NOW + 2 * DAY, iat=NOW + 0.9 * DAY)
    mock.put("/auth").mock(return_value=httpx.Response(200, json=auth_response(first, NOW + DAY)))
    renew = mock.get("/auth/renew").mock(return_value=httpx.Response(200, json=auth_response(second, NOW + 2 * DAY)))
    route = namespaces_route(mock)
    clock = [NOW]
    with maitento.Maitento(email="ada@example.com", password="pw", base_url=BASE, environ={}) as mt:
        mt._transport._clock = lambda: clock[0]
        mt.namespaces.list()
        clock[0] = NOW + 0.5 * DAY
        mt.namespaces.list()
        assert renew.call_count == 0
        clock[0] = NOW + 0.85 * DAY  # past 80%, long before expiry
        mt.namespaces.list()
    assert renew.call_count == 1
    assert renew.calls.last.request.headers["Authorization"] == f"Bearer {first}"
    assert route.calls.last.request.headers["Authorization"] == f"Bearer {second}"


def test_static_token_is_renewed_proactively(mock: respx.MockRouter) -> None:
    first = jwt(exp=NOW + 600, iat=NOW - DAY + 600)
    second = jwt(exp=NOW + DAY, iat=NOW)
    renew = mock.get("/auth/renew").mock(return_value=httpx.Response(200, json=auth_response(second, NOW + DAY)))
    route = namespaces_route(mock)
    with maitento.Maitento(token=first, base_url=BASE, environ={}) as mt:
        mt._transport._clock = lambda: NOW
        mt.namespaces.list()
    assert renew.call_count == 1
    assert route.calls.last.request.headers["Authorization"] == f"Bearer {second}"


def test_failed_renewal_keeps_a_still_valid_token(mock: respx.MockRouter, caplog: pytest.LogCaptureFixture) -> None:
    token = jwt(exp=NOW + 120, iat=NOW - 1000)
    renew = mock.get("/auth/renew").mock(return_value=httpx.Response(403))
    route = namespaces_route(mock)
    with caplog.at_level(logging.WARNING, logger="maitento"):
        with maitento.Maitento(token=token, base_url=BASE, environ={}) as mt:
            mt._transport._clock = lambda: NOW
            mt.namespaces.list()
            mt.namespaces.list()  # does not try again straight away
    assert renew.call_count == 1
    assert route.call_count == 2
    assert route.calls.last.request.headers["Authorization"] == f"Bearer {token}"
    assert "Could not renew" in caplog.text


def test_401_logs_in_again_and_retries_once(mock: respx.MockRouter) -> None:
    first = jwt(exp=NOW + DAY, iat=NOW)
    second = jwt(exp=NOW + DAY, iat=NOW + 1)
    login = mock.put("/auth").mock(
        side_effect=[
            httpx.Response(200, json=auth_response(first, NOW + DAY)),
            httpx.Response(200, json=auth_response(second, NOW + DAY)),
        ]
    )
    renew = mock.get("/auth/renew").mock(return_value=httpx.Response(401))
    start = mock.put("/namespaces/demo/interactions/by-name/hello/start").mock(
        side_effect=[httpx.Response(401), httpx.Response(200, json=sample("InteractionProcess", status="New"))]
    )
    with maitento.Maitento(email="ada@example.com", password="pw", base_url=BASE, namespace="demo", environ={}) as mt:
        mt._transport._clock = lambda: NOW
        run = mt.interactions.start("hello")
    assert str(run.status) == "New"
    assert start.call_count == 2
    assert renew.call_count == 1 and login.call_count == 2
    assert start.calls.last.request.headers["Authorization"] == f"Bearer {second}"


def test_401_with_an_api_key_is_not_retried(mock: respx.MockRouter) -> None:
    route = mock.get("/namespaces").mock(return_value=httpx.Response(401))
    with maitento.Maitento(API_KEY, base_url=BASE, environ={}) as mt:
        with pytest.raises(maitento.AuthenticationError):
            mt.namespaces.list()
    assert route.call_count == 1


def test_token_provider_is_used(mock: respx.MockRouter) -> None:
    calls: List[int] = []

    def provider() -> str:
        calls.append(1)
        return jwt(exp=NOW + DAY, iat=NOW)

    route = namespaces_route(mock)
    with maitento.Maitento(token_provider=provider, base_url=BASE, environ={}) as mt:
        mt._transport._clock = lambda: NOW
        mt.namespaces.list()
        mt.namespaces.list()
    assert len(calls) == 1  # cached until it is due for renewal
    assert route.calls.last.request.headers["Authorization"].startswith("Bearer ")


async def test_async_token_provider(mock: respx.MockRouter) -> None:
    async def provider() -> str:
        return jwt(exp=NOW + DAY, iat=NOW)

    route = namespaces_route(mock)
    async with maitento.AsyncMaitento(token_provider=provider, base_url=BASE, environ={}) as mt:
        mt._transport._clock = lambda: NOW
        await mt.namespaces.list()
    assert route.calls.last.request.headers["Authorization"] == f"Bearer {jwt(exp=NOW + DAY, iat=NOW)}"


def test_async_token_provider_needs_the_async_client(mock: respx.MockRouter) -> None:
    async def provider() -> str:
        return "x"

    namespaces_route(mock)
    with maitento.Maitento(token_provider=provider, base_url=BASE, environ={}) as mt:
        with pytest.raises(TypeError, match="AsyncMaitento"):
            mt.namespaces.list()


async def test_async_password_login_and_renewal(mock: respx.MockRouter) -> None:
    first = jwt(exp=NOW + DAY, iat=NOW)
    second = jwt(exp=NOW + 2 * DAY, iat=NOW + DAY)
    mock.put("/auth").mock(return_value=httpx.Response(200, json=auth_response(first, NOW + DAY)))
    renew = mock.get("/auth/renew").mock(return_value=httpx.Response(200, json=auth_response(second, NOW + 2 * DAY)))
    route = namespaces_route(mock)
    clock = [NOW]
    async with maitento.AsyncMaitento(email="ada@example.com", password="pw", base_url=BASE, environ={}) as mt:
        mt._transport._clock = lambda: clock[0]
        await mt.namespaces.list()
        clock[0] = NOW + DAY - 200  # under five minutes left
        await mt.namespaces.list()
    assert renew.call_count == 1
    assert route.calls.last.request.headers["Authorization"] == f"Bearer {second}"


def test_user_agent_is_sent_with_suffix(mock: respx.MockRouter) -> None:
    route = namespaces_route(mock)
    with maitento.Maitento(API_KEY, base_url=BASE, user_agent="my-app/1.0", environ={}) as mt:
        mt.namespaces.list()
    agent = route.calls.last.request.headers["User-Agent"]
    assert agent.startswith(f"maitento-python/{maitento.__version__}") and agent.endswith("my-app/1.0")


def test_injected_http_client_is_not_closed_or_changed(mock: respx.MockRouter) -> None:
    namespaces_route(mock)
    http = httpx.Client(timeout=3)
    with maitento.Maitento(API_KEY, base_url=BASE, http_client=http, environ={}) as mt:
        mt.namespaces.list()
    assert not http.is_closed and http.timeout.read == 3
    http.close()
