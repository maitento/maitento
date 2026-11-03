"""Web-hook verification and parsing, as a FastAPI/Flask receiver would use them, and updating a registration."""

from __future__ import annotations

import json
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Tuple

import httpx
import pytest
import respx

import maitento
from factories import sample
from helpers import RUN_ID
from maitento import webhooks
from maitento.webhooks import sign_webhook, verify_webhook

# The vector every Maitento SDK tests against.
SECRET = "whsec_test_secret"
TIMESTAMP = 1793260000
BODY = b'{"id":"abc","status":"Finished"}'
SIGNATURE = "v1=fcd362066648db6355d952ba1f00bf65504a4041eb38acae187a135015433cb6"
AT = datetime.fromtimestamp(TIMESTAMP, tz=timezone.utc)


def signed(signature: str = SIGNATURE, timestamp: str = str(TIMESTAMP)) -> Dict[str, str]:
    return {"X-MT-WebHook-Timestamp": timestamp, "X-MT-WebHook-Signature": signature}


def delivery(body: bytes, kind: str = "InteractionProcess", secret: str = SECRET) -> Dict[str, str]:
    """The headers Maitento would send with ``body`` now."""
    now = int(time.time())
    return {
        "x-mt-webhook-type": kind,
        "X-MT-WebHook-AssociatedId": RUN_ID,
        **signed(sign_webhook(secret, now, body), str(now)),
    }


def test_sign_matches_the_shared_test_vector() -> None:
    assert maitento.sign_webhook(SECRET, TIMESTAMP, BODY) == SIGNATURE
    assert sign_webhook(SECRET, TIMESTAMP, BODY.decode("utf-8")) == SIGNATURE
    assert sign_webhook(SECRET, TIMESTAMP, bytearray(BODY)) == SIGNATURE


def test_sign_needs_a_secret_whole_seconds_and_a_raw_body() -> None:
    with pytest.raises(ValueError):
        sign_webhook("", TIMESTAMP, BODY)
    with pytest.raises(ValueError):
        sign_webhook(SECRET, 1793260000.5, BODY)  # type: ignore[arg-type]
    with pytest.raises(ValueError):
        sign_webhook(SECRET, -1, BODY)
    with pytest.raises(TypeError, match="raw body"):
        sign_webhook(SECRET, TIMESTAMP, {"id": "abc"})  # type: ignore[arg-type]


def test_verify_accepts_a_signed_delivery_in_any_header_shape() -> None:
    assert verify_webhook(signed(), BODY, SECRET, now=AT)
    assert verify_webhook(signed(), BODY.decode("utf-8"), SECRET, now=AT)
    lower = {"x-mt-webhook-timestamp": str(TIMESTAMP), "x-mt-webhook-signature": SIGNATURE}
    assert maitento.verify_webhook(lower, BODY, SECRET, now=AT)
    assert verify_webhook(list(signed().items()), BODY, SECRET, now=AT)
    # ASGI raw headers
    raw: List[Tuple[Any, Any]] = [(k.lower().encode(), v.encode()) for k, v in signed().items()]
    assert verify_webhook(raw, BODY, SECRET, now=AT)


def test_verify_accepts_any_one_of_several_v1_signatures_and_ignores_other_schemes() -> None:
    other = "v1=" + "0" * 64
    assert verify_webhook(signed(f"{other}, {SIGNATURE}"), BODY, SECRET, now=AT)
    assert verify_webhook(signed(f"{SIGNATURE},{other}"), BODY, SECRET, now=AT)
    assert verify_webhook(signed(f"v0={SIGNATURE[3:]}, {SIGNATURE}"), BODY, SECRET, now=AT)
    repeated = [("X-MT-WebHook-Timestamp", str(TIMESTAMP)), ("X-MT-WebHook-Signature", other),
                ("X-MT-WebHook-Signature", SIGNATURE)]
    assert verify_webhook(repeated, BODY, SECRET, now=AT)
    assert not verify_webhook(signed(other), BODY, SECRET, now=AT)
    assert not verify_webhook(signed(f"v0={SIGNATURE[3:]}"), BODY, SECRET, now=AT)


