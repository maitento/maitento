"""The official Python SDK for Maitento, the AI OS.

    from maitento import Maitento

    mt = Maitento()                         # reads MAITENTO_API_KEY, MAITENTO_BASE_URL, MAITENTO_NAMESPACE
    mt.deploy("./maitento")                 # the resource project folder
    run = mt.interactions.run("hello")      # start, wait, return the finished run
    print(run.output)

``Maitento`` blocks; ``AsyncMaitento`` has the identical surface with ``await``. Errors are in
:mod:`maitento.errors` (all exported here), wire models in :mod:`maitento.models` (also exported here).
"""

from ._async import AsyncEvents, AsyncEventStream, AsyncMaitento, AsyncPage, AsyncSubscription, AsyncVfsHandle
from ._auth import ApiKey
from ._events_core import EVENT_NAMES, Event
from ._run_core import TranscriptEntry, transcript
from ._sync import EventStream, Events, Maitento, Page, Subscription, VfsHandle
from ._uploads import FileInput
from ._usage import UsageFilters
from ._version import __version__
from .errors import (
    AbortedError,
    ApiError,
    AuthenticationError,
    BuildFailedError,
    CapsuleCommandAbortedError,
    ConfigurationError,
    ConflictError,
    ConnectionError,
    FileIngestionError,
    MaitentoError,
    NotFoundError,
    PermissionError,
    ProcessFailedError,
    RateLimitError,
    RequestTooLargeError,
    ResponseParseError,
    TimeoutError,
    ValidationError,
    ValidationFailure,
)
from .models import *  # noqa: F401,F403
from .models import __all__ as _models_all
from .webhooks import WebhookEvent, parse_webhook, sign_webhook, verify_webhook

__all__ = [
    "EVENT_NAMES",
    "AbortedError",
    "ApiError",
    "ApiKey",
    "AsyncEventStream",
    "AsyncEvents",
    "AsyncMaitento",
    "AsyncPage",
    "AsyncSubscription",
    "AsyncVfsHandle",
    "AuthenticationError",
    "BuildFailedError",
    "CapsuleCommandAbortedError",
    "ConfigurationError",
    "ConflictError",
    "ConnectionError",
    "Event",
    "EventStream",
    "Events",
    "FileIngestionError",
    "FileInput",
    "Maitento",
    "MaitentoError",
    "NotFoundError",
    "Page",
    "PermissionError",
    "ProcessFailedError",
    "RateLimitError",
    "RequestTooLargeError",
    "ResponseParseError",
    "Subscription",
    "TimeoutError",
    "TranscriptEntry",
    "UsageFilters",
    "ValidationError",
    "ValidationFailure",
    "VfsHandle",
    "WebhookEvent",
    "__version__",
    "parse_webhook",
    "sign_webhook",
    "transcript",
    "verify_webhook",
    *_models_all,
]
