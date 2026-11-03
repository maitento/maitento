"""The asyncio Maitento client."""

from __future__ import annotations

import os
from typing import Any, Mapping, Optional

import httpx

from .._auth import ApiKeyInput, TokenProvider, resolve_credentials
from .._generated.models import BuildResponse
from .._project import ProjectSource
from ..errors import ConfigurationError
from ._events import AsyncEvents
from ._resources import (
    DEPLOY_TIMEOUT,
    AsyncAgents,
    AsyncApiKeys,
    AsyncBilling,
    AsyncAppRuns,
    AsyncApps,
    AsyncAutomations,
    AsyncBuilds,
    AsyncCapsuleRuns,
    AsyncCapsules,
    AsyncConnectors,
    AsyncCredentials,
    AsyncCredentialStacks,
    AsyncFiles,
    AsyncInteractionRuns,
    AsyncInteractions,
    AsyncInvitations,
    AsyncLooms,
    AsyncModelKeys,
    AsyncModels,
    AsyncNamespaces,
    AsyncPartitions,
    AsyncPipelineRuns,
    AsyncPipelines,
    AsyncRuns,
    AsyncSecrets,
    AsyncTenant,
    AsyncTools,
    AsyncUsage,
    AsyncUsers,
    AsyncVfs,
    AsyncWebhooks,
    Timeout,
)
from ._transport import AsyncTransport

__all__ = ["DEFAULT_BASE_URL", "AsyncMaitento"]

DEFAULT_BASE_URL = "https://api.maitento.com"
DEFAULT_TIMEOUT = 120.0
DEFAULT_MAX_RETRIES = 2


class AsyncMaitento:
    """The Maitento client (asyncio).

    With no arguments it reads ``MAITENTO_API_KEY`` (``"<userId>:<secret>"``), ``MAITENTO_BASE_URL`` and
    ``MAITENTO_NAMESPACE``::

        mt = AsyncMaitento()
        await mt.deploy("./maitento")
        run = await mt.interactions.run("hello")
        print(run.output)

    Credentials (exactly one): ``api_key`` (``"<userId>:<secret>"``, an :class:`~maitento.ApiKey` or a
    ``(user_id, secret)`` pair; ``userId`` is the id of the user that owns the key), ``token`` (a JWT, renewed
    before it expires), ``token_provider`` (a callback returning a JWT), or ``email`` + ``password``.

    Options: ``base_url`` (default ``https://api.maitento.com``), ``namespace`` (the default for by-name calls),
    ``timeout`` (seconds per call, default 120; every method also takes ``timeout=``), ``max_retries`` (default 2,
    idempotent calls only), ``http_client`` (your own ``httpx`` client; it is used as-is and never modified or
    closed), ``user_agent`` (appended to the SDK's).
    """

    def __init__(
        self,
        api_key: Optional[ApiKeyInput] = None,
        *,
        token: Optional[str] = None,
        token_provider: Optional[TokenProvider] = None,
        email: Optional[str] = None,
        password: Optional[str] = None,
        base_url: Optional[str] = None,
        namespace: Optional[str] = None,
        timeout: float = DEFAULT_TIMEOUT,
        max_retries: int = DEFAULT_MAX_RETRIES,
        http_client: Optional[httpx.AsyncClient] = None,
        user_agent: Optional[str] = None,
        environ: Optional[Mapping[str, str]] = None,
    ) -> None:
        env = os.environ if environ is None else environ
        credentials = resolve_credentials(
            api_key=api_key, token=token, token_provider=token_provider, email=email, password=password, environ=env
        )
        resolved_url = (base_url or env.get("MAITENTO_BASE_URL") or DEFAULT_BASE_URL).strip()
        if not resolved_url.startswith(("http://", "https://")):
            raise ConfigurationError(f"base_url must start with http:// or https://, not {resolved_url!r}")
        if max_retries < 0:
            raise ConfigurationError("max_retries cannot be negative")
        self.namespace: Optional[str] = (namespace or env.get("MAITENTO_NAMESPACE") or "").strip() or None
        """The default namespace for by-name calls."""
        self._transport = AsyncTransport(
            base_url=resolved_url,
            credentials=credentials,
            timeout=timeout,
            max_retries=max_retries,
            http_client=http_client,
            user_agent=user_agent,
        )

        self.namespaces = AsyncNamespaces(self)
        self.models = AsyncModels(self)
        self.model_keys = AsyncModelKeys(self)
        self.credentials = AsyncCredentials(self)
        self.credential_stacks = AsyncCredentialStacks(self)
        self.agents = AsyncAgents(self)
        self.interactions = AsyncInteractions(self)
        self.interaction_runs = AsyncInteractionRuns(self)
        self.apps = AsyncApps(self)
        self.app_runs = AsyncAppRuns(self)
        self.capsules = AsyncCapsules(self)
        self.capsule_runs = AsyncCapsuleRuns(self)
        self.pipelines = AsyncPipelines(self)
        self.pipeline_runs = AsyncPipelineRuns(self)
        self.runs = AsyncRuns(self)
        self.connectors = AsyncConnectors(self)
        self.tools = AsyncTools(self)
        self.secrets = AsyncSecrets(self)
        self.webhooks = AsyncWebhooks(self)
        self.partitions = AsyncPartitions(self)
        self.files = AsyncFiles(self)
        self.vfs = AsyncVfs(self)
        self.looms = AsyncLooms(self)
        self.automations = AsyncAutomations(self)
        self.builds = AsyncBuilds(self)
        self.usage = AsyncUsage(self)
        self.billing = AsyncBilling(self)
        self.users = AsyncUsers(self)
        self.api_keys = AsyncApiKeys(self)
        self.invitations = AsyncInvitations(self)
        self.tenant = AsyncTenant(self)
        self.events = AsyncEvents(self)

    @property
    def base_url(self) -> str:
        return self._transport.base_url

    def _require_namespace(self, namespace: Optional[str]) -> str:
        resolved = namespace or self.namespace
        if not resolved:
            raise ConfigurationError(
                "This call needs a namespace: pass namespace=..., or set one on the client (namespace=... or "
                "MAITENTO_NAMESPACE)."
            )
        return resolved

    async def deploy(
        self,
        source: ProjectSource,
        *,
        namespace: Optional[str] = None,
        throw_on_failure: bool = True,
        timeout: Timeout = DEPLOY_TIMEOUT,
    ) -> BuildResponse:
        """Deploys a resource project folder (every ``.mtr``/``.mtc``/``.md``/``.json`` below it), a
        ``{relative/path: text}`` mapping, or a ``BuildRequest``. See ``builds.deploy``."""
        return await self.builds.deploy(source, namespace=namespace, throw_on_failure=throw_on_failure, timeout=timeout)

    async def validate(self, source: ProjectSource, *, namespace: Optional[str] = None, timeout: Timeout = DEPLOY_TIMEOUT) -> BuildResponse:
        """Compiles a project without deploying it. See ``builds.validate``."""
        return await self.builds.validate(source, namespace=namespace, timeout=timeout)

    async def close(self) -> None:
        """Closes open event streams and the HTTP client the SDK created."""
        await self.events.close_all()
        await self._transport.close()

    async def __aenter__(self) -> "AsyncMaitento":
        return self

    async def __aexit__(self, *_: Any) -> None:
        await self.close()

    def __repr__(self) -> str:
        credentials = self._transport.credentials
        kind = "api_key" if credentials.api_key is not None else "jwt"
        return f"{type(self).__name__}(base_url={self.base_url!r}, namespace={self.namespace!r}, auth={kind})"