def test_verify_rejects_a_wrong_secret_a_changed_body_or_another_timestamp() -> None:
    assert not verify_webhook(signed(), BODY, "whsec_other_secret", now=AT)
    # Parsed and turned back into JSON: the same data, but not the same bytes.
    assert not verify_webhook(signed(), json.dumps(json.loads(BODY)), SECRET, now=AT)
    assert not verify_webhook(signed(), BODY.replace(b"Finished", b"Error"), SECRET, now=AT)
    assert not verify_webhook(signed(SIGNATURE, str(TIMESTAMP + 1)), BODY, SECRET, now=AT)


def test_verify_rejects_missing_or_malformed_headers() -> None:
    assert not verify_webhook({}, BODY, SECRET, now=AT)
    assert not verify_webhook({"X-MT-WebHook-Signature": SIGNATURE}, BODY, SECRET, now=AT)
    assert not verify_webhook({"X-MT-WebHook-Timestamp": str(TIMESTAMP)}, BODY, SECRET, now=AT)
    assert not verify_webhook(signed(""), BODY, SECRET, now=AT)
    assert not verify_webhook(signed(SIGNATURE[3:]), BODY, SECRET, now=AT)
    for stamp in ("", "abc", "-1793260000", "1793260000.0", "1.79326e9", "١٧٩"):
        assert not verify_webhook(signed(SIGNATURE, stamp), BODY, SECRET, now=AT), stamp
    # The plain secret header that older registrations still get is not accepted as proof.
    assert not verify_webhook({"X-MT-WebHook-Secret": SECRET}, BODY, SECRET, now=AT)
    # An unsigned request is turned away before its body is looked at.
    assert not verify_webhook({}, {"id": "abc"}, SECRET)  # type: ignore[arg-type]


def test_verify_rejects_a_timestamp_beyond_the_tolerance_either_way() -> None:
    assert webhooks.DEFAULT_TOLERANCE == 300
    assert verify_webhook(signed(), BODY, SECRET, now=AT + timedelta(seconds=300))
    assert verify_webhook(signed(), BODY, SECRET, now=AT - timedelta(seconds=300))
    assert not verify_webhook(signed(), BODY, SECRET, now=AT + timedelta(seconds=300.5))
    assert not verify_webhook(signed(), BODY, SECRET, now=AT + timedelta(seconds=301))
    assert not verify_webhook(signed(), BODY, SECRET, now=AT - timedelta(seconds=301))
    assert verify_webhook(signed(), BODY, SECRET, now=AT + timedelta(hours=1), tolerance=3600)
    assert not verify_webhook(signed(), BODY, SECRET, now=AT + timedelta(seconds=1), tolerance=0)
    # A naive datetime is UTC.
    assert verify_webhook(signed(), BODY, SECRET, now=AT.replace(tzinfo=None))


def test_verify_checks_against_the_current_time_by_default() -> None:
    now = int(time.time())
    assert verify_webhook(signed(sign_webhook(SECRET, now, BODY), str(now)), BODY, SECRET)
    hour_ago = now - 3600
    assert not verify_webhook(signed(sign_webhook(SECRET, hour_ago, BODY), str(hour_ago)), BODY, SECRET)


def test_verify_needs_a_secret_a_raw_body_and_a_sensible_tolerance() -> None:
    with pytest.raises(ValueError):
        verify_webhook(signed(), BODY, "")
    with pytest.raises(TypeError, match="raw body"):
        verify_webhook(signed(), json.loads(BODY), SECRET, now=AT)
    with pytest.raises(ValueError):
        verify_webhook(signed(), BODY, SECRET, tolerance=-1)
    with pytest.raises(ValueError):
        verify_webhook(signed(), BODY, SECRET, tolerance=float("nan"))


def test_verify_uses_a_constant_time_comparison(monkeypatch: pytest.MonkeyPatch) -> None:
    import hmac

    calls = []
    real = hmac.compare_digest

    def spy(a: bytes, b: bytes) -> bool:
        calls.append((a, b))
        return real(a, b)

    monkeypatch.setattr(hmac, "compare_digest", spy)
    other = "v1=" + "0" * 64
    assert verify_webhook(signed(f"{SIGNATURE}, {other}"), BODY, SECRET, now=AT)
    # Both values are compared, even though the first one matched.
    assert calls == [(SIGNATURE.encode(), SIGNATURE.encode()), (other.encode(), SIGNATURE.encode())]


