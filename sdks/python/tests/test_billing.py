"""Billing: the reads and the balance settings, each call's verb, path and body, and what comes back."""

from __future__ import annotations

import json
from typing import Any

import httpx
import respx

import maitento
from factories import sample
from maitento import models


def body_of(route: respx.Route) -> Any:
    return json.loads(route.calls.last.request.read())


def test_standing_reads_where_the_tenant_stands(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    payload = sample("BillingStanding", tier="Dev", outOfCredit=True, stoppedMeters=["WebSearch"])
    mock.get("/billing/standing").mock(return_value=httpx.Response(200, json=payload))
    standing = client.billing.standing()
    assert isinstance(standing, models.BillingStanding)
    assert standing.tier == models.SkuTier.DEV and standing.out_of_credit is True


def test_notices_send_the_limit_only_when_given(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.get("/billing/notices").mock(return_value=httpx.Response(200, json=[sample("BillingNotice", kind="PlanChanged")]))
    notices = client.billing.notices(limit=5)
    assert route.calls.last.request.url.params["limit"] == "5"
    client.billing.notices()
    assert "limit" not in route.calls.last.request.url.params
    assert notices[0].kind == models.BillingNoticeKind.PLAN_CHANGED


def test_set_auto_top_up_puts_the_settings(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.put("/billing/auto-top-up").mock(return_value=httpx.Response(200, json=sample("AutoTopUpView", enabled=True)))
    view = client.billing.set_auto_top_up(enabled=True, threshold_amount=10, top_up_amount=50)
    assert body_of(route) == {"enabled": True, "thresholdAmount": 10, "topUpAmount": 50}
    assert view.enabled is True


def test_set_alerts_puts_the_settings(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    returned = sample("LowBalanceAlertSettings", emailAtPercentOfLastTopUp=20)
    route = mock.put("/billing/alerts").mock(return_value=httpx.Response(200, json=returned))
    client.billing.set_alerts(email_at_percent_of_last_top_up=20, show_portal_banner=True, email_when_work_refused=False)
    assert body_of(route)["emailAtPercentOfLastTopUp"] == 20 and body_of(route)["emailWhenWorkRefused"] is False


def test_set_retention_puts_the_hours_and_none_goes_back_to_the_default(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    route = mock.put("/tenants/self/retention").mock(return_value=httpx.Response(200, json=sample("TenantRetention", planMaxHours=168)))
    retention = client.tenant.set_retention(hours=168)
    assert body_of(route) == {"hours": 168}
    client.tenant.set_retention(hours=None)
    assert body_of(route) == {"hours": None}
    assert retention.plan_max_hours == 168