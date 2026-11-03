"""Every error the Maitento SDK raises. All of them derive from :class:`MaitentoError`.

Branch on the error **type** and its ``code``, never on message text: messages are for people and may change.

``PermissionError``, ``ConnectionError`` and ``TimeoutError`` deliberately reuse the built-in names (as the SDK design
asks) and also derive from the built-in classes, so ``except TimeoutError`` catches the SDK's timeout too.
"""

from __future__ import annotations

import builtins
from dataclasses import dataclass
from typing import Any, List, Mapping, Optional

__all__ = [
    "AbortedError",
    "ApiError",
    "AuthenticationError",
    "BuildFailedError",
    "CapsuleCommandAbortedError",
    "ConfigurationError",
    "ConflictError",
    "ConnectionError",
    "FileIngestionError",
    "MaitentoError",
    "NotFoundError",
    "PermissionError",
    "ProcessFailedError",
    "RateLimitError",
    "RequestTooLargeError",
    "ResponseParseError",
    "TimeoutError",
    "ValidationError",
    "ValidationFailure",
]


class MaitentoError(Exception):
    """Base class of every error raised by the SDK."""


class ConfigurationError(MaitentoError, ValueError):
    """The client was configured inconsistently (no credentials, two kinds of credentials, no namespace, ...)."""


class ApiError(MaitentoError):
    """The API answered with a non-2xx status.

    Attributes:
        status: the HTTP status code.
        code: the stable error code from the body (``"api:rate-limited"``, ``"api:agent:delete:in-use"``, ...), if any.
        body: the decoded response body (a ``dict`` for JSON, ``str`` for text, ``None`` when empty).
        headers: the response headers.
        method: the request method.
        url: the request URL.
    """

    def __init__(
        self,
        message: str,
        *,
        status: int,
        code: Optional[str] = None,
        body: Any = None,
        headers: Optional[Mapping[str, str]] = None,
        method: Optional[str] = None,
        url: Optional[str] = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code
        self.body = body
        self.headers: Mapping[str, str] = dict(headers or {})
        self.method = method
        self.url = url

    def __str__(self) -> str:
        return self.message


@dataclass(frozen=True)
class ValidationFailure:
    """One failure of a 400 ``validationFailures`` body."""

    code: str
    """The stable code, e.g. ``"api:validation-failure:system-prompt"`` or ``"api:auth:email-not-verified"``."""
    member: str
    """The request member the failure is about (``"Name"``, ``"request"``, ...)."""
    message: str
    """Human-readable text. Do not branch on it."""


class ValidationError(ApiError):
    """400 with a ``validationFailures`` body: the request was refused before anything happened."""

    def __init__(self, message: str, *, failures: List[ValidationFailure], **kwargs: Any) -> None:
        super().__init__(message, **kwargs)
        self.failures = failures

    @property
    def codes(self) -> List[str]:
        """The ``code`` of every failure, in order."""
        return [failure.code for failure in self.failures]


class AuthenticationError(ApiError):
    """401: no credential, or one the server refused (unknown, wrong secret, disabled, expired)."""


class PermissionError(ApiError, builtins.PermissionError):  # noqa: A001 - the name is the design's
    """403: authenticated, but not allowed. ``code`` is set when the server gave a reason."""


class NotFoundError(ApiError):
    """404 (or an empty 204 where a resource was expected). Unknown ids and other tenants' resources both land here."""


class ConflictError(ApiError):
    """409: a concurrent change won. Re-read and try again."""


class RequestTooLargeError(ApiError):
    """413: the request body is over the server's limit (``max_request_body_bytes``)."""

    def __init__(self, message: str, *, max_request_body_bytes: Optional[int] = None, **kwargs: Any) -> None:
        super().__init__(message, **kwargs)
        self.max_request_body_bytes = max_request_body_bytes


class FileIngestionError(ApiError):
    """422 from file ingestion: the file could not be read, or its extracted text was implausibly thin.

    This is permanent for that file; retrying the same bytes fails the same way.
    """

    def __init__(
        self,
        message: str,
        *,
        category: Optional[str] = None,
        ocr_attempted: Optional[bool] = None,
        guidance: Optional[str] = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(message, **kwargs)
        self.category = category
        self.ocr_attempted = ocr_attempted
        self.guidance = guidance


class RateLimitError(ApiError):
    """429: slow down. ``retry_after`` is the number of seconds the server asked for, when it said."""

    def __init__(self, message: str, *, retry_after: Optional[float] = None, **kwargs: Any) -> None:
        super().__init__(message, **kwargs)
        self.retry_after = retry_after


class ProcessFailedError(MaitentoError):
    """A ``run()`` helper's run ended ``Error`` or ``Killed``. ``run`` is the run in its final state."""

    def __init__(self, message: str, *, run: Any, failure_details: Optional[str] = None) -> None:
        super().__init__(message)
        self.run = run
        self.failure_details = failure_details

    @property
    def status(self) -> str:
        """The run's final status (``"Error"`` or ``"Killed"``)."""
        return str(getattr(self.run, "status", ""))


class CapsuleCommandAbortedError(MaitentoError):
    """The capsule run ended (it was terminated, ran out of time or failed) before a command that
    ``capsule_runs.exec_and_wait`` was waiting for could finish, so the command ended ``AbortedOnTermination``.
    ``command`` is the command in that state; its ``failure_details`` say why."""

    def __init__(self, message: str, *, command: Any, run_id: str) -> None:
        super().__init__(message)
        self.command = command
        self.run_id = run_id

    @property
    def failure_details(self) -> Optional[str]:
        """Why the command did not finish."""
        details = getattr(self.command, "failure_details", None)
        return None if details is None else str(details)


class ConnectionError(MaitentoError, builtins.ConnectionError):  # noqa: A001 - the name is the design's
    """The API could not be reached (DNS, refused, reset, TLS, ...). ``__cause__`` is the underlying error."""


class TimeoutError(MaitentoError, builtins.TimeoutError):  # noqa: A001 - the name is the design's
    """A call, or a ``run()`` helper, took longer than its timeout. A run that timed out is still running unless
    ``kill_on_abort`` was set; ``run`` is its last known state when there is one."""

    def __init__(self, message: str, *, run: Any = None) -> None:
        super().__init__(message)
        self.run = run


class AbortedError(MaitentoError):
    """A ``run()`` helper was aborted through its ``abort`` event. The run keeps going unless ``kill_on_abort``."""

    def __init__(self, message: str, *, run: Any = None) -> None:
        super().__init__(message)
        self.run = run


class ResponseParseError(MaitentoError):
    """A 2xx response did not have the shape the SDK expected (a server newer than the SDK in an incompatible way)."""

    def __init__(self, message: str, *, body: Any = None) -> None:
        super().__init__(message)
        self.body = body


class BuildFailedError(MaitentoError):
    """``deploy()`` compiled the project with errors, so nothing was deployed.

    ``response`` is the full build response; ``errors`` its ``Error``-level log entries.
    """

    def __init__(self, message: str, *, response: Any) -> None:
        super().__init__(message)
        self.response = response

    @property
    def errors(self) -> List[Any]:
        """The ``Error``-level entries of the build log."""
        return [entry for entry in getattr(self.response, "log", []) if str(entry.log_level) == "Error"]