def test_parse_builds_the_entity_model() -> None:
    body = json.dumps(sample("InteractionProcess", id=RUN_ID, status="Finished", output="Done")).encode()
    event = maitento.parse_webhook(delivery(body), body)
    assert event.type == "InteractionProcess" and event.id == RUN_ID
    assert isinstance(event.entity, maitento.InteractionProcess) and event.entity.output == "Done"
    assert event.raw["status"] == "Finished"


def test_parse_with_secret_verifies_the_signature() -> None:
    body = json.dumps(sample("AppProcess", id="p1")).encode()
    assert maitento.parse_webhook(delivery(body, "AppProcess"), body, secret=SECRET).entity.id == "p1"
    with pytest.raises(maitento.AuthenticationError):
        maitento.parse_webhook(delivery(body, "AppProcess", secret="whsec_other_secret"), body, secret=SECRET)
    with pytest.raises(maitento.AuthenticationError):
        maitento.parse_webhook({"X-MT-WebHook-Type": "AppProcess", "X-MT-WebHook-Secret": SECRET}, body, secret=SECRET)
    with pytest.raises(TypeError, match="raw body"):
        maitento.parse_webhook(delivery(body, "AppProcess"), json.loads(body), secret=SECRET)


def test_parse_unknown_type_or_shape_keeps_raw_json() -> None:
    event = maitento.parse_webhook({"X-MT-WebHook-Type": "SomethingNew"}, '{"id": "x1", "a": 1}')
    assert event.entity == {"id": "x1", "a": 1} and event.id == "x1"
    broken = maitento.parse_webhook({"X-MT-WebHook-Type": "InteractionProcess"}, {"id": "y"})
    assert broken.entity == {"id": "y"}


def test_every_webhook_type_has_a_model() -> None:
    for kind in ("AppProcess", "CapsuleProcess", "CodePipelineProcess", "IngestedFile", "InteractionProcess"):
        model = maitento.WEBHOOK_PAYLOADS[kind]
        event = maitento.parse_webhook({"X-MT-WebHook-Type": kind}, sample(model))
        assert isinstance(event.entity, model)


# ====================================================================================================== registrations

WEBHOOK_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"
HOOK_URL = "https://example.com/maitento/webhook"


def registration(**overrides: Any) -> Dict[str, Any]:
    return sample("WebHookRegistration", id=WEBHOOK_ID, url=HOOK_URL, **overrides)


def test_a_registration_says_whether_it_is_signed_only(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    mock.get(f"/web-hooks/by-id/{WEBHOOK_ID}").mock(return_value=httpx.Response(200, json=registration(signedOnly=False)))
    assert client.webhooks.get(WEBHOOK_ID).signed_only is False


def test_update_sends_signed_only_only_when_given(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.put(f"/web-hooks/by-id/{WEBHOOK_ID}").mock(return_value=httpx.Response(200, json=registration(signedOnly=True)))
    updated = client.webhooks.update(WEBHOOK_ID, url=HOOK_URL, signed_only=True)
    assert json.loads(route.calls.last.request.read()) == {"url": HOOK_URL, "signedOnly": True}
    assert updated.signed_only is True
    client.webhooks.update(WEBHOOK_ID, url=HOOK_URL, headers={"X-Team": None})
    assert json.loads(route.calls.last.request.read()) == {"url": HOOK_URL, "headers": {"X-Team": None}}


async def test_the_async_update_sends_signed_only_too(mock: respx.MockRouter, aclient: maitento.AsyncMaitento) -> None:
    route = mock.put(f"/web-hooks/by-id/{WEBHOOK_ID}").mock(return_value=httpx.Response(200, json=registration(signedOnly=True)))
    updated = await aclient.webhooks.update(WEBHOOK_ID, url=HOOK_URL, signed_only=True)
    assert json.loads(route.calls.last.request.read()) == {"url": HOOK_URL, "signedOnly": True}
    assert updated.signed_only is True
