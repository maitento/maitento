"""Credentials and JWT lifetime bookkeeping. No I/O here: the transports do the calls.

- An API key goes on the wire as ``Authorization: ApiKey <userId> <secret>``. ``userId`` is the id of the user who
  owns the key, NOT the key's own id.
- A JWT is renewed with ``GET /auth/renew`` at 80% of its lifetime, or on the first call when less than five minutes
  remain. It is never left to expire.
"""

from __future__ import annotations

import base64
import binascii
import json
import os
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Mapping, Optional, Tuple, Union

from .errors import ConfigurationError

__all__ = ["ApiKey", "ApiKeyInput", "Credentials", "JwtState", "TokenProvider", "jwt_claims", "resolve_credentials"]

RENEW_FRACTION = 0.8
"""Renew a JWT once this fraction of its lifetime has passed."""

RENEW_MARGIN_SECONDS = 300.0
"""...or as soon as less than this many seconds remain."""


@dataclass(frozen=True)
class ApiKey:
    """An API key: the id of the user that owns it and the key's secret.

    ``ApiKey.parse("<userId>:<secret>")`` reads the single-string form the portal shows (and ``MAITENTO_API_KEY`` holds).
    """

    user_id: str
    secret: str = field(repr=False)

    @classmethod
    def parse(cls, value: str) -> "ApiKey":
        user_id, sep, secret = value.strip().partition(":")
        if not sep or not user_id.strip() or not secret.strip():
            raise ConfigurationError(
                'An API key string must look like "<userId>:<secret>" (the id of the user that owns the key, a colon, '
                "then the secret)."
            )
        return cls(user_id.strip(), secret.strip())

    @property
    def authorization(self) -> str:
        """The ``Authorization`` header value."""
        return f"ApiKey {self.user_id} {self.secret}"

    def __repr__(self) -> str:  # never print the secret
        return f"ApiKey(user_id={self.user_id!r}, secret='***')"


ApiKeyInput = Union[str, ApiKey, Tuple[str, str], Mapping[str, str]]
"""An API key as ``"<userId>:<secret>"``, an :class:`ApiKey`, a ``(user_id, secret)`` pair or a mapping with
``user_id``/``userId`` and ``secret``."""

TokenProvider = Callable[[], Union[str, Awaitable[str]]]
"""A callback returning a JWT (``AsyncMaitento`` also accepts an async callback)."""


def _api_key(value: ApiKeyInput) -> ApiKey:
    if isinstance(value, ApiKey):
        return value
    if isinstance(value, str):
        return ApiKey.parse(value)
    if isinstance(value, tuple) and len(value) == 2:
        return ApiKey(str(value[0]), str(value[1]))
    if isinstance(value, Mapping):
        user_id = value.get("user_id", value.get("userId"))
        secret = value.get("secret")
        if user_id and secret:
            return ApiKey(str(user_id), str(secret))
    raise ConfigurationError("api_key must be '<userId>:<secret>', an ApiKey, a (user_id, secret) pair or a mapping.")


@dataclass(frozen=True)
class Credentials:
    """Exactly one way of authenticating, resolved from the client's arguments and the environment."""

    api_key: Optional[ApiKey] = None
    token: Optional[str] = field(default=None, repr=False)
    token_provider: Optional[TokenProvider] = None
    email: Optional[str] = None
    password: Optional[str] = field(default=None, repr=False)

    @property
    def is_jwt(self) -> bool:
        return self.api_key is None


def resolve_credentials(
    *,
    api_key: Optional[ApiKeyInput],
    token: Optional[str],
    token_provider: Optional[TokenProvider],
    email: Optional[str],
    password: Optional[str],
    environ: Mapping[str, str] = os.environ,
) -> Credentials:
    """Picks the one credential the client uses. Explicit arguments win; ``MAITENTO_API_KEY`` is the fallback."""
    if (email is None) != (password is None):
        raise ConfigurationError("email and password must be given together.")
    given = [
        name
        for name, present in (
            ("api_key", api_key is not None),
            ("token", token is not None),
            ("token_provider", token_provider is not None),
            ("email/password", email is not None),
        )
        if present
    ]
    if len(given) > 1:
        raise ConfigurationError(f"Pass only one kind of credential, not {' and '.join(given)}.")
    if api_key is not None:
        return Credentials(api_key=_api_key(api_key))
    if token is not None:
        if not token.strip():
            raise ConfigurationError("token is empty.")
        return Credentials(token=token.strip())
    if token_provider is not None:
        return Credentials(token_provider=token_provider)
    if email is not None and password is not None:
        return Credentials(email=email, password=password)
    from_env = environ.get("MAITENTO_API_KEY", "").strip()
    if from_env:
        return Credentials(api_key=ApiKey.parse(from_env))
    raise ConfigurationError(
        "No credentials: pass api_key='<userId>:<secret>' (or token=, token_provider=, email= + password=), "
        "or set MAITENTO_API_KEY."
    )


def jwt_claims(token: str) -> Optional[dict[str, Any]]:
    """The (unverified) payload of a JWT, or ``None`` when ``token`` is not one. Used only to read ``exp``/``iat``."""
    parts = token.split(".")
    if len(parts) != 3:
        return None
    payload = parts[1] + "=" * (-len(parts[1]) % 4)
    try:
        claims = json.loads(base64.urlsafe_b64decode(payload.encode("ascii")))
    except (ValueError, binascii.Error, UnicodeError):
        return None
    return claims if isinstance(claims, dict) else None


def _number(value: Any) -> Optional[float]:
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


@dataclass(frozen=True)
class JwtState:
    """A JWT and when to renew it. Times are seconds since the epoch."""

    token: str = field(repr=False)
    expires_at: Optional[float]
    issued_at: float

    @classmethod
    def create(cls, token: str, *, now: float, expires_at: Optional[float] = None) -> "JwtState":
        """Reads ``exp``/``iat`` from the token; ``expires_at`` (from the login response) fills a missing ``exp``."""
        claims = jwt_claims(token) or {}
        exp = _number(claims.get("exp")) or expires_at
        iat = _number(claims.get("iat")) or _number(claims.get("nbf")) or now
        if exp is not None and iat >= exp:
            iat = now
        return cls(token=token, expires_at=exp, issued_at=min(iat, now))

    @property
    def renew_at(self) -> Optional[float]:
        if self.expires_at is None:
            return None
        lifetime = max(self.expires_at - self.issued_at, 0.0)
        return min(self.issued_at + lifetime * RENEW_FRACTION, self.expires_at - RENEW_MARGIN_SECONDS)

    def should_renew(self, now: float) -> bool:
        renew_at = self.renew_at
        return renew_at is not None and now >= renew_at

    def is_expired(self, now: float) -> bool:
        return self.expires_at is not None and now >= self.expires_at
