"""A run's lane wait: whether it waits for a lane before it starts, since when and why."""

from __future__ import annotations

import datetime as dt

import httpx
import respx

import maitento
from factories import sample
from maitento import models


def test_lane_reads_the_runs_wait(mock: respx.MockRouter, client: maitento.Maitento) -> None:
    payload = sample(
        "RunLaneWait",
        processType="App",
        waiting=True,
        waitingSinceUtc="2027-03-10T12:00:00Z",
        lane="Standard",
        reason="LanesInUse",
        lanesInUse=2,
        laneLimit=2,
        ahead=1,
    )
    route = mock.get("/processes/App/r1/lane").mock(return_value=httpx.Response(200, json=payload))

    wait = client.runs.lane("r1", type="App")

    assert route.called
    assert isinstance(wait, models.RunLaneWait)
    assert wait.waiting is True and wait.ahead == 1
    assert wait.reason == models.LaneWaitReason.LANES_IN_USE
    assert isinstance(wait.waiting_since_utc, dt.datetime)
