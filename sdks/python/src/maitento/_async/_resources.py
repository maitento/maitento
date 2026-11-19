"""Every resource group of :class:`AsyncMaitento` (``client.agents``, ``client.interactions``, ...).

Conventions, for every group:

- ``get...`` raises :class:`~maitento.NotFoundError`; ``find...`` returns ``None`` instead.
- ``list(namespace=...)`` lists the whole tenant, or one namespace when given. By-name calls use the client's default
  namespace unless ``namespace=`` is passed.
- A request body can be given as the generated request model, as a mapping (camelCase or snake_case keys), as
  keyword arguments, or a mix (keywords win).
- ``timeout=`` (seconds) overrides the client's timeout for that one call.
- Starting work (``start``, ``run``, ``deploy``, ``upload``) is never retried automatically.
"""

from __future__ import annotations

import base64
import datetime as _dt
import json
from typing import TYPE_CHECKING, Any, Callable, Dict, List, Mapping, Optional, Sequence, Type, TypeVar, Union, cast

from typing_extensions import Unpack

from .. import _aio
from .._generated.models import (
    AddMessageResult,
    Agent,
    AgentCreateRequest,
    AgentUpdateRequest,
    AiModel,
    App,
    AppProcess,
    AppProcessWithDetails,
    AppStartRequest,
    AutoTopUpApiRequest,
    AutoTopUpView,
    AutomatedAction,
    BillingCatalogue,
    BillingNotice,
    BillingStanding,
    BuildRecord,
    BuildRecordPage,
    BuildRecordSummary,
    BuildResponse,
    Capsule,
    CapsuleProcess,
    CapsuleProcessCommand,
    CapsuleProcessRunCommandRequest,
    CapsuleProcessStartRequest,
    CapsuleProcessWithDetails,
    CodePipeline,
    CodePipelineCreateRequest,
    CodePipelineProcess,
    CodePipelineProcessCredentialsInput,
    CodePipelineProcessDiff,
    CodePipelineProcessDiffRaw,
    CodePipelineProcessPayloadsResponse,
    CodePipelineProcessRepoInput,
    CodePipelineProcessResumeWithPromptRequest,
    CodePipelineProcessStartRequestInput,
    CodePipelineUpdateRequest,
    Connector,
    CreateAutomatedActionRequest,
    CredentialSignInResult,
    CredentialSignInStart,
    CredentialSignInTokensRequest,
    CredentialStack,
    CredentialStackRequest,
    CredentialStackUsage,
    CredentialTestResult,
    CronScheduleInput,
    CurrentUserResponse,
    DefaultCredentialStack,
    EffectiveEntitlements,
    EmbeddingModelDefinition,
    EmbeddingsSearchResult,
    ExecutionHistoryEntry,
    ExternalOperation,
    FileSystemDirectory,
    FileSystemEntry,
    FileSystemFile,
    FileTextResponse,
    IngestedFile,
    IngestedFileListItem,
    IngestedFilePage,
    IngestedFileSummary,
    Interaction,
    InteractionProcess,
    InteractionProcessStartRequest,
    InteractionProcessToolResult,
    InteractionProcessWithDetails,
    InvitationCode,
    Invite,
    InviteEmailResponse,
    Loom,
    LoomCreateRequest,
    LoomInspection,
    LoomPattern,
    LoomReflection,
    LoomSeeding,
    LoomSession,
    LoomTensionView,
    LoomThread,
    LoomUpdateRequest,
    LowBalanceAlertSettings,
    ManagedInteraction,
    ManagedInteractionCreateRequest,
    ManagedInteractionUpdateRequest,
    McpConnector,
    McpConnectorCreateRequest,
    McpExternalOperation,
    McpExternalOperationCreateRequest,
    MessageTriggerInput,
    ModelCredential,
    ModelCredentialRequest,
    Namespace,
    NightWeaving,
    OneShotInteraction,
    OneShotInteractionCreateRequest,
    OneShotInteractionUpdateRequest,
    OpenApiConnector,
    OpenApiConnectorCreateRequest,
    OpenApiExternalOperation,
    OpenApiExternalOperationCreateRequest,
    Partition,
    PartitionEmbeddingCredentialsRequest,
    PartitionEmbeddingProbeRequest,
    PartitionEmbeddingProbeResult,
    PartitionEmbeddingProfileRequest,
    PartitionEmbeddingStatus,
    PatternChange,
    ProcessDashboard,
    ProcessPage,
    ProcessRetentionStatus,
    ProcessSummary,
    RoundRobinInteraction,
    RoundRobinInteractionCreateRequest,
    RoundRobinInteractionUpdateRequest,
    RunLaneWait,
    Secret,
    SendInviteRequest,
    SendInviteResponse,
    TapestryPanel,
    TapestryPreview,
    TenantBalance,
    TenantModelAccess,
    TenantModelKey,
    TenantRetention,
    ThreadRecollection,
    ThreadWeaveRequest,
    TriggerResponse,
    UpdateAutomatedActionRequest,
    UsageBreakdown,
    UsageRunPage,
    UsageSeries,
    UsageSummary,
    User,
    UserApiCreateResponse,
    UserApiKey,
    UserApiKeyCreateRequest,
    VirtualFileSystem,
    WeaveResult,
    WebAccessSettings,
    WebHookDelivery,
    WebHookRegistration,
    WebUsageRecord,
)
from .._generated.models import (
    BatchEditRequest,
    BatchEditResponse,
    BatchReadRequest,
    BatchReadResponse,
    EditRequest,
    EditResponse,
    FindRequest,
    FindResponse,
    TreeRequest,
    TreeResponse,
)
from .._http import NO_BODY, RequestSpec, build_model, inputs_list, parse, path, query, wire
from .._project import ProjectSource, project_request
from .._run_core import APP, CAPSULE, INTERACTION, PIPELINE, ProcessKind, TranscriptEntry, transcript
from .._uploads import FileInput, multipart_file
from .._usage import UsageFilters, usage_query
from ..errors import BuildFailedError, NotFoundError
from ._paging import AsyncPage
from ._run import RunCallback, TokenCallback, queue_and_wait, start_and_follow

if TYPE_CHECKING:
    from ._client import AsyncMaitento

T = TypeVar("T")
M = TypeVar("M")

Timeout = Optional[float]
"""Seconds; ``None`` uses the client's timeout."""

Body = Union[Mapping[str, Any], None]

DEPLOY_TIMEOUT = 300.0
"""Builds and file ingestion run inside the request and can take minutes."""


class _AsyncResource:
    def __init__(self, client: "AsyncMaitento") -> None:
        self._client = client

    def _ns(self, namespace: Optional[str]) -> str:
        return self._client._require_namespace(namespace)

    async def _send(self, spec: RequestSpec) -> Any:
        return await self._client._transport.request(spec)

    async def _one(self, tp: Type[T], spec: RequestSpec) -> T:
        spec.expect_body = True
        return cast(T, parse(tp, await self._send(spec)))

    async def _one_of(self, tp: Any, spec: RequestSpec) -> Any:
        """Like ``_one`` for a union alias (``Interaction``, ``Connector``, ...)."""
        spec.expect_body = True
        return parse(tp, await self._send(spec))

    async def _many(self, tp: Any, spec: RequestSpec) -> List[Any]:
        data = await self._send(spec)
        return [parse(tp, item) for item in (data or [])]

    async def _find(self, tp: Type[T], spec: RequestSpec) -> Optional[T]:
        try:
            return await self._one(tp, spec)
        except NotFoundError:
            return None

    async def _find_of(self, tp: Any, spec: RequestSpec) -> Any:
        try:
            return await self._one_of(tp, spec)
        except NotFoundError:
            return None

    async def _void(self, spec: RequestSpec) -> None:
        await self._send(spec)

    async def _run(self, kind: ProcessKind, start: Callable[[], Any], **options: Any) -> Any:
        return await start_and_follow(self._client, kind, start, **options)

    def _target(
        self,
        name: Optional[str],
        id: Optional[str],
        namespace: Optional[str],
        by_name: str,
        by_id: str,
        **by_id_params: Any,
    ) -> str:
        """The start URL for a definition given by ``name`` (in a namespace) or by ``id``, never both."""
        if (name is None) == (id is None):
            raise ValueError("Pass the definition's name, or id=..., but not both.")
        if id is not None:
            return path(by_id, id=id, **by_id_params)
        return path(by_name, ns=self._ns(namespace), name=name)


def _pinned(id: Optional[str], version: Optional[int]) -> Optional[int]:
    """Apps and capsules start by id only as one pinned version (by name, the latest one)."""
    if id is not None and version is None:
        raise ValueError("Starting by id= needs version= too (start by name for the latest version).")
    if id is None and version is not None:
        raise ValueError("version= pins a version of the definition given by id=; by name the latest version runs.")
    return version


def _get(url: str, timeout: Timeout, *pairs: Any) -> RequestSpec:
    return RequestSpec("GET", url, query=query(*pairs), timeout=timeout)


def _start_body(model: Any, request: Any, fields: Mapping[str, Any]) -> Any:
    """A start request: ``inputs`` may be a ``{name: value}`` mapping, and defaults to none."""
    if "inputs" in fields:
        fields = {**fields, "inputs": inputs_list(fields["inputs"])}
    if isinstance(request, Mapping) and "inputs" in request:
        request = {**request, "inputs": inputs_list(request["inputs"])}
    return wire(build_model(model, request, fields, defaults={"inputs": []}))


# ======================================================================================================== namespaces


class AsyncNamespaces(_AsyncResource):
    """Namespaces: every definition lives in one."""

    async def list(self, *, timeout: Timeout = None) -> List[Namespace]:
        """Every namespace of the tenant."""
        return await self._many(Namespace, _get("/namespaces", timeout))

    async def get(self, name: str, *, timeout: Timeout = None) -> Namespace:
        """The namespace called ``name``."""
        return await self._one(Namespace, _get(path("/namespaces/by-name/{name}", name=name), timeout))

    async def find(self, name: str, *, timeout: Timeout = None) -> Optional[Namespace]:
        """The namespace called ``name``, or ``None``."""
        return await self._find(Namespace, _get(path("/namespaces/by-name/{name}", name=name), timeout))

    async def get_by_id(self, id: str, *, timeout: Timeout = None) -> Namespace:
        return await self._one(Namespace, _get(path("/namespaces/by-id/{id}", id=id), timeout))

    async def find_by_id(self, id: str, *, timeout: Timeout = None) -> Optional[Namespace]:
        return await self._find(Namespace, _get(path("/namespaces/by-id/{id}", id=id), timeout))

    async def create(self, name: str, *, timeout: Timeout = None) -> Namespace:
        """Creates a namespace."""
        return await self._one(Namespace, RequestSpec("POST", "/namespaces", json={"name": name}, timeout=timeout))

    async def rename(self, id: str, name: str, *, timeout: Timeout = None) -> Namespace:
        spec = RequestSpec("PUT", path("/namespaces/by-id/{id}", id=id), json={"name": name}, timeout=timeout)
        return await self._one(Namespace, spec)

    async def delete(self, id: str, *, timeout: Timeout = None) -> None:
        """Deletes an empty namespace (``ValidationError`` code ``api:namespace:delete:not-empty`` otherwise)."""
        await self._void(RequestSpec("DELETE", path("/namespaces/by-id/{id}", id=id), timeout=timeout))

    async def web_access(self, id: str, *, timeout: Timeout = None) -> WebAccessSettings:
        """The namespace's web-tool settings (its default download partition)."""
        return await self._one(WebAccessSettings, _get(path("/namespaces/by-id/{id}/web-access", id=id), timeout))

    async def set_web_access(
        self, id: str, *, default_web_download_partition_id: Optional[str], timeout: Timeout = None
    ) -> WebAccessSettings:
        """Sets the namespace's default web download partition (``None`` clears it). Tenant admins only."""
        spec = RequestSpec(
            "PUT",
            path("/namespaces/by-id/{id}/web-access", id=id),
            json={"defaultWebDownloadPartitionId": default_web_download_partition_id},
            idempotent=True,
            timeout=timeout,
        )
        return await self._one(WebAccessSettings, spec)


# ============================================================================================================ models


class AsyncModels(_AsyncResource):
    """The AI model catalogue."""

    async def list(self, *, timeout: Timeout = None) -> List[AiModel]:
        """Every model an agent can use (``AiModel.name`` is what ``model = @ref("...")`` names)."""
        return await self._many(AiModel, _get("/ai-models", timeout))


class AsyncModelKeys(_AsyncResource):
    """The tenant's own model provider keys. The secret is write-only: responses carry only ``key_hint``."""

    async def list(self, *, timeout: Timeout = None) -> List[TenantModelKey]:
        return await self._many(TenantModelKey, _get("/tenants/self/model-keys", timeout))

    async def create(
        self,
        *,
        provider: str,
        label: str,
        api_key: str,
        base_url: Optional[str] = None,
        model_name_overrides: Optional[Mapping[str, str]] = None,
        priority: Optional[int] = None,
        timeout: Timeout = None,
    ) -> TenantModelKey:
        """Adds a key (``provider``: ``Anthropic``, ``OpenAi``, ``DeepSeek``, ``Gemini``, ``Qwen``, ``Glm`` or
        ``Kimi``). Lower ``priority`` is tried first. Tenant admins only."""
        body = _drop_none(
            {
                "provider": provider,
                "label": label,
                "apiKey": api_key,
                "baseUrl": base_url,
                "modelNameOverrides": dict(model_name_overrides) if model_name_overrides is not None else None,
                "priority": priority,
            }
        )
        return await self._one(TenantModelKey, RequestSpec("POST", "/tenants/self/model-keys", json=body, timeout=timeout))

    async def update(
        self,
        id: str,
        *,
        label: str,
        priority: int,
        is_disabled: bool = False,
        base_url: Optional[str] = None,
        model_name_overrides: Optional[Mapping[str, str]] = None,
        api_key: Optional[str] = None,
        timeout: Timeout = None,
    ) -> TenantModelKey:
        """Replaces a key's settings (the provider cannot change). The stored secret is kept unless ``api_key``."""
        body = _drop_none(
            {
                "label": label,
                "baseUrl": base_url,
                "modelNameOverrides": dict(model_name_overrides) if model_name_overrides is not None else None,
                "priority": priority,
                "isDisabled": is_disabled,
                "apiKey": api_key,
            }
        )
        spec = RequestSpec("PUT", path("/tenants/self/model-keys/by-id/{id}", id=id), json=body, timeout=timeout)
        return await self._one(TenantModelKey, spec)

    async def delete(self, id: str, *, timeout: Timeout = None) -> None:
        await self._void(RequestSpec("DELETE", path("/tenants/self/model-keys/by-id/{id}", id=id), timeout=timeout))


def _drop_none(body: Dict[str, Any]) -> Dict[str, Any]:
    return {key: value for key, value in body.items() if value is not None}


# ======================================================================================================= credentials


class AsyncCredentials(_AsyncResource):
    """The tenant's own credentials for model providers. Runs never name a credential: they use a credential stack of
    them (``client.credential_stacks``).

    A credential is a provider plus either its API keys, tried in order, or (``kind`` ``OAuth``) a coding agent's
    subscription sign-in (``start_sign_in``). It also lists the models it may serve (none: any of the provider's), with
    their deployment names, and may have an endpoint (none: the provider's public API) and a ``tag`` for grouping.
    Keys are write-only: a response carries only each key's ``id`` and ``key_hint``. Anyone in the tenant can read
    credentials; creating, changing, testing and deleting them needs a tenant admin.
    """

    async def list(self, *, tag: Optional[str] = None, timeout: Timeout = None) -> List[ModelCredential]:
        """Every credential of the tenant, by name; with ``tag``, only the credentials that have it."""
        return await self._many(ModelCredential, _get("/credentials", timeout, ("tag", tag)))

    async def get(self, id: str, *, timeout: Timeout = None) -> ModelCredential:
        return await self._one(ModelCredential, _get(path("/credentials/by-id/{id}", id=id), timeout))

    async def find(self, id: str, *, timeout: Timeout = None) -> Optional[ModelCredential]:
        """The credential with ``id``, or ``None``."""
        return await self._find(ModelCredential, _get(path("/credentials/by-id/{id}", id=id), timeout))

    async def create(
        self, request: Union[ModelCredentialRequest, Body] = None, *, timeout: Timeout = None, **fields: Any
    ) -> ModelCredential:
        """Creates an API-key credential: ``name``, ``provider`` (``Anthropic``, ``OpenAi``, ``DeepSeek``, ``Gemini``,
        ``Qwen``, ``Glm`` or ``Kimi``) and ``keys`` (``[{"value": ...}]``, tried in order), plus optional ``models``
        (``[{"model": "gpt-5", "deploymentName": ...}]``), ``endpoint`` (an HTTPS URL on the public internet),
        ``description`` and ``tag``. Returns it with its ``id``. Tenant admins only."""
        body = wire(build_model(ModelCredentialRequest, request, fields))
        return await self._one(ModelCredential, RequestSpec("POST", "/credentials", json=body, timeout=timeout))

    async def update(
        self, id: str, request: Union[ModelCredentialRequest, Body] = None, *, timeout: Timeout = None, **fields: Any
    ) -> ModelCredential:
        """Replaces every field of a credential, so send them all: one left out is cleared. Keys are matched by id:
        ``{"id": ...}`` keeps that key and its secret, ``{"id": ..., "value": ...}`` replaces its secret,
        ``{"value": ...}`` adds a key, and a key left out is removed. A sign-in (OAuth) credential sends no ``keys``
        and its own ``provider``: those and its endpoint come from signing in (``ValidationError`` code
        ``api:credentials:sign-in-fixed`` otherwise). Tenant admins only."""
        body = wire(build_model(ModelCredentialRequest, request, fields))
        spec = RequestSpec("PUT", path("/credentials/by-id/{id}", id=id), json=body, timeout=timeout)
        return await self._one(ModelCredential, spec)

    async def delete(self, id: str, *, timeout: Timeout = None) -> None:
        """Deletes a credential and takes it out of every stack that holds it. Tenant admins only."""
        await self._void(RequestSpec("DELETE", path("/credentials/by-id/{id}", id=id), timeout=timeout))

    async def delete_by_tag(self, tag: str, *, timeout: Timeout = None) -> int:
        """Deletes every credential with ``tag``, taking each out of its stacks, and returns how many it deleted. An
        empty tag is refused (``ValidationError`` code ``api:credentials:tag-invalid``). Tenant admins only."""
        spec = RequestSpec("DELETE", "/credentials", query=query(("tag", tag)), timeout=timeout)
        return cast(int, parse(int, await self._send(spec)))

    async def test(self, id: str, *, timeout: Timeout = None) -> CredentialTestResult:
        """Tests a credential without running a model: each key lists the provider's models once, at the credential's
        endpoint. ``succeeded`` is true when every key passed; ``keys`` says how each one did, and ``error_code`` is
        the first failing key's code. A passing test switches back on a credential its circuit breaker had turned off.
        Limited to a few a minute per tenant (``RateLimitError``). Tenant admins only."""
        spec = RequestSpec("POST", path("/credentials/by-id/{id}/test", id=id), timeout=timeout)
        return await self._one(CredentialTestResult, spec)

    async def test_unsaved(
        self, request: Union[ModelCredentialRequest, Body] = None, *, timeout: Timeout = None, **fields: Any
    ) -> CredentialTestResult:
        """Tests a credential before saving it, so a failing one never has to exist: the same checks and calls as
        ``test``, on the keys given (what ``create`` takes). Nothing is stored, and ``credential_id`` comes back empty.
        Refused with ``create``'s codes, and shares ``test``'s limit. Tenant admins only."""
        body = wire(build_model(ModelCredentialRequest, request, fields))
        return await self._one(CredentialTestResult, RequestSpec("POST", "/credentials/test", json=body, timeout=timeout))

    async def start_sign_in(
        self, tool: str, *, credential_id: Optional[str] = None, timeout: Timeout = None
    ) -> CredentialSignInStart:
        """Starts signing a coding agent's subscription in as an OAuth credential. ``tool`` is ``"claude"`` (Claude
        Code, on a Claude Pro or Max subscription) or ``"codex"`` (Codex, on a ChatGPT subscription). With
        ``credential_id``, signs that OAuth credential in again: new tokens, the same credential and stacks.

        The person then finishes at the provider, before ``expires_at_utc``:

        - Claude: open ``authorize_url``, sign in, and pass the code Anthropic shows to ``finish_sign_in``.
        - Codex: open ``verification_url``, enter ``user_code``, and call ``finish_sign_in`` every
          ``poll_interval_seconds`` until it is ``Complete``.

        Code pipelines run their agents on a sign-in credential; nothing else uses one. Tenant admins only.
        """
        body = _drop_none({"credentialId": credential_id})
        spec = RequestSpec("POST", path("/credentials/sign-in/{tool}", tool=tool), json=body, timeout=timeout)
        return await self._one(CredentialSignInStart, spec)

    async def finish_sign_in(
        self,
        tool: str,
        *,
        sign_in_id: str,
        code: Optional[str] = None,
        name: Optional[str] = None,
        description: Optional[str] = None,
        tag: Optional[str] = None,
        timeout: Timeout = None,
    ) -> CredentialSignInResult:
        """Finishes a sign-in begun with ``start_sign_in`` for the same ``tool``. For Claude, pass the ``code`` Anthropic
        showed, as shown (``code#state`` included). For Codex there is no code: ``status`` is ``Pending`` until the
        person has entered the user code, so call again after ``poll_interval_seconds``. Once ``status`` is
        ``Complete``, ``credential`` is the saved credential. ``name``, ``description`` and ``tag`` are a new
        credential's; signing an existing one in again keeps its own. Tenant admins only."""
        body = _drop_none({"signInId": sign_in_id, "code": code, "name": name, "description": description, "tag": tag})
        spec = RequestSpec("POST", path("/credentials/sign-in/{tool}/finish", tool=tool), json=body, timeout=timeout)
        return await self._one(CredentialSignInResult, spec)

    async def import_sign_in(
        self,
        request: Union[CredentialSignInTokensRequest, Body] = None,
        *,
        timeout: Timeout = None,
        **fields: Any,
    ) -> ModelCredential:
        """Makes an OAuth credential from a Claude or Codex sign-in whose tokens you already hold (``tool``,
        ``access_token``, ``refresh_token``, ``expires_at_utc``; Codex also needs ``id_token``). You keep them fresh:
        Maitento never refreshes them, so call ``replace_sign_in_tokens`` each time you refresh. Tenant admins only.
        Never retried: a retry could make a second credential."""
        body = wire(build_model(CredentialSignInTokensRequest, request, fields))
        return await self._one(ModelCredential, RequestSpec("POST", "/credentials/sign-in-tokens", json=body, timeout=timeout))

    async def replace_sign_in_tokens(
        self,
        id: str,
        request: Union[CredentialSignInTokensRequest, Body] = None,
        *,
        timeout: Timeout = None,
        **fields: Any,
    ) -> ModelCredential:
        """Replaces the tokens of a credential made by ``import_sign_in``, after you refreshed them. A sign-in made
        through ``start_sign_in`` is refused with ``api:credentials:sign-in-refreshed-here``: Maitento refreshes those
        itself."""
        body = wire(build_model(CredentialSignInTokensRequest, request, fields))
        url = path("/credentials/by-id/{id}/sign-in-tokens", id=id)
        return await self._one(ModelCredential, RequestSpec("PUT", url, json=body, idempotent=True, timeout=timeout))


class AsyncCredentialStacks(_AsyncResource):
    """Credential stacks: named, ordered lists of the tenant's credentials, each entry with its own rules.

    A run's stack is the one named when it starts (``credential_stack=``), else the one the run that started it chose,
    else its definition's, else its namespace's default, else the tenant's default. A run on a stack is served only by
    the stack's credentials, never by Maitento's own keys. For each model call the entries are tried in order,
    skipping any whose rules or models don't fit the model, and failing over to the next when one is rate-limited,
    failing or refused. A run keeps the stack as it was when it started, so editing a stack never changes a run
    already going. Anyone in the tenant can read stacks; changing them needs a tenant admin.
    """

    async def list(self, *, timeout: Timeout = None) -> List[CredentialStack]:
        return await self._many(CredentialStack, _get("/credential-stacks", timeout))

    async def get(self, id: str, *, timeout: Timeout = None) -> CredentialStack:
        return await self._one(CredentialStack, _get(path("/credential-stacks/by-id/{id}", id=id), timeout))

    async def usage(self, id: str, *, timeout: Timeout = None) -> CredentialStackUsage:
        """Where the stack is used: ``tenant_default``, the ``namespaces`` whose default it is, and the ``partitions``
        (knowledge bases) that embed with it. While any of these use it, it can't be deleted."""
        return await self._one(CredentialStackUsage, _get(path("/credential-stacks/by-id/{id}/usage", id=id), timeout))

    async def find(self, id: str, *, timeout: Timeout = None) -> Optional[CredentialStack]:
        """The stack with ``id``, or ``None``."""
        return await self._find(CredentialStack, _get(path("/credential-stacks/by-id/{id}", id=id), timeout))

    async def find_by_name(self, name: str, *, timeout: Timeout = None) -> Optional[CredentialStack]:
        """The stack with this ``name`` (unique in the tenant), or ``None``."""
        return await self._find(CredentialStack, _get(path("/credential-stacks/by-name/{name}", name=name), timeout))

    async def create(
        self, request: Union[CredentialStackRequest, Body] = None, *, timeout: Timeout = None, **fields: Any
    ) -> CredentialStack:
        """Creates a stack: ``name`` (unique in the tenant), optional ``description``, and ``entries`` in the order they
        are tried. Each entry names a credential (``credentialId``) and may narrow it: ``allowedModels`` (only these
        of its models), ``allowedEndpointKinds`` (``Public``, ``Foundry``, ``AzureOpenAi``, ``Custom``) and
        ``enabled`` (default true; a disabled entry is skipped). Tenant admins only."""
        body = wire(build_model(CredentialStackRequest, request, fields))
        return await self._one(CredentialStack, RequestSpec("POST", "/credential-stacks", json=body, timeout=timeout))

    async def update(
        self, id: str, request: Union[CredentialStackRequest, Body] = None, *, timeout: Timeout = None, **fields: Any
    ) -> CredentialStack:
        """Replaces every field of a stack (``name``, ``description``, ``entries``) and raises its ``version``. Runs
        already going keep the version they started with. Tenant admins only."""
        body = wire(build_model(CredentialStackRequest, request, fields))
        spec = RequestSpec("PUT", path("/credential-stacks/by-id/{id}", id=id), json=body, timeout=timeout)
        return await self._one(CredentialStack, spec)

    async def delete(self, id: str, *, timeout: Timeout = None) -> None:
        """Deletes a stack. Refused while it is the tenant's or a namespace's default (``ValidationError`` code
        ``api:credential-stacks:in-use-as-default``). Tenant admins only."""
        await self._void(RequestSpec("DELETE", path("/credential-stacks/by-id/{id}", id=id), timeout=timeout))

    async def get_tenant_default(self, *, timeout: Timeout = None) -> DefaultCredentialStack:
        """The stack runs use when neither their start, their definition nor their namespace names one
        (``credential_stack_id`` is ``None`` when the tenant has no default)."""
        return await self._one(DefaultCredentialStack, _get("/tenants/self/default-credential-stack", timeout))

    async def set_tenant_default(self, credential_stack_id: Optional[str], *, timeout: Timeout = None) -> DefaultCredentialStack:
        """Makes ``credential_stack_id`` the tenant's default stack; ``None`` clears it. Tenant admins only."""
        spec = RequestSpec(
            "PUT",
            "/tenants/self/default-credential-stack",
            json={"credentialStackId": credential_stack_id},
            idempotent=True,
            timeout=timeout,
        )
        return await self._one(DefaultCredentialStack, spec)

    async def get_namespace_default(self, namespace_id: str, *, timeout: Timeout = None) -> DefaultCredentialStack:
        """The stack runs of the namespace's definitions use when neither their start nor their definition names one
        (``credential_stack_id`` is ``None`` when the namespace has no default, and the tenant's applies)."""
        url = path("/namespaces/by-id/{id}/default-credential-stack", id=namespace_id)
        return await self._one(DefaultCredentialStack, _get(url, timeout))

    async def set_namespace_default(
        self, namespace_id: str, credential_stack_id: Optional[str], *, timeout: Timeout = None
    ) -> DefaultCredentialStack:
        """Makes ``credential_stack_id`` the namespace's default stack; ``None`` clears it. Tenant admins only."""
        spec = RequestSpec(
            "PUT",
            path("/namespaces/by-id/{id}/default-credential-stack", id=namespace_id),
            json={"credentialStackId": credential_stack_id},
            idempotent=True,
            timeout=timeout,
        )
        return await self._one(DefaultCredentialStack, spec)



# ============================================================================================================ agents


class AsyncAgents(_AsyncResource):
    """Agents: a model, a system prompt and the tools it may call. Usually defined in ``.mtr`` files and deployed."""

    async def list(self, *, namespace: Optional[str] = None, timeout: Timeout = None) -> List[Agent]:
        """Every agent of the tenant, or of ``namespace``."""
        url = "/agents" if namespace is None else path("/namespaces/{ns}/agents", ns=namespace)
        return await self._many(Agent, _get(url, timeout))

    async def get(self, id: str, *, timeout: Timeout = None) -> Agent:
        return await self._one(Agent, _get(path("/agents/by-id/{id}", id=id), timeout))

    async def find(self, id: str, *, timeout: Timeout = None) -> Optional[Agent]:
        return await self._find(Agent, _get(path("/agents/by-id/{id}", id=id), timeout))

    async def get_by_name(self, name: str, *, namespace: Optional[str] = None, timeout: Timeout = None) -> Agent:
        url = path("/namespaces/{ns}/agents/by-name/{name}", ns=self._ns(namespace), name=name)
        return await self._one(Agent, _get(url, timeout))

    async def find_by_name(self, name: str, *, namespace: Optional[str] = None, timeout: Timeout = None) -> Optional[Agent]:
        url = path("/namespaces/{ns}/agents/by-name/{name}", ns=self._ns(namespace), name=name)
        return await self._find(Agent, _get(url, timeout))

    async def create(
        self,
        request: Union[AgentCreateRequest, Body] = None,
        *,
        namespace: Optional[str] = None,
        timeout: Timeout = None,
        **fields: Any,
    ) -> Agent:
        """Creates an agent (``name``, ``ai_model_id``, ``system_prompt``, ``summary_for_other_agents``, ...)."""
        body = wire(build_model(AgentCreateRequest, request, fields))
        url = path("/namespaces/{ns}/agents", ns=self._ns(namespace))
        return await self._one(Agent, RequestSpec("POST", url, json=body, timeout=timeout))

    async def update(
        self, id: str, request: Union[AgentUpdateRequest, Body] = None, *, timeout: Timeout = None, **fields: Any
    ) -> Agent:
        """Updates an agent; a new version is appended when its content changed."""
        body = wire(build_model(AgentUpdateRequest, request, fields))
        return await self._one(Agent, RequestSpec("PUT", path("/agents/by-id/{id}", id=id), json=body, timeout=timeout))

    async def delete(self, id: str, *, timeout: Timeout = None) -> None:
        await self._void(RequestSpec("DELETE", path("/agents/by-id/{id}", id=id), timeout=timeout))


# ====================================================================================================== interactions


class AsyncInteractions(_AsyncResource):
    """Interactions: one-shot, round-robin and managed conversations between agents (and people)."""

    async def list(self, *, namespace: Optional[str] = None, timeout: Timeout = None) -> List[Interaction]:
        url = "/interactions" if namespace is None else path("/namespaces/{ns}/interactions", ns=namespace)
        return await self._many(Interaction, _get(url, timeout))

    async def get(self, id: str, *, timeout: Timeout = None) -> Interaction:
        return cast(Interaction, await self._one_of(Interaction, _get(path("/interactions/by-id/{id}", id=id), timeout)))

    async def find(self, id: str, *, timeout: Timeout = None) -> Optional[Interaction]:
        return cast(Optional[Interaction], await self._find_of(Interaction, _get(path("/interactions/by-id/{id}", id=id), timeout)))

    async def get_by_name(self, name: str, *, namespace: Optional[str] = None, timeout: Timeout = None) -> Interaction:
        url = path("/namespaces/{ns}/interactions/by-name/{name}", ns=self._ns(namespace), name=name)
        return cast(Interaction, await self._one_of(Interaction, _get(url, timeout)))

    async def find_by_name(
        self, name: str, *, namespace: Optional[str] = None, timeout: Timeout = None
    ) -> Optional[Interaction]:
        url = path("/namespaces/{ns}/interactions/by-name/{name}", ns=self._ns(namespace), name=name)
        return cast(Optional[Interaction], await self._find_of(Interaction, _get(url, timeout)))

    async def create_one_shot(
        self,
        request: Union[OneShotInteractionCreateRequest, Body] = None,
        *,
        namespace: Optional[str] = None,
        timeout: Timeout = None,
        **fields: Any,
    ) -> OneShotInteraction:
        body = wire(build_model(OneShotInteractionCreateRequest, request, fields))
        url = path("/namespaces/{ns}/interactions/one-shot", ns=self._ns(namespace))
        return await self._one(OneShotInteraction, RequestSpec("POST", url, json=body, timeout=timeout))

    async def create_round_robin(
        self,
        request: Union[RoundRobinInteractionCreateRequest, Body] = None,
        *,
        namespace: Optional[str] = None,
        timeout: Timeout = None,
        **fields: Any,
    ) -> RoundRobinInteraction:
        body = wire(build_model(RoundRobinInteractionCreateRequest, request, fields))
        url = path("/namespaces/{ns}/interactions/round-robin", ns=self._ns(namespace))
        return await self._one(RoundRobinInteraction, RequestSpec("POST", url, json=body, timeout=timeout))

    async def create_managed(
        self,
        request: Union[ManagedInteractionCreateRequest, Body] = None,
        *,
        namespace: Optional[str] = None,
        timeout: Timeout = None,
        **fields: Any,
    ) -> ManagedInteraction:
        body = wire(build_model(ManagedInteractionCreateRequest, request, fields))
        url = path("/namespaces/{ns}/interactions/managed", ns=self._ns(namespace))
        return await self._one(ManagedInteraction, RequestSpec("POST", url, json=body, timeout=timeout))

    async def update_one_shot(
        self,
        id: str,
        request: Union[OneShotInteractionUpdateRequest, Body] = None,
        *,
        timeout: Timeout = None,
        **fields: Any,
    ) -> OneShotInteraction:
        body = wire(build_model(OneShotInteractionUpdateRequest, request, fields))
        url = path("/interactions/one-shot/by-id/{id}", id=id)
        return await self._one(OneShotInteraction, RequestSpec("PUT", url, json=body, timeout=timeout))

    async def update_round_robin(
        self,
        id: str,
        request: Union[RoundRobinInteractionUpdateRequest, Body] = None,
        *,
        timeout: Timeout = None,
        **fields: Any,
    ) -> RoundRobinInteraction:
        body = wire(build_model(RoundRobinInteractionUpdateRequest, request, fields))
        url = path("/interactions/round-robin/by-id/{id}", id=id)
        return await self._one(RoundRobinInteraction, RequestSpec("PUT", url, json=body, timeout=timeout))

    async def update_managed(
        self,
        id: str,
        request: Union[ManagedInteractionUpdateRequest, Body] = None,
        *,
        timeout: Timeout = None,
        **fields: Any,
    ) -> ManagedInteraction:
        body = wire(build_model(ManagedInteractionUpdateRequest, request, fields))
        url = path("/interactions/managed/by-id/{id}", id=id)
        return await self._one(ManagedInteraction, RequestSpec("PUT", url, json=body, timeout=timeout))

    async def delete(self, id: str, *, timeout: Timeout = None) -> None:
        await self._void(RequestSpec("DELETE", path("/interactions/by-id/{id}", id=id), timeout=timeout))

    async def start(
        self,
        name: Optional[str] = None,
        request: Union[InteractionProcessStartRequest, Body] = None,
        *,
        id: Optional[str] = None,
        namespace: Optional[str] = None,
        timeout: Timeout = None,
        **fields: Any,
    ) -> InteractionProcess:
        """Starts the latest version of the interaction called ``name`` (or with definition ``id=``) and returns the
        new run (status ``New``).

        ``inputs`` may be a ``{name: value}`` mapping. Never retried: a retried start would be a second run.
        """
        body = _start_body(InteractionProcessStartRequest, request, fields)
        url = self._target(
            name, id, namespace, "/namespaces/{ns}/interactions/by-name/{name}/start", "/interactions/processes/by-id/{id}/start"
        )
        return await self._one(InteractionProcess, RequestSpec("PUT", url, json=body, timeout=timeout))

    async def run(
        self,
        name: Optional[str] = None,
        request: Union[InteractionProcessStartRequest, Body] = None,
        *,
        id: Optional[str] = None,
        namespace: Optional[str] = None,
        on_token: Optional[TokenCallback] = None,
        on_update: Optional[RunCallback] = None,
        on_waiting: Optional[RunCallback] = None,
        timeout: Optional[float] = None,
        throw_on_failure: bool = True,
        kill_on_abort: bool = False,
        abort: Optional[_aio.Event] = None,
        **fields: Any,
    ) -> InteractionProcess:
        """Starts the interaction ``name`` (or ``id=``), follows it, and returns the run once Finished, Error or
        Killed.

        - ``on_token(text, agent_name)`` receives streamed chat deltas (it opens the event socket if none is open).
        - ``on_update(run)`` is called for each new state; ``on_waiting(run)`` when the run needs a person
          (``HumanInteractionRequired``, ``PendingApproval``).
        - ``Error``/``Killed`` raise :class:`~maitento.ProcessFailedError` unless ``throw_on_failure=False``.
        - ``timeout`` (seconds) raises :class:`~maitento.TimeoutError`; ``abort`` (an event) raises
          :class:`~maitento.AbortedError`. Neither stops the run unless ``kill_on_abort=True``.
        """
        result = await self._run(
            INTERACTION,
            lambda: self.start(name, request, id=id, namespace=namespace, **fields),
            on_token=on_token,
            on_update=on_update,
            on_waiting=on_waiting,
            timeout=timeout,
            throw_on_failure=throw_on_failure,
            kill_on_abort=kill_on_abort,
            abort=abort,
        )
        return cast(InteractionProcess, result)


class AsyncInteractionRuns(_AsyncResource):
    """Interaction runs (processes): read them, talk to them, approve their tool calls."""

    async def get(self, id: str, *, timeout: Timeout = None) -> InteractionProcess:
        return await self._one(InteractionProcess, _get(path("/interactions/processes/by-id/{id}", id=id), timeout))

    async def find(self, id: str, *, timeout: Timeout = None) -> Optional[InteractionProcess]:
        return await self._find(InteractionProcess, _get(path("/interactions/processes/by-id/{id}", id=id), timeout))

    def transcript(self, run: InteractionProcess) -> List[TranscriptEntry]:
        """The run's conversation in order: every context item of every kind, sorted by ``sequence``."""
        return transcript(run)

    async def add_message(
        self,
        id: str,
        message: str,
        *,
        author_name: Optional[str] = None,
        author_id: Optional[str] = None,
        timeout: Timeout = None,
    ) -> AddMessageResult:
        """Adds a person's message (answers ``HumanInteractionRequired``; queued when the run is mid-turn).
        With an API key the author fields are honoured; with a JWT the caller is the author."""
        body = _drop_none({"messageAuthorName": author_name, "messageAuthorId": author_id, "message": message})
        url = path("/interactions/processes/by-id/{id}/add-message", id=id)
        return await self._one(AddMessageResult, RequestSpec("POST", url, json=body, timeout=timeout))

    async def add_system_message(self, id: str, content: str, *, timeout: Timeout = None) -> None:
        """Injects a system message into a running interaction."""
        url = path("/interactions/processes/by-id/{id}/system-message", id=id)
        await self._void(RequestSpec("POST", url, json={"content": content}, timeout=timeout))

    async def approve(self, id: str, approval_id: str, *, timeout: Timeout = None) -> None:
        """Approves the pending tool call ``run.pending_approval.id``."""
        url = path("/interactions/processes/by-id/{id}/approve", id=id)
        await self._void(RequestSpec("POST", url, json={"toolCallApprovalId": approval_id}, timeout=timeout))

    async def reject(self, id: str, approval_id: str, reason: str, *, timeout: Timeout = None) -> None:
        """Rejects the pending tool call; the model sees ``reason``."""
        url = path("/interactions/processes/by-id/{id}/reject", id=id)
        body = {"toolCallApprovalId": approval_id, "reason": reason}
        await self._void(RequestSpec("POST", url, json=body, timeout=timeout))

    async def vote_yes(
        self, id: str, *, author_name: Optional[str] = None, author_id: Optional[str] = None, timeout: Timeout = None
    ) -> None:
        """A person's yes vote on a solution proposal."""
        url = path("/interactions/processes/by-id/{id}/vote/yes", id=id)
        body = _drop_none({"messageAuthorName": author_name, "messageAuthorId": author_id})
        await self._void(RequestSpec("POST", url, json=body, timeout=timeout))

    async def vote_no(
        self,
        id: str,
        reason: str,
        *,
        author_name: Optional[str] = None,
        author_id: Optional[str] = None,
        timeout: Timeout = None,
    ) -> None:
        """A person's no vote on a solution proposal, with the reason the agents see."""
        url = path("/interactions/processes/by-id/{id}/vote/no", id=id)
        body = _drop_none({"messageAuthorName": author_name, "messageAuthorId": author_id, "reason": reason})
        await self._void(RequestSpec("POST", url, json=body, timeout=timeout))

    async def tool_result(self, id: str, sequence: int, *, timeout: Timeout = None) -> InteractionProcessToolResult:
        """The full result of the tool call at ``sequence`` (when the context item's ``result`` was relocated)."""
        url = path("/interactions/processes/by-id/{id}/tool-results/{sequence}", id=id, sequence=sequence)
        return await self._one(InteractionProcessToolResult, _get(url, timeout))

    async def list_active(
        self, *, namespace: Optional[str] = None, timeout: Timeout = None
    ) -> List[InteractionProcessWithDetails]:
        """The namespace's interaction runs that have not ended."""
        url = path("/namespaces/{ns}/interactions/processes", ns=self._ns(namespace))
        return await self._many(InteractionProcessWithDetails, _get(url, timeout))

    async def list(self, *, timeout: Timeout = None) -> List[InteractionProcess]:
        """EVERY interaction run of the tenant with its full context, unpaged. Prefer ``runs.list``."""
        return await self._many(InteractionProcess, _get("/interactions/processes", timeout))


# ============================================================================================================== apps


class AsyncApps(_AsyncResource):
    """Apps: Cogniscript programs (deployed through Build) that orchestrate interactions, pipelines and capsules."""

    async def list(self, *, namespace: Optional[str] = None, timeout: Timeout = None) -> List[App]:
        url = "/apps" if namespace is None else path("/namespaces/{ns}/apps", ns=namespace)
        return await self._many(App, _get(url, timeout))

    async def get(self, id: str, *, timeout: Timeout = None) -> App:
        return await self._one(App, _get(path("/apps/by-id/{id}", id=id), timeout))

    async def find(self, id: str, *, timeout: Timeout = None) -> Optional[App]:
        return await self._find(App, _get(path("/apps/by-id/{id}", id=id), timeout))

    async def get_by_name(self, name: str, *, namespace: Optional[str] = None, timeout: Timeout = None) -> App:
        url = path("/namespaces/{ns}/apps/by-name/{name}", ns=self._ns(namespace), name=name)
        return await self._one(App, _get(url, timeout))

    async def find_by_name(self, name: str, *, namespace: Optional[str] = None, timeout: Timeout = None) -> Optional[App]:
        url = path("/namespaces/{ns}/apps/by-name/{name}", ns=self._ns(namespace), name=name)
        return await self._find(App, _get(url, timeout))

    async def create(self, name: str, *, namespace: Optional[str] = None, timeout: Timeout = None) -> App:
        """Creates an empty app (versions only come from a deploy)."""
        url = path("/namespaces/{ns}/apps", ns=self._ns(namespace))
        return await self._one(App, RequestSpec("POST", url, json={"name": name}, timeout=timeout))

    async def delete(self, id: str, *, timeout: Timeout = None) -> None:
        await self._void(RequestSpec("DELETE", path("/apps/by-id/{id}", id=id), timeout=timeout))

    async def start(
        self,
        name: Optional[str] = None,
        request: Union[AppStartRequest, Body] = None,
        *,
        id: Optional[str] = None,
        version: Optional[int] = None,
        namespace: Optional[str] = None,
        timeout: Timeout = None,
        **fields: Any,
    ) -> AppProcess:
        """Starts the latest version of the app ``name``, or version ``version`` of the app with ``id=`` (never
        retried)."""
        body = _start_body(AppStartRequest, request, fields)
        url = self._target(
            name,
            id,
            namespace,
            "/namespaces/{ns}/apps/by-name/{name}/versions/latest/start",
            "/apps/by-id/{id}/versions/{version}/start",
            version=_pinned(id, version),
        )
        return await self._one(AppProcess, RequestSpec("PUT", url, json=body, timeout=timeout))

    async def run(
        self,
        name: Optional[str] = None,
        request: Union[AppStartRequest, Body] = None,
        *,
        id: Optional[str] = None,
        version: Optional[int] = None,
        namespace: Optional[str] = None,
        on_update: Optional[RunCallback] = None,
        on_waiting: Optional[RunCallback] = None,
        timeout: Optional[float] = None,
        throw_on_failure: bool = True,
        kill_on_abort: bool = False,
        abort: Optional[_aio.Event] = None,
        **fields: Any,
    ) -> AppProcess:
        """Starts the app ``name`` (or ``id=`` + ``version=``) and returns the run once it ends (see
        ``interactions.run``)."""
        result = await self._run(
            APP,
            lambda: self.start(name, request, id=id, version=version, namespace=namespace, **fields),
            on_token=None,
            on_update=on_update,
            on_waiting=on_waiting,
            timeout=timeout,
            throw_on_failure=throw_on_failure,
            kill_on_abort=kill_on_abort,
            abort=abort,
        )
        return cast(AppProcess, result)


class AsyncAppRuns(_AsyncResource):
    """App runs (processes)."""

    async def get(self, id: str, *, timeout: Timeout = None) -> AppProcess:
        return await self._one(AppProcess, _get(path("/apps/processes/by-id/{id}", id=id), timeout))

    async def find(self, id: str, *, timeout: Timeout = None) -> Optional[AppProcess]:
        return await self._find(AppProcess, _get(path("/apps/processes/by-id/{id}", id=id), timeout))

    async def update_inputs(self, id: str, inputs: Any, *, timeout: Timeout = None) -> AppProcess:
        """Changes the values of EXISTING inputs of a run that has not ended (``{name: value}`` or a list)."""
        url = path("/apps/processes/by-id/{id}/inputs", id=id)
        body = {"inputs": wire(inputs_list(inputs))}
        return await self._one(AppProcess, RequestSpec("PUT", url, json=body, timeout=timeout))

    async def list_active(
        self, *, namespace: Optional[str] = None, timeout: Timeout = None
    ) -> List[AppProcessWithDetails]:
        url = path("/namespaces/{ns}/apps/processes", ns=self._ns(namespace))
        return await self._many(AppProcessWithDetails, _get(url, timeout))


# ========================================================================================================== capsules


class AsyncCapsules(_AsyncResource):
    """Capsules: sandboxed Linux containers (definitions come from a deploy)."""

    async def list(self, *, namespace: Optional[str] = None, timeout: Timeout = None) -> List[Capsule]:
        url = "/capsules" if namespace is None else path("/namespaces/{ns}/capsules", ns=namespace)
        return await self._many(Capsule, _get(url, timeout))

    async def get(self, id: str, *, timeout: Timeout = None) -> Capsule:
        return await self._one(Capsule, _get(path("/capsules/by-id/{id}", id=id), timeout))

    async def find(self, id: str, *, timeout: Timeout = None) -> Optional[Capsule]:
        return await self._find(Capsule, _get(path("/capsules/by-id/{id}", id=id), timeout))

    async def get_by_name(self, name: str, *, namespace: Optional[str] = None, timeout: Timeout = None) -> Capsule:
        url = path("/namespaces/{ns}/capsules/by-name/{name}", ns=self._ns(namespace), name=name)
        return await self._one(Capsule, _get(url, timeout))

    async def find_by_name(
        self, name: str, *, namespace: Optional[str] = None, timeout: Timeout = None
    ) -> Optional[Capsule]:
        url = path("/namespaces/{ns}/capsules/by-name/{name}", ns=self._ns(namespace), name=name)
        return await self._find(Capsule, _get(url, timeout))

    async def delete(self, id: str, *, timeout: Timeout = None) -> None:
        await self._void(RequestSpec("DELETE", path("/capsules/by-id/{id}", id=id), timeout=timeout))

    async def start(
        self,
        name: Optional[str] = None,
        request: Union[CapsuleProcessStartRequest, Body] = None,
        *,
        id: Optional[str] = None,
        version: Optional[int] = None,
        namespace: Optional[str] = None,
        timeout: Timeout = None,
        **fields: Any,
    ) -> CapsuleProcess:
        """Starts the latest version of the capsule ``name``, or version ``version`` of the capsule with ``id=``
        (never retried)."""
        body = wire(build_model(CapsuleProcessStartRequest, request, fields))
        url = self._target(
            name,
            id,
            namespace,
            "/namespaces/{ns}/capsules/by-name/{name}/versions/latest/start",
            "/capsules/by-id/{id}/versions/{version}/start",
            version=_pinned(id, version),
        )
        return await self._one(CapsuleProcess, RequestSpec("PUT", url, json=body, timeout=timeout))

    async def run(
        self,
        name: Optional[str] = None,
        request: Union[CapsuleProcessStartRequest, Body] = None,
        *,
        id: Optional[str] = None,
        version: Optional[int] = None,
        namespace: Optional[str] = None,
        on_update: Optional[RunCallback] = None,
        on_waiting: Optional[RunCallback] = None,
        timeout: Optional[float] = None,
        throw_on_failure: bool = True,
        kill_on_abort: bool = False,
        abort: Optional[_aio.Event] = None,
        **fields: Any,
    ) -> CapsuleProcess:
        """Starts the capsule ``name`` (or ``id=`` + ``version=``) and returns the run once it ends (see
        ``interactions.run``)."""
        result = await self._run(
            CAPSULE,
            lambda: self.start(name, request, id=id, version=version, namespace=namespace, **fields),
            on_token=None,
            on_update=on_update,
            on_waiting=on_waiting,
            timeout=timeout,
            throw_on_failure=throw_on_failure,
            kill_on_abort=kill_on_abort,
            abort=abort,
        )
        return cast(CapsuleProcess, result)


class AsyncCapsuleRuns(_AsyncResource):
    """Capsule runs: run commands in them, mount things, end them. Commands are queued; read the run for results."""

    async def get(self, id: str, *, timeout: Timeout = None) -> CapsuleProcess:
        return await self._one(CapsuleProcess, _get(path("/capsule-processes/by-id/{id}", id=id), timeout))

    async def find(self, id: str, *, timeout: Timeout = None) -> Optional[CapsuleProcess]:
        return await self._find(CapsuleProcess, _get(path("/capsule-processes/by-id/{id}", id=id), timeout))

    async def list(self, *, timeout: Timeout = None) -> List[CapsuleProcess]:
        """Every capsule run of the tenant, unpaged. Prefer ``runs.list``."""
        return await self._many(CapsuleProcess, _get("/capsule-processes", timeout))

    async def list_active(
        self, *, namespace: Optional[str] = None, timeout: Timeout = None
    ) -> List[CapsuleProcessWithDetails]:
        url = path("/namespaces/{ns}/capsules/processes", ns=self._ns(namespace))
        return await self._many(CapsuleProcessWithDetails, _get(url, timeout))

    async def _command(self, method: str, url: str, body: Any, timeout: Timeout) -> CapsuleProcessCommand:
        return await self._one(CapsuleProcessCommand, RequestSpec(method, url, json=body, timeout=timeout))

    async def exec(
        self,
        id: str,
        command: str,
        arguments: Optional[Sequence[str]] = None,
        *,
        run_as_user: Optional[str] = None,
        maximum_duration: Optional[_dt.timedelta] = None,
        async_: Optional[bool] = None,
        timeout: Timeout = None,
    ) -> CapsuleProcessCommand:
        """Queues ``command`` and returns it ``Pending``; it runs once the capsule is ready, after the commands queued
        before it. ``command`` is shell text, run by the user's login shell from ``/``. Each of ``arguments`` reaches
        the program as one word, exactly as given (spaces, quotes and ``$`` included): to pipe or redirect, run ``sh``
        with ``["-c", "<line>"]``, or put the whole line in ``command``. ``maximum_duration`` is a ``timedelta``. To get
        the result, use :meth:`exec_and_wait` (or :meth:`get_command`)."""
        body = wire(
            build_model(
                CapsuleProcessRunCommandRequest,
                None,
                _drop_none(
                    {
                        "command": command,
                        "arguments": list(arguments) if arguments is not None else None,
                        "run_as_user": run_as_user,
                        "maximum_duration": maximum_duration,
                        "async_": async_,
                    }
                ),
            )
        )
        return await self._command("POST", path("/capsule-processes/by-id/{id}/commands", id=id), body, timeout)

    async def exec_and_wait(
        self,
        id: str,
        command: str,
        arguments: Optional[Sequence[str]] = None,
        *,
        run_as_user: Optional[str] = None,
        maximum_duration: Optional[_dt.timedelta] = None,
        async_: Optional[bool] = None,
        timeout: Optional[float] = None,
        abort: Optional[_aio.Event] = None,
    ) -> CapsuleProcessCommand:
        """Queues ``command`` (as :meth:`exec` does) and waits for it to end: over the event socket when one is open,
        by polling the command otherwise (0.25 s, growing to 2 s).

        Returns the command, ``Finished`` or ``Error``, with its ``exit_code``, ``output_standard`` and
        ``output_error``: a non-zero exit code is a result, not an exception. Raises
        :class:`~maitento.CapsuleCommandAbortedError` when the capsule ends before the command finishes, and
        :class:`~maitento.TimeoutError` / :class:`~maitento.AbortedError` when ``timeout`` (seconds) passes or ``abort``
        is set first; the command keeps running. Queuing is never retried."""
        result = await queue_and_wait(
            self._client,
            id,
            lambda: self.exec(
                id, command, arguments, run_as_user=run_as_user, maximum_duration=maximum_duration, async_=async_
            ),
            timeout=timeout,
            abort=abort,
        )
        return result

    async def get_command(self, id: str, command_id: str, *, timeout: Timeout = None) -> CapsuleProcessCommand:
        """One command (or operation) of a capsule run, with its status and output. One still queued or running when
        the run ended reads as ``AbortedOnTermination``."""
        url = path("/capsule-processes/by-id/{id}/commands/{command}", id=id, command=command_id)
        return await self._one(CapsuleProcessCommand, _get(url, timeout))

    async def terminate(self, id: str, *, timeout: Timeout = None) -> CapsuleProcessCommand:
        return await self._command("POST", path("/capsule-processes/by-id/{id}/terminate", id=id), NO_BODY, timeout)

    async def mount_vfs(
        self, id: str, *, vfs_id: str, vfs_namespace_id: str, mount_name: str, timeout: Timeout = None
    ) -> CapsuleProcessCommand:
        body = {"vfsId": vfs_id, "vfsNamespaceId": vfs_namespace_id, "mountName": mount_name}
        return await self._command("POST", path("/capsule-processes/by-id/{id}/mounts/vfs", id=id), body, timeout)

    async def unmount_vfs(self, id: str, mount_name: str, *, timeout: Timeout = None) -> CapsuleProcessCommand:
        url = path("/capsule-processes/by-id/{id}/mounts/vfs/{mount}", id=id, mount=mount_name)
        return await self._command("DELETE", url, NO_BODY, timeout)

    async def mount_secret(
        self, id: str, *, secret_name: str, mount_name: str, timeout: Timeout = None
    ) -> CapsuleProcessCommand:
        body = {"secretName": secret_name, "mountName": mount_name}
        return await self._command("POST", path("/capsule-processes/by-id/{id}/mounts/secrets", id=id), body, timeout)

    async def unmount_secret(self, id: str, mount_name: str, *, timeout: Timeout = None) -> CapsuleProcessCommand:
        url = path("/capsule-processes/by-id/{id}/mounts/secrets/{mount}", id=id, mount=mount_name)
        return await self._command("DELETE", url, NO_BODY, timeout)

    async def add_user(
        self, id: str, username: str, *, sudo_as_users: Optional[Sequence[str]] = None, timeout: Timeout = None
    ) -> CapsuleProcessCommand:
        body = _drop_none({"username": username, "sudoAsUsers": list(sudo_as_users) if sudo_as_users is not None else None})
        return await self._command("POST", path("/capsule-processes/by-id/{id}/users", id=id), body, timeout)

    async def remove_user(self, id: str, username: str, *, timeout: Timeout = None) -> CapsuleProcessCommand:
        url = path("/capsule-processes/by-id/{id}/users/{username}", id=id, username=username)
        return await self._command("DELETE", url, NO_BODY, timeout)

    async def install_package(self, id: str, package_name: str, *, timeout: Timeout = None) -> CapsuleProcessCommand:
        body = {"packageName": package_name}
        return await self._command("POST", path("/capsule-processes/by-id/{id}/packages", id=id), body, timeout)

    async def remove_package(self, id: str, package_name: str, *, timeout: Timeout = None) -> CapsuleProcessCommand:
        url = path("/capsule-processes/by-id/{id}/packages/{package}", id=id, package=package_name)
        return await self._command("DELETE", url, NO_BODY, timeout)


# ========================================================================================================= pipelines


class AsyncPipelines(_AsyncResource):
    """Code pipelines: multi-phase coding-agent runs over git repositories."""

    async def list(self, *, namespace: Optional[str] = None, timeout: Timeout = None) -> List[CodePipeline]:
        url = "/code-pipelines" if namespace is None else path("/namespaces/{ns}/code-pipelines", ns=namespace)
        return await self._many(CodePipeline, _get(url, timeout))

    async def get(self, id: str, *, timeout: Timeout = None) -> CodePipeline:
        return await self._one(CodePipeline, _get(path("/code-pipelines/by-id/{id}", id=id), timeout))

    async def find(self, id: str, *, timeout: Timeout = None) -> Optional[CodePipeline]:
        return await self._find(CodePipeline, _get(path("/code-pipelines/by-id/{id}", id=id), timeout))

    async def get_by_name(self, name: str, *, namespace: Optional[str] = None, timeout: Timeout = None) -> CodePipeline:
        url = path("/namespaces/{ns}/code-pipelines/by-name/{name}", ns=self._ns(namespace), name=name)
        return await self._one(CodePipeline, _get(url, timeout))

    async def find_by_name(
        self, name: str, *, namespace: Optional[str] = None, timeout: Timeout = None
    ) -> Optional[CodePipeline]:
        url = path("/namespaces/{ns}/code-pipelines/by-name/{name}", ns=self._ns(namespace), name=name)
        return await self._find(CodePipeline, _get(url, timeout))

    async def create(
        self,
        request: Union[CodePipelineCreateRequest, Body] = None,
        *,
        namespace: Optional[str] = None,
        timeout: Timeout = None,
        **fields: Any,
    ) -> CodePipeline:
        body = wire(build_model(CodePipelineCreateRequest, request, fields))
        url = path("/namespaces/{ns}/code-pipelines", ns=self._ns(namespace))
        return await self._one(CodePipeline, RequestSpec("POST", url, json=body, timeout=timeout))

    async def update(
        self, id: str, request: Union[CodePipelineUpdateRequest, Body] = None, *, timeout: Timeout = None, **fields: Any
    ) -> CodePipeline:
        """Updates a pipeline (always appends a version)."""
        body = wire(build_model(CodePipelineUpdateRequest, request, fields))
        url = path("/code-pipelines/by-id/{id}", id=id)
        return await self._one(CodePipeline, RequestSpec("PUT", url, json=body, timeout=timeout))

    async def delete(self, id: str, *, timeout: Timeout = None) -> None:
        await self._void(RequestSpec("DELETE", path("/code-pipelines/by-id/{id}", id=id), timeout=timeout))

    async def start(
        self,
        name: Optional[str] = None,
        request: Union[CodePipelineProcessStartRequestInput, Body] = None,
        *,
        id: Optional[str] = None,
        namespace: Optional[str] = None,
        timeout: Timeout = None,
        **fields: Any,
    ) -> CodePipelineProcess:
        """Starts the pipeline ``name`` (or with definition ``id=``). Never retried; set ``launch_intent_id`` to
        make a start idempotent."""
        body = _start_body(CodePipelineProcessStartRequestInput, request, fields)
        url = self._target(
            name, id, namespace, "/namespaces/{ns}/code-pipelines/by-name/{name}/start", "/code-pipelines/processes/by-id/{id}/start"
        )
        return await self._one(CodePipelineProcess, RequestSpec("PUT", url, json=body, timeout=timeout))

    async def run(
        self,
        name: Optional[str] = None,
        request: Union[CodePipelineProcessStartRequestInput, Body] = None,
        *,
        id: Optional[str] = None,
        namespace: Optional[str] = None,
        on_update: Optional[RunCallback] = None,
        on_waiting: Optional[RunCallback] = None,
        timeout: Optional[float] = None,
        throw_on_failure: bool = True,
        kill_on_abort: bool = False,
        abort: Optional[_aio.Event] = None,
        **fields: Any,
    ) -> CodePipelineProcess:
        """Starts the pipeline ``name`` (or ``id=``) and returns the run once it ends (see ``interactions.run``)."""
        result = await self._run(
            PIPELINE,
            lambda: self.start(name, request, id=id, namespace=namespace, **fields),
            on_token=None,
            on_update=on_update,
            on_waiting=on_waiting,
            timeout=timeout,
            throw_on_failure=throw_on_failure,
            kill_on_abort=kill_on_abort,
            abort=abort,
        )
        return cast(CodePipelineProcess, result)


class AsyncPipelineRuns(_AsyncResource):
    """Code pipeline runs."""

    async def get(self, id: str, *, timeout: Timeout = None) -> CodePipelineProcess:
        return await self._one(CodePipelineProcess, _get(path("/code-pipelines/processes/by-id/{id}", id=id), timeout))

    async def find(self, id: str, *, timeout: Timeout = None) -> Optional[CodePipelineProcess]:
        return await self._find(CodePipelineProcess, _get(path("/code-pipelines/processes/by-id/{id}", id=id), timeout))

    async def list(self, *, timeout: Timeout = None) -> List[CodePipelineProcess]:
        """Every pipeline run of the tenant, unpaged. Prefer ``runs.list``."""
        return await self._many(CodePipelineProcess, _get("/code-pipelines/processes", timeout))

    async def list_active(self, *, timeout: Timeout = None) -> List[CodePipelineProcess]:
        """The pipeline runs that have not ended."""
        return await self._many(CodePipelineProcess, _get("/code-pipelines/processes/alive", timeout))

    async def answer(self, id: str, request_id: str, answer: str, *, timeout: Timeout = None) -> None:
        """Answers the run's question ``request_id``."""
        url = path("/code-pipelines/processes/by-id/{id}/answer", id=id)
        await self._void(RequestSpec("POST", url, json={"requestId": request_id, "answer": answer}, timeout=timeout))

    async def diff(self, id: str, *, timeout: Timeout = None) -> Optional[CodePipelineProcessDiff]:
        """The run's structured diff, or ``None`` when there is none yet."""
        return await self._find(CodePipelineProcessDiff, _get(path("/code-pipelines/processes/by-id/{id}/diff", id=id), timeout))

    async def raw_diff(self, id: str, *, timeout: Timeout = None) -> Optional[CodePipelineProcessDiffRaw]:
        """The run's unified diff text, or ``None`` when there is none yet."""
        url = path("/code-pipelines/processes/by-id/{id}/diff/raw", id=id)
        return await self._find(CodePipelineProcessDiffRaw, _get(url, timeout))

    async def kill(self, id: str, *, timeout: Timeout = None) -> None:
        url = path("/code-pipelines/processes/by-id/{id}/kill", id=id)
        await self._void(RequestSpec("PUT", url, json={}, timeout=timeout))

    async def resume(self, id: str, *, timeout: Timeout = None) -> None:
        url = path("/code-pipelines/processes/by-id/{id}/resume", id=id)
        await self._void(RequestSpec("PUT", url, json={}, timeout=timeout))

    async def resume_with_prompt(
        self,
        id: str,
        request: Union[CodePipelineProcessResumeWithPromptRequest, Body] = None,
        *,
        timeout: Timeout = None,
        **fields: Any,
    ) -> CodePipelineProcess:
        """Resumes a run with a ``continuation_prompt`` (returns the pre-update snapshot; re-read it)."""
        body = wire(build_model(CodePipelineProcessResumeWithPromptRequest, request, fields))
        url = path("/code-pipelines/processes/by-id/{id}/resume-with-prompt", id=id)
        return await self._one(CodePipelineProcess, RequestSpec("PUT", url, json=body, timeout=timeout))

    async def restart(self, id: str, *, timeout: Timeout = None) -> CodePipelineProcess:
        """Starts a new run that continues from this one's context."""
        url = path("/code-pipelines/processes/by-id/{id}/restart", id=id)
        return await self._one(CodePipelineProcess, RequestSpec("PUT", url, json={}, timeout=timeout))

    async def update_credentials(self, id: str, credentials: Sequence[Any], *, timeout: Timeout = None) -> None:
        """Replaces the run's engine credentials (``type`` ``apiKey`` or ``oauth``)."""
        body = [wire(parse(CodePipelineProcessCredentialsInput, item)) for item in credentials]
        url = path("/code-pipelines/processes/by-id/{id}/credentials", id=id)
        await self._void(RequestSpec("PUT", url, json=body, timeout=timeout))

    async def update_repos(self, id: str, repos: Sequence[Any], *, timeout: Timeout = None) -> None:
        """Replaces the run's repositories (``type`` ``ssh`` or ``http``)."""
        body = [wire(parse(CodePipelineProcessRepoInput, item)) for item in repos]
        url = path("/code-pipelines/processes/by-id/{id}/repos", id=id)
        await self._void(RequestSpec("PUT", url, json=body, timeout=timeout))

    async def payloads(
        self,
        id: str,
        *,
        tool_use_ids: Sequence[str] = (),
        context_entry_ids: Sequence[str] = (),
        timeout: Timeout = None,
    ) -> CodePipelineProcessPayloadsResponse:
        """The full payloads of the given tool uses and context entries."""
        url = path("/code-pipelines/processes/by-id/{id}/payloads/by-ids", id=id)
        body = {"toolUseIds": list(tool_use_ids), "contextEntryIds": list(context_entry_ids)}
        spec = RequestSpec("POST", url, json=body, idempotent=True, timeout=timeout)
        return await self._one(CodePipelineProcessPayloadsResponse, spec)

    async def step_payloads(
        self, id: str, step_execution_id: str, *, timeout: Timeout = None
    ) -> CodePipelineProcessPayloadsResponse:
        url = path("/code-pipelines/processes/by-id/{id}/payloads/steps/{step}", id=id, step=step_execution_id)
        return await self._one(CodePipelineProcessPayloadsResponse, _get(url, timeout))


# ============================================================================================================== runs


class AsyncRuns(_AsyncResource):
    """Runs of every type (interactions, apps, capsules, pipelines) through one paged listing."""

    async def list(
        self,
        *,
        ids: Optional[Sequence[str]] = None,
        types: Optional[Sequence[str]] = None,
        state: Optional[str] = None,
        statuses: Optional[Sequence[str]] = None,
        definition_id: Optional[str] = None,
        namespace_id: Optional[str] = None,
        namespace: Union[str, Sequence[str], None] = None,
        root_process_id: Optional[str] = None,
        parent_process_id: Optional[str] = None,
        resume_from_process_id: Optional[str] = None,
        retained: Optional[bool] = None,
        created_after: Any = None,
        created_before: Any = None,
        cursor: Optional[str] = None,
        limit: Optional[int] = None,
        timeout: Timeout = None,
    ) -> AsyncPage[ProcessSummary]:
        """A page of runs, newest first. Iterate the page to walk every run across pages.

        ``types``: ``App``/``Interaction``/``Capsule``/``CodePipeline``; ``state``: ``Active``/``Waiting``/``Terminal``.
        """
        params = dict(
            ids=ids,
            types=types,
            state=state,
            statuses=statuses,
            definition_id=definition_id,
            namespace_id=namespace_id,
            namespace=namespace,
            root_process_id=root_process_id,
            parent_process_id=parent_process_id,
            resume_from_process_id=resume_from_process_id,
            retained=retained,
            created_after=created_after,
            created_before=created_before,
            limit=limit,
            timeout=timeout,
        )

        async def fetch(next_cursor: str) -> AsyncPage[ProcessSummary]:
            return await self.list(cursor=next_cursor, **params)

        pairs = query(
            ("ids", ids),
            ("types", types),
            ("state", state),
            ("statuses", statuses),
            ("definitionId", definition_id),
            ("namespaceId", namespace_id),
            ("namespace", namespace),
            ("rootProcessId", root_process_id),
            ("parentProcessId", parent_process_id),
            ("resumeFromProcessId", resume_from_process_id),
            ("retained", retained),
            ("createdAfter", created_after),
            ("createdBefore", created_before),
            ("cursor", cursor),
            ("limit", limit),
            csv=("ids", "types", "statuses"),
        )
        page = await self._one(ProcessPage, RequestSpec("GET", "/processes", query=pairs, timeout=timeout))
        return AsyncPage(page.items, page.next_cursor, fetch, page)

    async def get(self, id: str, *, timeout: Timeout = None) -> ProcessSummary:
        """One run of any type, as a summary."""
        return await self._one(ProcessSummary, _get(path("/processes/by-id/{id}", id=id), timeout))

    async def find(self, id: str, *, timeout: Timeout = None) -> Optional[ProcessSummary]:
        return await self._find(ProcessSummary, _get(path("/processes/by-id/{id}", id=id), timeout))

    async def kill(self, id: str, *, type: str, timeout: Timeout = None) -> None:
        """Kills a run (``type``: ``App``, ``Interaction``, ``Capsule`` or ``CodePipeline``)."""
        url = path("/processes/{type}/{id}/kill", type=type, id=id)
        await self._void(RequestSpec("POST", url, json={}, timeout=timeout))

    async def summary(
        self,
        *,
        hours: Optional[int] = None,
        namespace_id: Optional[str] = None,
        namespace: Union[str, Sequence[str], None] = None,
        timeout: Timeout = None,
    ) -> ProcessDashboard:
        """Counts, active runs, failures, throughput and tokens over the last ``hours`` (1-168)."""
        spec = _get(
            "/processes/summary", timeout, ("hours", hours), ("namespaceId", namespace_id), ("namespace", namespace)
        )
        return await self._one(ProcessDashboard, spec)

    async def lane(self, id: str, *, type: str, timeout: Timeout = None) -> RunLaneWait:
        """Whether the run is waiting for a lane before it starts: since when, why, and how many of your runs are ahead."""
        url = path("/processes/{type}/{id}/lane", type=type, id=id)
        return await self._one(RunLaneWait, _get(url, timeout))

    async def retention(self, id: str, *, type: str, timeout: Timeout = None) -> ProcessRetentionStatus:
        """How long the run is kept, and whether a retention lease holds it."""
        url = path("/processes/{type}/{id}/retention-lease", type=type, id=id)
        return await self._one(ProcessRetentionStatus, _get(url, timeout))

    async def retain(
        self, id: str, *, type: str, note: Optional[str] = None, timeout: Timeout = None
    ) -> ProcessRetentionStatus:
        """Keeps the run (and its sub-runs) until released."""
        url = path("/processes/{type}/{id}/retention-lease", type=type, id=id)
        spec = RequestSpec("PUT", url, json=_drop_none({"note": note}), idempotent=True, timeout=timeout)
        return await self._one(ProcessRetentionStatus, spec)

    async def release(self, id: str, *, type: str, timeout: Timeout = None) -> ProcessRetentionStatus:
        url = path("/processes/{type}/{id}/retention-lease", type=type, id=id)
        return await self._one(ProcessRetentionStatus, RequestSpec("DELETE", url, timeout=timeout))

    async def web_usage(self, id: str, *, timeout: Timeout = None) -> List[WebUsageRecord]:
        """The metered web searches and fetches a run made."""
        return await self._many(WebUsageRecord, _get(path("/web/usage/by-process/{id}", id=id), timeout))


# ===================================================================================================== connectors


class AsyncConnectors(_AsyncResource):
    """Connectors: the HTTP endpoints (OpenAPI) and MCP tools Maitento may call."""

    async def list(self, *, namespace: Optional[str] = None, timeout: Timeout = None) -> List[Connector]:
        url = "/connectors" if namespace is None else path("/namespaces/{ns}/connectors", ns=namespace)
        return await self._many(Connector, _get(url, timeout))

    async def get(self, id: str, *, timeout: Timeout = None) -> Connector:
        return cast(Connector, await self._one_of(Connector, _get(path("/connectors/by-id/{id}", id=id), timeout)))

    async def find(self, id: str, *, timeout: Timeout = None) -> Optional[Connector]:
        return cast(Optional[Connector], await self._find_of(Connector, _get(path("/connectors/by-id/{id}", id=id), timeout)))

    async def get_by_name(self, name: str, *, namespace: Optional[str] = None, timeout: Timeout = None) -> Connector:
        url = path("/namespaces/{ns}/connectors/by-name/{name}", ns=self._ns(namespace), name=name)
        return cast(Connector, await self._one_of(Connector, _get(url, timeout)))

    async def find_by_name(
        self, name: str, *, namespace: Optional[str] = None, timeout: Timeout = None
    ) -> Optional[Connector]:
        url = path("/namespaces/{ns}/connectors/by-name/{name}", ns=self._ns(namespace), name=name)
        return cast(Optional[Connector], await self._find_of(Connector, _get(url, timeout)))

    async def create_open_api(
        self,
        request: Union[OpenApiConnectorCreateRequest, Body] = None,
        *,
        namespace: Optional[str] = None,
        timeout: Timeout = None,
        **fields: Any,
    ) -> OpenApiConnector:
        """Describes one HTTP endpoint. ``http_method`` may be given as a plain string (``"POST"``)."""
        if isinstance(fields.get("http_method"), str):
            fields["http_method"] = {"method": fields["http_method"]}
        body = wire(build_model(OpenApiConnectorCreateRequest, request, fields))
        url = path("/namespaces/{ns}/connectors/open-api", ns=self._ns(namespace))
        return await self._one(OpenApiConnector, RequestSpec("POST", url, json=body, timeout=timeout))

    async def create_mcp(
        self,
        request: Union[McpConnectorCreateRequest, Body] = None,
        *,
        namespace: Optional[str] = None,
        timeout: Timeout = None,
        **fields: Any,
    ) -> McpConnector:
        body = wire(build_model(McpConnectorCreateRequest, request, fields))
        url = path("/namespaces/{ns}/connectors/mcp", ns=self._ns(namespace))
        return await self._one(McpConnector, RequestSpec("POST", url, json=body, timeout=timeout))

    async def delete(self, id: str, *, timeout: Timeout = None) -> None:
        await self._void(RequestSpec("DELETE", path("/connectors/by-id/{id}", id=id), timeout=timeout))

    async def disable_version(self, id: str, version: int, *, timeout: Timeout = None) -> Connector:
        """Disables one version; everything pinned to it fails closed."""
        url = path("/connectors/by-id/{id}/versions/{version}/disable", id=id, version=version)
        return cast(Connector, await self._one_of(Connector, RequestSpec("POST", url, timeout=timeout)))

    async def enable_version(self, id: str, version: int, *, timeout: Timeout = None) -> Connector:
        url = path("/connectors/by-id/{id}/versions/{version}/enable", id=id, version=version)
        return cast(Connector, await self._one_of(Connector, RequestSpec("POST", url, timeout=timeout)))


class AsyncTools(_AsyncResource):
    """Tools (external operations): a connector plus fixed bindings and the guidance the model sees."""

    async def list(self, *, namespace: Optional[str] = None, timeout: Timeout = None) -> List[ExternalOperation]:
        url = "/external-operations" if namespace is None else path("/namespaces/{ns}/external-operations", ns=namespace)
        return await self._many(ExternalOperation, _get(url, timeout))

    async def get(self, id: str, *, timeout: Timeout = None) -> ExternalOperation:
        spec = _get(path("/external-operations/by-id/{id}", id=id), timeout)
        return cast(ExternalOperation, await self._one_of(ExternalOperation, spec))

    async def find(self, id: str, *, timeout: Timeout = None) -> Optional[ExternalOperation]:
        spec = _get(path("/external-operations/by-id/{id}", id=id), timeout)
        return cast(Optional[ExternalOperation], await self._find_of(ExternalOperation, spec))

    async def get_by_name(
        self, name: str, *, namespace: Optional[str] = None, timeout: Timeout = None
    ) -> ExternalOperation:
        url = path("/namespaces/{ns}/external-operations/by-name/{name}", ns=self._ns(namespace), name=name)
        return cast(ExternalOperation, await self._one_of(ExternalOperation, _get(url, timeout)))

    async def find_by_name(
        self, name: str, *, namespace: Optional[str] = None, timeout: Timeout = None
    ) -> Optional[ExternalOperation]:
        url = path("/namespaces/{ns}/external-operations/by-name/{name}", ns=self._ns(namespace), name=name)
        return cast(Optional[ExternalOperation], await self._find_of(ExternalOperation, _get(url, timeout)))

    async def create_open_api(
        self,
        request: Union[OpenApiExternalOperationCreateRequest, Body] = None,
        *,
        namespace: Optional[str] = None,
        timeout: Timeout = None,
        **fields: Any,
    ) -> OpenApiExternalOperation:
        body = wire(build_model(OpenApiExternalOperationCreateRequest, request, fields))
        url = path("/namespaces/{ns}/external-operations/open-api", ns=self._ns(namespace))
        return await self._one(OpenApiExternalOperation, RequestSpec("POST", url, json=body, timeout=timeout))

    async def create_mcp(
        self,
        request: Union[McpExternalOperationCreateRequest, Body] = None,
        *,
        namespace: Optional[str] = None,
        timeout: Timeout = None,
        **fields: Any,
    ) -> McpExternalOperation:
        body = wire(build_model(McpExternalOperationCreateRequest, request, fields))
        url = path("/namespaces/{ns}/external-operations/mcp", ns=self._ns(namespace))
        return await self._one(McpExternalOperation, RequestSpec("POST", url, json=body, timeout=timeout))

    async def delete(self, id: str, *, timeout: Timeout = None) -> None:
        await self._void(RequestSpec("DELETE", path("/external-operations/by-id/{id}", id=id), timeout=timeout))

    async def disable_version(self, id: str, version: int, *, timeout: Timeout = None) -> ExternalOperation:
        url = path("/external-operations/by-id/{id}/versions/{version}/disable", id=id, version=version)
        return cast(ExternalOperation, await self._one_of(ExternalOperation, RequestSpec("POST", url, timeout=timeout)))

    async def enable_version(self, id: str, version: int, *, timeout: Timeout = None) -> ExternalOperation:
        url = path("/external-operations/by-id/{id}/versions/{version}/enable", id=id, version=version)
        return cast(ExternalOperation, await self._one_of(ExternalOperation, RequestSpec("POST", url, timeout=timeout)))


# =========================================================================================================== secrets


class AsyncSecrets(_AsyncResource):
    """Secrets. Values are write-only: you can set or replace one, never read it back."""

    async def list(self, *, timeout: Timeout = None) -> List[Secret]:
        return await self._many(Secret, _get("/secrets", timeout))

    async def get(self, id: str, *, timeout: Timeout = None) -> Secret:
        return await self._one(Secret, _get(path("/secrets/by-id/{id}", id=id), timeout))

    async def find(self, id: str, *, timeout: Timeout = None) -> Optional[Secret]:
        return await self._find(Secret, _get(path("/secrets/by-id/{id}", id=id), timeout))

    async def get_by_name(self, name: str, *, timeout: Timeout = None) -> Secret:
        return await self._one(Secret, _get(path("/secrets/by-name/{name}", name=name), timeout))

    async def find_by_name(self, name: str, *, timeout: Timeout = None) -> Optional[Secret]:
        return await self._find(Secret, _get(path("/secrets/by-name/{name}", name=name), timeout))

    async def create(self, name: str, value: str, *, timeout: Timeout = None) -> Secret:
        spec = RequestSpec("POST", "/secrets", json={"name": name, "value": value}, timeout=timeout)
        return await self._one(Secret, spec)

    async def update(self, id: str, *, name: str, value: Optional[str] = None, timeout: Timeout = None) -> Secret:
        """Renames a secret and, when ``value`` is given, replaces its value."""
        spec = RequestSpec("PUT", path("/secrets/by-id/{id}", id=id), json=_drop_none({"name": name, "value": value}), timeout=timeout)
        return await self._one(Secret, spec)

    async def delete(self, id: str, *, timeout: Timeout = None) -> None:
        await self._void(RequestSpec("DELETE", path("/secrets/by-id/{id}", id=id), timeout=timeout))


def _text(value: Any) -> str:
    if isinstance(value, bytes):
        return value.decode("utf-8")
    return "" if value is None else str(value)


# ========================================================================================================== webhooks


class AsyncWebhooks(_AsyncResource):
    """Web hooks: Maitento PUTs an entity's latest state to your URL whenever it changes."""

    async def list(self, *, timeout: Timeout = None) -> List[WebHookRegistration]:
        return await self._many(WebHookRegistration, _get("/web-hooks", timeout))

    async def get(self, id: str, *, timeout: Timeout = None) -> WebHookRegistration:
        return await self._one(WebHookRegistration, _get(path("/web-hooks/by-id/{id}", id=id), timeout))

    async def find(self, id: str, *, timeout: Timeout = None) -> Optional[WebHookRegistration]:
        return await self._find(WebHookRegistration, _get(path("/web-hooks/by-id/{id}", id=id), timeout))

    async def create(
        self,
        *,
        type: str,
        url: str,
        secret: str,
        headers: Optional[Mapping[str, str]] = None,
        timeout: Timeout = None,
    ) -> WebHookRegistration:
        """Registers ``url`` for ``type`` (``InteractionProcess``, ``AppProcess``, ``CapsuleProcess``,
        ``CodePipelineProcess`` or ``IngestedFile``). ``secret`` signs every delivery: check its
        ``X-MT-WebHook-Signature`` header with ``verify_webhook``."""
        body = {"type": str(type), "url": url, "secret": secret, "headers": dict(headers or {})}
        return await self._one(WebHookRegistration, RequestSpec("POST", "/web-hooks", json=body, timeout=timeout))

    async def update(
        self,
        id: str,
        *,
        url: str,
        secret: Optional[str] = None,
        headers: Optional[Mapping[str, Optional[str]]] = None,
        signed_only: Optional[bool] = None,
        timeout: Timeout = None,
    ) -> WebHookRegistration:
        """Updates a registration. ``headers`` is the full set (a ``None`` value keeps that header's stored value;
        leave ``headers`` out to keep them all). Moving ``url`` to another origin needs ``secret`` again.

        ``signed_only=True`` stops a web hook registered before deliveries were signed from sending its secret in
        ``X-MT-WebHook-Secret``: from then on its deliveries are only signed. It can't be undone, so set it once your
        receiver checks ``X-MT-WebHook-Signature``. ``False`` or leaving it out changes nothing."""
        body: Dict[str, Any] = {"url": url}
        if secret is not None:
            body["secret"] = secret
        if headers is not None:
            body["headers"] = dict(headers)
        if signed_only is not None:
            body["signedOnly"] = signed_only
        spec = RequestSpec("PUT", path("/web-hooks/by-id/{id}", id=id), json=body, timeout=timeout)
        return await self._one(WebHookRegistration, spec)

    async def delete(self, id: str, *, timeout: Timeout = None) -> None:
        await self._void(RequestSpec("DELETE", path("/web-hooks/by-id/{id}", id=id), timeout=timeout))

    async def deliveries(self, id: str, *, limit: Optional[int] = None, timeout: Timeout = None) -> List[WebHookDelivery]:
        """The registration's recent deliveries (sent: 24 h; permanent failures: 7 days)."""
        return await self._many(WebHookDelivery, _get(path("/web-hooks/by-id/{id}/deliveries", id=id), timeout, ("limit", limit)))


# ================================================================================================ partitions & files


class AsyncPartitions(_AsyncResource):
    """Knowledge partitions (tenant admins): where uploaded files are kept, chunked and embedded."""

    async def list(self, *, timeout: Timeout = None) -> List[Partition]:
        return await self._many(Partition, _get("/partitions", timeout))

    async def get(self, id: str, *, timeout: Timeout = None) -> Partition:
        return await self._one(Partition, _get(path("/partitions/by-id/{id}", id=id), timeout))

    async def find(self, id: str, *, timeout: Timeout = None) -> Optional[Partition]:
        return await self._find(Partition, _get(path("/partitions/by-id/{id}", id=id), timeout))

    async def create(
        self,
        name: str,
        *,
        is_temporary: Optional[bool] = None,
        file_lifetime_hours: Optional[int] = None,
        timeout: Timeout = None,
    ) -> Partition:
        body = _drop_none({"name": name, "isTemporary": is_temporary, "fileLifetimeHours": file_lifetime_hours})
        return await self._one(Partition, RequestSpec("PUT", "/partitions", json=body, timeout=timeout))

    async def delete(self, id: str, *, timeout: Timeout = None) -> None:
        """Deletes an empty partition."""
        await self._void(RequestSpec("DELETE", path("/partitions/by-id/{id}", id=id), timeout=timeout))

    async def files(
        self, id: str, *, cursor: Optional[str] = None, limit: Optional[int] = None, timeout: Timeout = None
    ) -> AsyncPage[IngestedFileListItem]:
        """A page of the partition's files, newest first. Iterate the page to walk every file."""

        async def fetch(next_cursor: str) -> AsyncPage[IngestedFileListItem]:
            return await self.files(id, cursor=next_cursor, limit=limit, timeout=timeout)

        spec = _get(path("/partitions/by-id/{id}/files", id=id), timeout, ("cursor", cursor), ("limit", limit))
        page = await self._one(IngestedFilePage, spec)
        return AsyncPage(page.items, page.next_cursor, fetch, page)

    async def embedding_models(self, *, timeout: Timeout = None) -> List[EmbeddingModelDefinition]:
        return await self._many(EmbeddingModelDefinition, _get("/partitions/embedding-models", timeout))

    async def list_embedding_credential_failures(self, *, timeout: Timeout = None) -> List[Partition]:
        """Partitions whose embedding credentials failed and are not yet acknowledged."""
        return await self._many(Partition, _get("/partitions/embedding-credential-failures", timeout))

    async def acknowledge_embedding_credential_failures(self, id: str, *, timeout: Timeout = None) -> None:
        url = path("/partitions/by-id/{id}/embedding-credential-failures/acknowledge", id=id)
        await self._void(RequestSpec("PUT", url, idempotent=True, timeout=timeout))

    async def set_embedding_credentials(
        self,
        id: str,
        request: Union[PartitionEmbeddingCredentialsRequest, Body] = None,
        *,
        timeout: Timeout = None,
        **fields: Any,
    ) -> Partition:
        body = wire(build_model(PartitionEmbeddingCredentialsRequest, request, fields))
        url = path("/partitions/by-id/{id}/embedding-credentials", id=id)
        return await self._one(Partition, RequestSpec("PUT", url, json=body, timeout=timeout))

    async def set_embedding_credential_stack(
        self, id: str, credential_stack_id: Optional[str], *, timeout: Timeout = None
    ) -> Partition:
        """Makes the partition embed with ``credential_stack_id``; ``None`` clears it. Its own embedding keys are tried
        first, then the stack's, in place of the tenant's model keys and default stack; Maitento's key is never used.
        Tenant admins only."""
        url = path("/partitions/by-id/{id}/embedding-credential-stack", id=id)
        spec = RequestSpec("PUT", url, json={"credentialStackId": credential_stack_id}, idempotent=True, timeout=timeout)
        return await self._one(Partition, spec)

    async def clear_embedding_credentials(self, id: str, *, timeout: Timeout = None) -> None:
        await self._void(RequestSpec("DELETE", path("/partitions/by-id/{id}/embedding-credentials", id=id), timeout=timeout))

    async def change_embedding_profile(
        self,
        id: str,
        request: Union[PartitionEmbeddingProfileRequest, Body] = None,
        *,
        timeout: Timeout = None,
        **fields: Any,
    ) -> Partition:
        body = wire(build_model(PartitionEmbeddingProfileRequest, request, fields))
        url = path("/partitions/by-id/{id}/embedding-profile", id=id)
        return await self._one(Partition, RequestSpec("PUT", url, json=body, timeout=timeout))

    async def probe_embedding_profile(
        self,
        request: Union[PartitionEmbeddingProbeRequest, Body] = None,
        *,
        timeout: Timeout = None,
        **fields: Any,
    ) -> PartitionEmbeddingProbeResult:
        """Tries an embedding profile and credentials (a failed probe is still a result, not an error)."""
        body = wire(build_model(PartitionEmbeddingProbeRequest, request, fields))
        spec = RequestSpec("POST", "/partitions/embedding-profile/probe", json=body, timeout=timeout)
        return await self._one(PartitionEmbeddingProbeResult, spec)

    async def embedding_status(self, ids: Sequence[str], *, timeout: Timeout = None) -> List[PartitionEmbeddingStatus]:
        spec = RequestSpec("PUT", "/partitions/embedding-status", json={"partitionIds": list(ids)}, idempotent=True, timeout=timeout)
        return await self._many(PartitionEmbeddingStatus, spec)


class AsyncFiles(_AsyncResource):
    """Knowledge files (tenant admins): upload, read back, search. Extraction runs inside the upload request."""

    async def upload(
        self,
        partition_id: str,
        file: FileInput,
        *,
        filename: Optional[str] = None,
        content_type: Optional[str] = None,
        timeout: Timeout = DEPLOY_TIMEOUT,
    ) -> IngestedFile:
        """Uploads ``file`` (bytes, a path, a binary file object or a ``(name, content[, type])`` tuple) into a
        partition. Never retried. A file the server cannot read raises :class:`~maitento.FileIngestionError`."""
        name, data, kind = multipart_file(file, filename=filename, content_type=content_type)
        url = path("/files/partitions/{partition}", partition=partition_id)
        spec = RequestSpec("PUT", url, files={"file": (name, data, kind)}, timeout=timeout)
        return await self._one(IngestedFile, spec)

    async def replace(
        self,
        id: str,
        file: FileInput,
        *,
        filename: Optional[str] = None,
        content_type: Optional[str] = None,
        timeout: Timeout = DEPLOY_TIMEOUT,
    ) -> IngestedFile:
        """Replaces a file's content (the same bytes are a no-op)."""
        name, data, kind = multipart_file(file, filename=filename, content_type=content_type)
        spec = RequestSpec("PATCH", path("/files/by-id/{id}", id=id), files={"file": (name, data, kind)}, timeout=timeout)
        return await self._one(IngestedFile, spec)

    async def get(self, id: str, *, partition_id: Optional[str] = None, timeout: Timeout = None) -> IngestedFile:
        """The file's details (including its extracted ``text``)."""
        spec = _get(path("/files/by-id/{id}/details", id=id), timeout, ("partitionId", partition_id))
        return await self._one(IngestedFile, spec)

    async def find(self, id: str, *, partition_id: Optional[str] = None, timeout: Timeout = None) -> Optional[IngestedFile]:
        spec = _get(path("/files/by-id/{id}/details", id=id), timeout, ("partitionId", partition_id))
        return await self._find(IngestedFile, spec)

    async def download(self, id: str, *, partition_id: Optional[str] = None, timeout: Timeout = None) -> bytes:
        """The file's original bytes."""
        spec = RequestSpec(
            "GET", path("/files/by-id/{id}", id=id), query=query(("partitionId", partition_id)), accept="*/*", timeout=timeout
        )
        spec.expect_body = True
        return _bytes(await self._send(spec))

    async def text(self, id: str, *, partition_id: Optional[str] = None, timeout: Timeout = None) -> str:
        """The file's extracted text."""
        spec = _get(path("/files/by-id/{id}/text", id=id), timeout, ("partitionId", partition_id))
        return (await self._one(FileTextResponse, spec)).text

    async def find_by_checksum(self, checksum: str, *, timeout: Timeout = None) -> Optional[IngestedFileSummary]:
        """The file already stored with this checksum, if any (to skip re-uploading)."""
        return await self._find(IngestedFileSummary, _get(path("/files/by-checksum/{checksum}", checksum=checksum), timeout))

    async def search(self, partition_id: str, query: str, *, timeout: Timeout = None) -> List[EmbeddingsSearchResult]:
        """Semantic search over a partition's files."""
        spec = RequestSpec(
            "PUT", "/files/embeddings/search", json={"partitionId": partition_id, "query": query}, idempotent=True, timeout=timeout
        )
        return await self._many(EmbeddingsSearchResult, spec)

    async def delete(self, id: str, *, timeout: Timeout = None) -> None:
        await self._void(RequestSpec("DELETE", path("/files/by-id/{id}", id=id), timeout=timeout))


def _bytes(value: Any) -> bytes:
    """A body that should be bytes, whatever ``Content-Type`` the server labelled it with."""
    if isinstance(value, bytes):
        return value
    if isinstance(value, str):
        return value.encode("utf-8")
    return b"" if value is None else json.dumps(value).encode("utf-8")


# =============================================================================================================== vfs


class AsyncVfsHandle:
    """One virtual file system, by name or by id. Every path is VFS-absolute (``/notes/today.md``)."""

    def __init__(self, client: "AsyncMaitento", base: str) -> None:
        self._client = client
        self._base = base

    async def _send(self, spec: RequestSpec) -> Any:
        return await self._client._transport.request(spec)

    def _url(self, suffix: str) -> str:
        return self._base + suffix

    async def _file(
        self, method: str, suffix: str, body: Any, file_path: str, timeout: Timeout, *, idempotent: bool
    ) -> FileSystemFile:
        # A write leaves the same file however often it arrives, so it is retried; an append is not.
        spec = RequestSpec(
            method, self._url(suffix), query=query(("path", file_path)), json=body, idempotent=idempotent, timeout=timeout
        )
        spec.expect_body = True
        return cast(FileSystemFile, parse(FileSystemFile, await self._send(spec)))

    async def info(self, *, timeout: Timeout = None) -> VirtualFileSystem:
        """The file system itself."""
        spec = RequestSpec("GET", self._base, timeout=timeout, expect_body=True)
        return cast(VirtualFileSystem, parse(VirtualFileSystem, await self._send(spec)))

    async def read_text(self, file_path: str, *, timeout: Timeout = None) -> str:
        spec = RequestSpec(
            "GET", self._url("/files/contents/text"), query=query(("path", file_path)), accept="text/plain", timeout=timeout
        )
        return _text(await self._send(spec))

    async def read_bytes(self, file_path: str, *, timeout: Timeout = None) -> bytes:
        spec = RequestSpec(
            "GET", self._url("/files/contents/bytes"), query=query(("path", file_path)), accept="*/*", timeout=timeout
        )
        return _bytes(await self._send(spec))

    async def read_lines(self, file_path: str, *, timeout: Timeout = None) -> List[str]:
        spec = RequestSpec("GET", self._url("/files/contents/lines"), query=query(("path", file_path)), timeout=timeout)
        return [str(line) for line in (await self._send(spec) or [])]

    async def write_text(self, file_path: str, content: str, *, timeout: Timeout = None) -> FileSystemFile:
        return await self._file("PUT", "/files/write/text", {"content": content}, file_path, timeout, idempotent=True)

    async def write_bytes(self, file_path: str, content: bytes, *, timeout: Timeout = None) -> FileSystemFile:
        body = {"content": _b64(content)}
        return await self._file("PUT", "/files/write/bytes", body, file_path, timeout, idempotent=True)

    async def write_lines(self, file_path: str, lines: Sequence[str], *, timeout: Timeout = None) -> FileSystemFile:
        return await self._file("PUT", "/files/write/lines", {"content": list(lines)}, file_path, timeout, idempotent=True)

    async def append(self, file_path: str, content: str, *, timeout: Timeout = None) -> FileSystemFile:
        """Appends text to a file (creating it when missing). See also ``append_bytes`` and ``append_lines``."""
        return await self._file("PUT", "/files/append/text", {"content": content}, file_path, timeout, idempotent=False)

    async def append_bytes(self, file_path: str, content: bytes, *, timeout: Timeout = None) -> FileSystemFile:
        return await self._file("PUT", "/files/append/bytes", {"content": _b64(content)}, file_path, timeout, idempotent=False)

    async def append_lines(self, file_path: str, lines: Sequence[str], *, timeout: Timeout = None) -> FileSystemFile:
        return await self._file("PUT", "/files/append/lines", {"content": list(lines)}, file_path, timeout, idempotent=False)

    async def list(self, directory: str = "/", *, timeout: Timeout = None) -> List[FileSystemEntry]:
        """The entries of a directory (files and directories, by ``type_``)."""
        spec = RequestSpec("GET", self._url("/directories/contents"), query=query(("path", directory)), timeout=timeout)
        return [cast(FileSystemEntry, parse(FileSystemEntry, item)) for item in (await self._send(spec) or [])]

    async def exists(self, file_path: str, *, timeout: Timeout = None) -> bool:
        """Whether a FILE exists at ``file_path`` (see ``dir_exists``)."""
        spec = RequestSpec("GET", self._url("/files/exists"), query=query(("path", file_path)), timeout=timeout)
        return bool(await self._send(spec))

    async def dir_exists(self, directory: str, *, timeout: Timeout = None) -> bool:
        spec = RequestSpec("GET", self._url("/directories/exists"), query=query(("path", directory)), timeout=timeout)
        return bool(await self._send(spec))

    async def delete(self, file_path: str, *, timeout: Timeout = None) -> None:
        """Deletes a file."""
        await self._send(RequestSpec("DELETE", self._url("/files"), query=query(("path", file_path)), timeout=timeout))

    async def delete_dir(self, directory: str, *, recursive: bool = False, timeout: Timeout = None) -> None:
        spec = RequestSpec(
            "DELETE", self._url("/directories"), query=query(("path", directory), ("recursive", recursive)), timeout=timeout
        )
        await self._send(spec)

    async def mkdir(self, directory: str, *, timeout: Timeout = None) -> FileSystemDirectory:
        spec = RequestSpec("PUT", self._url("/directories"), query=query(("path", directory)), idempotent=True, timeout=timeout)
        spec.expect_body = True
        return cast(FileSystemDirectory, parse(FileSystemDirectory, await self._send(spec)))

    async def copy(self, source: str, destination: str, *, timeout: Timeout = None) -> FileSystemEntry:
        spec = RequestSpec(
            "PUT", self._url("/copy"), query=query(("path", source), ("destination", destination)), timeout=timeout
        )
        spec.expect_body = True
        return cast(FileSystemEntry, parse(FileSystemEntry, await self._send(spec)))

    async def move(self, source: str, destination: str, *, timeout: Timeout = None) -> FileSystemEntry:
        spec = RequestSpec(
            "POST", self._url("/move"), query=query(("path", source), ("destination", destination)), timeout=timeout
        )
        spec.expect_body = True
        return cast(FileSystemEntry, parse(FileSystemEntry, await self._send(spec)))

    async def _post(self, suffix: str, model: Any, result: Type[T], request: Any, fields: Mapping[str, Any], timeout: Timeout, idempotent: bool) -> T:
        body = wire(build_model(model, request, fields))
        spec = RequestSpec("POST", self._url(suffix), json=body, idempotent=idempotent, timeout=timeout, expect_body=True)
        return cast(T, parse(result, await self._send(spec)))

    async def find(self, request: Union[FindRequest, Body] = None, *, timeout: Timeout = None, **fields: Any) -> FindResponse:
        """Finds files by name ``pattern`` and/or content (``grep``)."""
        return await self._post("/find", FindRequest, FindResponse, request, fields, timeout, True)

    async def tree(self, request: Union[TreeRequest, Body] = None, *, timeout: Timeout = None, **fields: Any) -> TreeResponse:
        return await self._post("/tree", TreeRequest, TreeResponse, request, fields, timeout, True)

    async def edit(self, request: Union[EditRequest, Body] = None, *, timeout: Timeout = None, **fields: Any) -> EditResponse:
        """Search-and-replace edits in one file."""
        return await self._post("/files/edit", EditRequest, EditResponse, request, fields, timeout, False)

    async def batch_edit(
        self, request: Union[BatchEditRequest, Body] = None, *, timeout: Timeout = None, **fields: Any
    ) -> BatchEditResponse:
        return await self._post("/batch/edit", BatchEditRequest, BatchEditResponse, request, fields, timeout, False)

    async def batch_read(
        self, request: Union[BatchReadRequest, Body] = None, *, timeout: Timeout = None, **fields: Any
    ) -> BatchReadResponse:
        return await self._post("/batch/read", BatchReadRequest, BatchReadResponse, request, fields, timeout, True)

    async def destroy(self, *, timeout: Timeout = None) -> None:
        """Deletes the whole file system."""
        await self._send(RequestSpec("DELETE", self._base, timeout=timeout))


def _b64(content: bytes) -> str:
    return base64.b64encode(bytes(content)).decode("ascii")


class AsyncVfs(_AsyncResource):
    """Virtual file systems. ``open(name)`` returns a handle for the file operations."""

    async def list(self, *, namespace: Optional[str] = None, timeout: Timeout = None) -> List[VirtualFileSystem]:
        url = "/vfs" if namespace is None else path("/namespaces/{ns}/vfs", ns=namespace)
        return await self._many(VirtualFileSystem, _get(url, timeout))

    async def get(self, id: str, *, timeout: Timeout = None) -> VirtualFileSystem:
        return await self._one(VirtualFileSystem, _get(path("/vfs/by-id/{id}", id=id), timeout))

    async def find(self, id: str, *, timeout: Timeout = None) -> Optional[VirtualFileSystem]:
        return await self._find(VirtualFileSystem, _get(path("/vfs/by-id/{id}", id=id), timeout))

    async def get_by_name(self, name: str, *, namespace: Optional[str] = None, timeout: Timeout = None) -> VirtualFileSystem:
        url = path("/namespaces/{ns}/vfs/by-name/{name}", ns=self._ns(namespace), name=name)
        return await self._one(VirtualFileSystem, _get(url, timeout))

    async def find_by_name(
        self, name: str, *, namespace: Optional[str] = None, timeout: Timeout = None
    ) -> Optional[VirtualFileSystem]:
        url = path("/namespaces/{ns}/vfs/by-name/{name}", ns=self._ns(namespace), name=name)
        return await self._find(VirtualFileSystem, _get(url, timeout))

    async def create(self, name: str, *, namespace: Optional[str] = None, timeout: Timeout = None) -> VirtualFileSystem:
        url = path("/namespaces/{ns}/vfs", ns=self._ns(namespace))
        return await self._one(VirtualFileSystem, RequestSpec("POST", url, json={"name": name}, timeout=timeout))

    async def delete(self, id: str, *, timeout: Timeout = None) -> None:
        await self._void(RequestSpec("DELETE", path("/vfs/by-id/{id}", id=id), timeout=timeout))

    async def delete_by_name(self, name: str, *, namespace: Optional[str] = None, timeout: Timeout = None) -> None:
        url = path("/namespaces/{ns}/vfs/by-name/{name}", ns=self._ns(namespace), name=name)
        await self._void(RequestSpec("DELETE", url, timeout=timeout))

    def open(self, name: str, *, namespace: Optional[str] = None) -> AsyncVfsHandle:
        """A handle on the file system called ``name`` (no call is made until you use it)."""
        return AsyncVfsHandle(self._client, path("/namespaces/{ns}/vfs/by-name/{name}", ns=self._ns(namespace), name=name))

    def open_by_id(self, id: str) -> AsyncVfsHandle:
        """A handle on the file system with this id."""
        return AsyncVfsHandle(self._client, path("/vfs/by-id/{id}", id=id))


# ============================================================================================================= looms


class AsyncLooms(_AsyncResource):
    """Looms: long-lived agent memory woven from threads."""

    async def list(self, namespace_id: str, *, timeout: Timeout = None) -> List[Loom]:
        """The looms of a namespace (by namespace **id**)."""
        return await self._many(Loom, _get(path("/looms/by-namespace/{ns}", ns=namespace_id), timeout))

    async def get(self, id: str, *, timeout: Timeout = None) -> Loom:
        return await self._one(Loom, _get(path("/looms/by-id/{id}", id=id), timeout))

    async def find(self, id: str, *, timeout: Timeout = None) -> Optional[Loom]:
        return await self._find(Loom, _get(path("/looms/by-id/{id}", id=id), timeout))

    async def create(self, request: Union[LoomCreateRequest, Body] = None, *, timeout: Timeout = None, **fields: Any) -> Loom:
        """Creates a loom (``name``, ``namespace_id``, ``description``, ``settings``)."""
        body = wire(build_model(LoomCreateRequest, request, fields))
        return await self._one(Loom, RequestSpec("PUT", "/looms", json=body, timeout=timeout))

    async def update(
        self, id: str, request: Union[LoomUpdateRequest, Body] = None, *, timeout: Timeout = None, **fields: Any
    ) -> Loom:
        """Changes the fields given; the others stay."""
        body = wire(build_model(LoomUpdateRequest, request, fields))
        return await self._one(Loom, RequestSpec("PATCH", path("/looms/by-id/{id}", id=id), json=body, timeout=timeout))

    async def delete(self, id: str, *, timeout: Timeout = None) -> None:
        """Unravels (erases) a loom. Tenant admins only."""
        await self._void(RequestSpec("DELETE", path("/looms/by-id/{id}", id=id), timeout=timeout))

    async def inspect(self, id: str, *, timeout: Timeout = None) -> LoomInspection:
        return await self._one(LoomInspection, _get(path("/looms/by-id/{id}/inspect", id=id), timeout))

    async def reflect(self, id: str, topic: str, *, timeout: Timeout = None) -> LoomReflection:
        url = path("/looms/by-id/{id}/reflect", id=id)
        return await self._one(LoomReflection, RequestSpec("PUT", url, json={"topic": topic}, timeout=timeout))

    async def tapestry(
        self,
        id: str,
        *,
        subjects: Optional[Sequence[str]] = None,
        agent_name: Optional[str] = None,
        tokens: Optional[int] = None,
        timeout: Timeout = None,
    ) -> TapestryPreview:
        """What an agent would wake up knowing."""
        spec = _get(
            path("/looms/by-id/{id}/tapestry", id=id),
            timeout,
            ("subjects", subjects),
            ("agentName", agent_name),
            ("tokens", tokens),
        )
        return await self._one(TapestryPreview, spec)

    async def night_weave(self, id: str, *, timeout: Timeout = None) -> None:
        """Asks for a night weave now (accepted, runs in the background)."""
        await self._void(RequestSpec("PUT", path("/looms/by-id/{id}/night-weave", id=id), timeout=timeout))

    async def night_weavings(self, id: str, *, limit: Optional[int] = None, timeout: Timeout = None) -> List[NightWeaving]:
        return await self._many(NightWeaving, _get(path("/looms/by-id/{id}/night-weavings", id=id), timeout, ("limit", limit)))

    async def night_weavings_since(
        self, since: Any, *, limit: Optional[int] = None, timeout: Timeout = None
    ) -> List[NightWeaving]:
        """Night weavings across the tenant's looms since a UTC ``datetime``."""
        return await self._many(NightWeaving, _get("/looms/night-weavings", timeout, ("since", since), ("limit", limit)))

    async def threads(
        self,
        id: str,
        *,
        kind: Union[str, Sequence[str], None] = None,
        strand: Optional[str] = None,
        knots: Optional[str] = None,
        pinned: Optional[bool] = None,
        subject: Optional[str] = None,
        tag: Optional[str] = None,
        visibility: Optional[str] = None,
        sort: Optional[str] = None,
        skip: Optional[int] = None,
        limit: Optional[int] = None,
        timeout: Timeout = None,
    ) -> List[LoomThread]:
        spec = _get(
            path("/looms/by-id/{id}/threads", id=id),
            timeout,
            ("kind", kind),
            ("strand", strand),
            ("knots", knots),
            ("pinned", pinned),
            ("subject", subject),
            ("tag", tag),
            ("visibility", visibility),
            ("sort", sort),
            ("skip", skip),
            ("limit", limit),
        )
        return await self._many(LoomThread, spec)

    async def thread(self, id: str, thread_id: str, *, timeout: Timeout = None) -> LoomThread:
        url = path("/looms/by-id/{id}/threads/by-id/{thread}", id=id, thread=thread_id)
        return await self._one(LoomThread, _get(url, timeout))

    async def find_thread(self, id: str, thread_id: str, *, timeout: Timeout = None) -> Optional[LoomThread]:
        url = path("/looms/by-id/{id}/threads/by-id/{thread}", id=id, thread=thread_id)
        return await self._find(LoomThread, _get(url, timeout))

    async def weave(self, id: str, request: Union[ThreadWeaveRequest, Body] = None, *, timeout: Timeout = None, **fields: Any) -> WeaveResult:
        """Weaves a thread (``content``, ``kind``, ``subjects``, ``tags``, ...)."""
        body = wire(build_model(ThreadWeaveRequest, request, fields))
        url = path("/looms/by-id/{id}/threads", id=id)
        return await self._one(WeaveResult, RequestSpec("PUT", url, json=body, timeout=timeout))

    async def recall(
        self,
        id: str,
        query_text: str,
        *,
        kinds: Optional[Sequence[str]] = None,
        limit: Optional[int] = None,
        subjects: Optional[Sequence[str]] = None,
        recency_bias: Optional[float] = None,
        timeout: Timeout = None,
    ) -> List[ThreadRecollection]:
        """The threads most relevant to ``query_text``."""
        body = _drop_none(
            {
                "query": query_text,
                "kinds": list(kinds) if kinds is not None else None,
                "limit": limit,
                "subjects": list(subjects) if subjects is not None else None,
                "recencyBias": recency_bias,
            }
        )
        url = path("/looms/by-id/{id}/threads/recall", id=id)
        return await self._many(ThreadRecollection, RequestSpec("PUT", url, json=body, idempotent=True, timeout=timeout))

    async def reframe(
        self,
        id: str,
        thread_id: str,
        *,
        reason: str,
        content: Optional[str] = None,
        weight: Optional[float] = None,
        foundational: Optional[bool] = None,
        acknowledgment: Optional[str] = None,
        cues: Optional[Sequence[str]] = None,
        timeout: Timeout = None,
    ) -> LoomThread:
        body = _drop_none(
            {
                "content": content,
                "weight": weight,
                "foundational": foundational,
                "reason": reason,
                "acknowledgment": acknowledgment,
                "cues": list(cues) if cues is not None else None,
            }
        )
        url = path("/looms/by-id/{id}/threads/by-id/{thread}/reframe", id=id, thread=thread_id)
        return await self._one(LoomThread, RequestSpec("PUT", url, json=body, timeout=timeout))

    async def cut(
        self, id: str, thread_id: str, *, acknowledgment: str, essence: Optional[str] = None, timeout: Timeout = None
    ) -> LoomThread:
        url = path("/looms/by-id/{id}/threads/by-id/{thread}/cut", id=id, thread=thread_id)
        body = _drop_none({"acknowledgment": acknowledgment, "essence": essence})
        return await self._one(LoomThread, RequestSpec("PUT", url, json=body, timeout=timeout))

    async def pin(self, id: str, thread_id: str, pinned: bool = True, *, timeout: Timeout = None) -> LoomThread:
        url = path("/looms/by-id/{id}/threads/by-id/{thread}/pin", id=id, thread=thread_id)
        return await self._one(LoomThread, RequestSpec("PUT", url, json={"pinned": pinned}, idempotent=True, timeout=timeout))

    async def delete_thread(self, id: str, thread_id: str, *, timeout: Timeout = None) -> None:
        """Unravels (erases) one thread. Tenant admins only."""
        url = path("/looms/by-id/{id}/threads/by-id/{thread}", id=id, thread=thread_id)
        await self._void(RequestSpec("DELETE", url, timeout=timeout))

    async def give(
        self,
        id: str,
        thread_id: str,
        *,
        to_loom_id: Optional[str] = None,
        to_loom: Optional[str] = None,
        note: Optional[str] = None,
        timeout: Timeout = None,
    ) -> WeaveResult:
        """Gives a thread to another loom (by id, or by ``"name"`` / ``"name@namespace"``)."""
        url = path("/looms/by-id/{id}/threads/by-id/{thread}/give", id=id, thread=thread_id)
        body = _drop_none({"toLoomId": to_loom_id, "toLoom": to_loom, "note": note})
        return await self._one(WeaveResult, RequestSpec("PUT", url, json=body, timeout=timeout))

    async def seed(
        self,
        id: str,
        *,
        from_loom_id: Optional[str] = None,
        from_loom: Optional[str] = None,
        limit: Optional[int] = None,
        timeout: Timeout = None,
    ) -> LoomSeeding:
        """Seeds this loom from another one's foundational threads."""
        url = path("/looms/by-id/{id}/seed", id=id)
        body = _drop_none({"fromLoomId": from_loom_id, "fromLoom": from_loom, "limit": limit})
        return await self._one(LoomSeeding, RequestSpec("PUT", url, json=body, timeout=timeout))

    async def tensions(
        self, id: str, *, open: Optional[bool] = None, limit: Optional[int] = None, timeout: Timeout = None
    ) -> List[LoomTensionView]:
        spec = _get(path("/looms/by-id/{id}/tensions", id=id), timeout, ("open", open), ("limit", limit))
        return await self._many(LoomTensionView, spec)

    async def resolve_tension(self, id: str, tension_id: str, resolution: str, *, timeout: Timeout = None) -> LoomTensionView:
        url = path("/looms/by-id/{id}/tensions/by-id/{tension}/resolve", id=id, tension=tension_id)
        return await self._one(LoomTensionView, RequestSpec("PUT", url, json={"resolution": resolution}, timeout=timeout))

    async def panels(self, id: str, *, limit: Optional[int] = None, timeout: Timeout = None) -> List[TapestryPanel]:
        return await self._many(TapestryPanel, _get(path("/looms/by-id/{id}/panels", id=id), timeout, ("limit", limit)))

    async def sessions(self, id: str, *, limit: Optional[int] = None, timeout: Timeout = None) -> List[LoomSession]:
        return await self._many(LoomSession, _get(path("/looms/by-id/{id}/sessions", id=id), timeout, ("limit", limit)))

    async def patterns(self, id: str, *, limit: Optional[int] = None, timeout: Timeout = None) -> List[LoomPattern]:
        return await self._many(LoomPattern, _get(path("/looms/by-id/{id}/patterns", id=id), timeout, ("limit", limit)))

    async def pattern(self, id: str, codebase: str, *, timeout: Timeout = None) -> LoomPattern:
        url = path("/looms/by-id/{id}/patterns/by-name/{codebase}", id=id, codebase=codebase)
        return await self._one(LoomPattern, _get(url, timeout))

    async def shape_pattern(
        self, id: str, codebase: str, request: Union[PatternChange, Body] = None, *, timeout: Timeout = None, **fields: Any
    ) -> LoomPattern:
        body = wire(build_model(PatternChange, request, fields))
        url = path("/looms/by-id/{id}/patterns/by-name/{codebase}", id=id, codebase=codebase)
        return await self._one(LoomPattern, RequestSpec("PUT", url, json=body, timeout=timeout))

    async def delete_pattern(self, id: str, codebase: str, *, timeout: Timeout = None) -> None:
        url = path("/looms/by-id/{id}/patterns/by-name/{codebase}", id=id, codebase=codebase)
        await self._void(RequestSpec("DELETE", url, timeout=timeout))


# ======================================================================================================= automations


class AsyncAutomations(_AsyncResource):
    """Automations (automated actions): start processes on a schedule or when other runs change."""

    async def list(self, *, namespace: Optional[str] = None, timeout: Timeout = None) -> List[AutomatedAction]:
        url = "/automated-actions" if namespace is None else path("/namespaces/{ns}/automated-actions", ns=namespace)
        return await self._many(AutomatedAction, _get(url, timeout))

    async def get(self, id: str, *, timeout: Timeout = None) -> AutomatedAction:
        return await self._one(AutomatedAction, _get(path("/automated-actions/by-id/{id}", id=id), timeout))

    async def find(self, id: str, *, timeout: Timeout = None) -> Optional[AutomatedAction]:
        return await self._find(AutomatedAction, _get(path("/automated-actions/by-id/{id}", id=id), timeout))

    async def get_by_name(self, name: str, *, namespace: Optional[str] = None, timeout: Timeout = None) -> AutomatedAction:
        url = path("/namespaces/{ns}/automated-actions/by-name/{name}", ns=self._ns(namespace), name=name)
        return await self._one(AutomatedAction, _get(url, timeout))

    async def find_by_name(
        self, name: str, *, namespace: Optional[str] = None, timeout: Timeout = None
    ) -> Optional[AutomatedAction]:
        url = path("/namespaces/{ns}/automated-actions/by-name/{name}", ns=self._ns(namespace), name=name)
        return await self._find(AutomatedAction, _get(url, timeout))

    async def create(
        self,
        request: Union[CreateAutomatedActionRequest, Body] = None,
        *,
        namespace: Optional[str] = None,
        timeout: Timeout = None,
        **fields: Any,
    ) -> AutomatedAction:
        body = wire(build_model(CreateAutomatedActionRequest, request, fields))
        url = path("/namespaces/{ns}/automated-actions", ns=self._ns(namespace))
        return await self._one(AutomatedAction, RequestSpec("POST", url, json=body, timeout=timeout))

    async def update(
        self, id: str, request: Union[UpdateAutomatedActionRequest, Body] = None, *, timeout: Timeout = None, **fields: Any
    ) -> AutomatedAction:
        body = wire(build_model(UpdateAutomatedActionRequest, request, fields))
        url = path("/automated-actions/by-id/{id}", id=id)
        return await self._one(AutomatedAction, RequestSpec("PUT", url, json=body, timeout=timeout))

    async def delete(self, id: str, *, timeout: Timeout = None) -> None:
        await self._void(RequestSpec("DELETE", path("/automated-actions/by-id/{id}", id=id), timeout=timeout))

    async def trigger(self, id: str, *, timeout: Timeout = None) -> TriggerResponse:
        """Runs the automation now (never retried); returns the first started ``process_id``.

        Raises :class:`ValidationError` with code ``api:automations:start-failed`` (then the cause's own codes) when
        nothing could start.
        """
        url = path("/automated-actions/by-id/{id}/trigger", id=id)
        return await self._one(TriggerResponse, RequestSpec("POST", url, timeout=timeout))

    async def history(self, id: str, *, limit: Optional[int] = None, timeout: Timeout = None) -> List[ExecutionHistoryEntry]:
        url = path("/automated-actions/by-id/{id}/history", id=id)
        return await self._many(ExecutionHistoryEntry, _get(url, timeout, ("limit", limit)))

    async def _action(self, method: str, url: str, body: Any, timeout: Timeout) -> AutomatedAction:
        return await self._one(AutomatedAction, RequestSpec(method, url, json=body, timeout=timeout))

    async def add_schedule(
        self, id: str, schedule: Union[CronScheduleInput, Body] = None, *, timeout: Timeout = None, **fields: Any
    ) -> AutomatedAction:
        body = wire(build_model(CronScheduleInput, schedule, fields))
        return await self._action("POST", path("/automated-actions/by-id/{id}/schedules", id=id), body, timeout)

    async def update_schedule(
        self, id: str, schedule_id: str, schedule: Union[CronScheduleInput, Body] = None, *, timeout: Timeout = None, **fields: Any
    ) -> AutomatedAction:
        body = wire(build_model(CronScheduleInput, schedule, fields))
        url = path("/automated-actions/by-id/{id}/schedules/{schedule}", id=id, schedule=schedule_id)
        return await self._action("PUT", url, body, timeout)

    async def remove_schedule(self, id: str, schedule_id: str, *, timeout: Timeout = None) -> AutomatedAction:
        url = path("/automated-actions/by-id/{id}/schedules/{schedule}", id=id, schedule=schedule_id)
        return await self._action("DELETE", url, NO_BODY, timeout)

    async def enable_schedule(self, id: str, schedule_id: str, *, timeout: Timeout = None) -> AutomatedAction:
        url = path("/automated-actions/by-id/{id}/schedules/{schedule}/enable", id=id, schedule=schedule_id)
        return await self._action("POST", url, NO_BODY, timeout)

    async def disable_schedule(self, id: str, schedule_id: str, *, timeout: Timeout = None) -> AutomatedAction:
        url = path("/automated-actions/by-id/{id}/schedules/{schedule}/disable", id=id, schedule=schedule_id)
        return await self._action("POST", url, NO_BODY, timeout)

    async def add_message_trigger(
        self, id: str, trigger: Union[MessageTriggerInput, Body] = None, *, timeout: Timeout = None, **fields: Any
    ) -> AutomatedAction:
        body = wire(build_model(MessageTriggerInput, trigger, fields))
        return await self._action("POST", path("/automated-actions/by-id/{id}/message-triggers", id=id), body, timeout)

    async def update_message_trigger(
        self, id: str, trigger_id: str, trigger: Union[MessageTriggerInput, Body] = None, *, timeout: Timeout = None, **fields: Any
    ) -> AutomatedAction:
        body = wire(build_model(MessageTriggerInput, trigger, fields))
        url = path("/automated-actions/by-id/{id}/message-triggers/{trigger}", id=id, trigger=trigger_id)
        return await self._action("PUT", url, body, timeout)

    async def remove_message_trigger(self, id: str, trigger_id: str, *, timeout: Timeout = None) -> AutomatedAction:
        url = path("/automated-actions/by-id/{id}/message-triggers/{trigger}", id=id, trigger=trigger_id)
        return await self._action("DELETE", url, NO_BODY, timeout)

    async def enable_message_trigger(self, id: str, trigger_id: str, *, timeout: Timeout = None) -> AutomatedAction:
        url = path("/automated-actions/by-id/{id}/message-triggers/{trigger}/enable", id=id, trigger=trigger_id)
        return await self._action("POST", url, NO_BODY, timeout)

    async def disable_message_trigger(self, id: str, trigger_id: str, *, timeout: Timeout = None) -> AutomatedAction:
        url = path("/automated-actions/by-id/{id}/message-triggers/{trigger}/disable", id=id, trigger=trigger_id)
        return await self._action("POST", url, NO_BODY, timeout)


# ============================================================================================================ builds


class AsyncBuilds(_AsyncResource):
    """The Build API: compile (``validate``) or compile-and-deploy (``deploy``) a resource project."""

    async def _build(self, source: ProjectSource, *, is_deploy: bool, namespace: Optional[str], timeout: Timeout) -> BuildResponse:
        request = project_request(source, is_deploy=is_deploy)
        url = path("/namespaces/{ns}/build", ns=self._ns(namespace))
        spec = RequestSpec("PUT", url, json=wire(request), timeout=timeout)
        return await self._one(BuildResponse, spec)

    async def deploy(
        self,
        source: ProjectSource,
        *,
        namespace: Optional[str] = None,
        throw_on_failure: bool = True,
        timeout: Timeout = DEPLOY_TIMEOUT,
    ) -> BuildResponse:
        """Compiles and deploys a project (a folder, a ``{path: text}`` mapping or a ``BuildRequest``).

        Deploying needs a tenant admin: anyone else gets a 403 with code ``api:builds:deploy-requires-admin``
        (``validate`` works for every member).

        Compile errors raise :class:`~maitento.BuildFailedError` (nothing is deployed) unless
        ``throw_on_failure=False``, in which case check ``response.is_success``. Never retried.
        """
        response = await self._build(source, is_deploy=True, namespace=namespace, timeout=timeout)
        if throw_on_failure and not response.is_success:
            raise BuildFailedError(_build_failure(response), response=response)
        return response

    async def validate(
        self, source: ProjectSource, *, namespace: Optional[str] = None, timeout: Timeout = DEPLOY_TIMEOUT
    ) -> BuildResponse:
        """Compiles a project without deploying it. Check ``response.is_success`` and ``response.log``."""
        return await self._build(source, is_deploy=False, namespace=namespace, timeout=timeout)

    async def list(
        self,
        *,
        namespace: Optional[str] = None,
        namespaces: Optional[Sequence[str]] = None,
        outcome: Optional[str] = None,
        is_deploy: Optional[bool] = None,
        cursor: Optional[str] = None,
        limit: Optional[int] = None,
        timeout: Timeout = None,
    ) -> AsyncPage[BuildRecordSummary]:
        """A page of the build history, newest first (one ``namespace``, several ``namespaces``, or all).
        ``outcome``: ``Succeeded``, ``Failed`` or ``Rejected``. Iterate the page to walk every build."""

        async def fetch(next_cursor: str) -> AsyncPage[BuildRecordSummary]:
            return await self.list(
                namespace=namespace,
                namespaces=namespaces,
                outcome=outcome,
                is_deploy=is_deploy,
                cursor=next_cursor,
                limit=limit,
                timeout=timeout,
            )

        url = "/builds" if namespace is None else path("/namespaces/{ns}/builds", ns=namespace)
        spec = _get(
            url,
            timeout,
            ("namespace", namespaces),
            ("outcome", outcome),
            ("isDeploy", is_deploy),
            ("cursor", cursor),
            ("limit", limit),
        )
        page = await self._one(BuildRecordPage, spec)
        return AsyncPage(list(page.items), page.next_cursor, fetch, page)

    async def get(self, id: str, *, timeout: Timeout = None) -> BuildRecord:
        """One recorded build: manifest, sources and log."""
        return await self._one(BuildRecord, _get(path("/builds/by-id/{id}", id=id), timeout))

    async def find(self, id: str, *, timeout: Timeout = None) -> Optional[BuildRecord]:
        return await self._find(BuildRecord, _get(path("/builds/by-id/{id}", id=id), timeout))

    async def delete(self, id: str, *, timeout: Timeout = None) -> None:
        """Deletes a build record. Tenant admins only."""
        await self._void(RequestSpec("DELETE", path("/builds/by-id/{id}", id=id), timeout=timeout))


def _build_failure(response: BuildResponse) -> str:
    errors = [entry for entry in response.log if str(entry.log_level) == "Error"]
    lines = [
        f"{entry.filename or ''}{':' + str(entry.line_number) if entry.line_number else ''} {entry.text}".strip()
        for entry in errors[:10]
    ]
    more = f"\n... and {len(errors) - 10} more" if len(errors) > 10 else ""
    return "The build failed; nothing was deployed:\n  " + "\n  ".join(lines or ["(no error entries in the log)"]) + more


# ============================================================================================================= usage


class AsyncUsage(_AsyncResource):
    """Usage analytics. Every method takes the same filters (see :class:`~maitento.UsageFilters`)."""

    async def summary(self, *, timeout: Timeout = None, **filters: Unpack[UsageFilters]) -> UsageSummary:
        return await self._one(UsageSummary, _get("/usage/summary", timeout, *usage_query(filters)))

    async def series(
        self,
        *,
        metric: Optional[str] = None,
        bucket: Optional[str] = None,
        group_by: Optional[str] = None,
        top: Optional[int] = None,
        timeout: Timeout = None,
        **filters: Unpack[UsageFilters],
    ) -> UsageSeries:
        pairs = [*usage_query(filters), ("metric", metric), ("bucket", bucket), ("groupBy", group_by), ("top", top)]
        return await self._one(UsageSeries, _get("/usage/series", timeout, *pairs))

    async def breakdown(
        self,
        *,
        group_by: Optional[str] = None,
        sort: Optional[str] = None,
        limit: Optional[int] = None,
        timeout: Timeout = None,
        **filters: Unpack[UsageFilters],
    ) -> UsageBreakdown:
        pairs = [("groupBy", group_by), ("sort", sort), ("limit", limit), *usage_query(filters)]
        return await self._one(UsageBreakdown, _get("/usage/breakdown", timeout, *pairs))

    async def runs(
        self, *, sort: Optional[str] = None, limit: Optional[int] = None, timeout: Timeout = None, **filters: Unpack[UsageFilters]
    ) -> UsageRunPage:
        pairs = [*usage_query(filters), ("sort", sort), ("limit", limit)]
        return await self._one(UsageRunPage, _get("/usage/runs", timeout, *pairs))


# ===================================================================================================== users & tenant


class AsyncUsers(_AsyncResource):
    """Users of the tenant."""

    async def self(self, *, timeout: Timeout = None) -> CurrentUserResponse:
        """The calling user, tenant and roles (``user.id`` is the id an API key string starts with)."""
        return await self._one(CurrentUserResponse, _get("/users/self", timeout))

    async def list(self, *, timeout: Timeout = None) -> List[User]:
        """Every user of the tenant. Tenant admins only."""
        return await self._many(User, _get("/users", timeout))

    async def update(
        self, id: str, *, is_admin: Optional[bool] = None, is_enabled: Optional[bool] = None, timeout: Timeout = None
    ) -> None:
        """Makes a user an admin or not, enabled or not. Tenant admins only."""
        body = _drop_none({"isAdmin": is_admin, "isEnabled": is_enabled})
        await self._void(RequestSpec("PUT", path("/users/by-id/{id}", id=id), json=body, idempotent=True, timeout=timeout))


class AsyncApiKeys(_AsyncResource):
    """The calling user's API keys. These calls need a JWT (``email``/``password`` or ``token``), not an API key."""

    async def list(self, *, timeout: Timeout = None) -> List[UserApiKey]:
        return await self._many(UserApiKey, _get("/users/self/api-keys", timeout))

    async def create(self, name: str, *, date_expires: Any = None, timeout: Timeout = None) -> UserApiCreateResponse:
        """Creates a key; the ``secret`` is shown only here. Authenticate with ``"<your user id>:<secret>"``
        (the user's id, not the key's ``id``)."""
        body = wire(build_model(UserApiKeyCreateRequest, None, _drop_none({"name": name, "date_expires": date_expires})))
        return await self._one(UserApiCreateResponse, RequestSpec("POST", "/users/self/api-keys", json=body, timeout=timeout))

    async def delete(self, id: str, *, timeout: Timeout = None) -> None:
        """Disables a key (by the key's id)."""
        await self._void(RequestSpec("DELETE", path("/users/self/api-keys/by-id/{id}", id=id), timeout=timeout))


class AsyncInvitations(_AsyncResource):
    """Invitations to the platform and to the tenant."""

    async def codes(self, *, timeout: Timeout = None) -> List[InvitationCode]:
        return await self._many(InvitationCode, _get("/invitations/codes", timeout))

    async def list(self, *, scope: Optional[str] = None, timeout: Timeout = None) -> List[Invite]:
        return await self._many(Invite, _get("/invitations/invites", timeout, ("scope", scope)))

    async def send(
        self, request: Union[SendInviteRequest, Body] = None, *, timeout: Timeout = None, **fields: Any
    ) -> SendInviteResponse:
        """Sends an invite (``invitation_code_id``, ``email_address``, ``invite_to_tenant``, ``grants_admin``)."""
        body = wire(build_model(SendInviteRequest, request, fields))
        return await self._one(SendInviteResponse, RequestSpec("POST", "/invitations/invites", json=body, timeout=timeout))

    async def cancel(self, id: str, *, timeout: Timeout = None) -> None:
        await self._void(RequestSpec("POST", path("/invitations/invites/by-id/{id}/cancel", id=id), timeout=timeout))

    async def resend_email(self, id: str, *, timeout: Timeout = None) -> InviteEmailResponse:
        url = path("/invitations/invites/by-id/{id}/resend-email", id=id)
        return await self._one(InviteEmailResponse, RequestSpec("POST", url, timeout=timeout))


class AsyncTenant(_AsyncResource):
    """The caller's tenant."""

    async def retention(self, *, timeout: Timeout = None) -> TenantRetention:
        """How long finished runs are kept."""
        return await self._one(TenantRetention, _get("/tenants/self/retention", timeout))

    async def set_retention(self, *, hours: Optional[int], timeout: Timeout = None) -> TenantRetention:
        """Sets how long finished runs are kept, in hours, up to the plan's `plan_max_hours` (`None` goes back to the
        platform default). Tenant admins only."""
        spec = RequestSpec("PUT", "/tenants/self/retention", json={"hours": hours}, idempotent=True, timeout=timeout)
        return await self._one(TenantRetention, spec)

    async def web_access(self, *, timeout: Timeout = None) -> WebAccessSettings:
        return await self._one(WebAccessSettings, _get("/tenants/self/web-access", timeout))

    async def set_web_access(
        self, *, default_web_download_partition_id: Optional[str], timeout: Timeout = None
    ) -> WebAccessSettings:
        """Sets the tenant's default web download partition (``None`` clears it). Tenant admins only."""
        spec = RequestSpec(
            "PUT",
            "/tenants/self/web-access",
            json={"defaultWebDownloadPartitionId": default_web_download_partition_id},
            idempotent=True,
            timeout=timeout,
        )
        return await self._one(WebAccessSettings, spec)

    async def model_access(self, *, timeout: Timeout = None) -> TenantModelAccess:
        """Whether the tenant has model keys, and whether runs may fall back to Maitento's own credentials."""
        return await self._one(TenantModelAccess, _get("/tenants/self/model-access", timeout))


class AsyncBilling(_AsyncResource):
    """The tenant's plan, balance and billing settings. Anyone in the tenant can read them; changing the settings needs
    ``Tenant.Admin``. Buying a plan or credit, and changing the plan, happen in the portal (through the payment
    provider's pages)."""

    async def standing(self, *, timeout: Timeout = None) -> BillingStanding:
        """Where the tenant stands: its plan and its state, its balance, whether it can start work, any plan change on
        its way, and this billing period's use of each allowance."""
        return await self._one(BillingStanding, _get("/billing/standing", timeout))

    async def plan(self, *, timeout: Timeout = None) -> EffectiveEntitlements:
        """What the plan includes and costs: allowances, lanes, limits, retention, priority and prices."""
        return await self._one(EffectiveEntitlements, _get("/billing/plan", timeout))

    async def balance(self, *, timeout: Timeout = None) -> TenantBalance:
        """The balance, and whether it can pay for more work."""
        return await self._one(TenantBalance, _get("/billing/balance", timeout))

    async def catalogue(self, *, timeout: Timeout = None) -> BillingCatalogue:
        """The plans on sale, cheapest first, with what each includes and costs (the tenant's own plan among them)."""
        return await self._one(BillingCatalogue, _get("/billing/catalogue", timeout))

    async def notices(self, *, limit: Optional[int] = None, timeout: Timeout = None) -> List[BillingNotice]:
        """The tenant's latest billing notices (what its ``Billing`` webhooks were sent), newest first."""
        return await self._many(BillingNotice, _get("/billing/notices", timeout, ("limit", limit)))

    async def auto_top_up(self, *, timeout: Timeout = None) -> AutoTopUpView:
        """The automatic top-up: whether it's on, when it buys credit and how much, and whether it stopped."""
        return await self._one(AutoTopUpView, _get("/billing/auto-top-up", timeout))

    async def set_auto_top_up(
        self, request: Union[AutoTopUpApiRequest, Body] = None, *, timeout: Timeout = None, **fields: Any
    ) -> AutoTopUpView:
        """Turns the automatic top-up on or off, or changes it (``enabled``, ``threshold_amount``, ``top_up_amount``).
        Saving it again restarts one that stopped. Tenant admins only."""
        body = wire(build_model(AutoTopUpApiRequest, request, fields))
        spec = RequestSpec("PUT", "/billing/auto-top-up", json=body, idempotent=True, timeout=timeout)
        return await self._one(AutoTopUpView, spec)

    async def alerts(self, *, timeout: Timeout = None) -> LowBalanceAlertSettings:
        """The low-balance and work-refused alerts the tenant's admins get."""
        return await self._one(LowBalanceAlertSettings, _get("/billing/alerts", timeout))

    async def set_alerts(
        self, request: Union[LowBalanceAlertSettings, Body] = None, *, timeout: Timeout = None, **fields: Any
    ) -> LowBalanceAlertSettings:
        """Replaces the alerts (``email_at_percent_of_last_top_up``, ``show_portal_banner``, ``email_when_work_refused``).
        Tenant admins only."""
        body = wire(build_model(LowBalanceAlertSettings, request, fields))
        spec = RequestSpec("PUT", "/billing/alerts", json=body, idempotent=True, timeout=timeout)
        return await self._one(LowBalanceAlertSettings, spec)

__all__ = [
    "AsyncAgents",
    "AsyncBilling",
    "AsyncApiKeys",
    "AsyncAppRuns",
    "AsyncApps",
    "AsyncAutomations",
    "AsyncBuilds",
    "AsyncCapsuleRuns",
    "AsyncCapsules",
    "AsyncConnectors",
    "AsyncCredentialStacks",
    "AsyncCredentials",
    "AsyncFiles",
    "AsyncInteractionRuns",
    "AsyncInteractions",
    "AsyncInvitations",
    "AsyncLooms",
    "AsyncModelKeys",
    "AsyncModels",
    "AsyncNamespaces",
    "AsyncPartitions",
    "AsyncPipelineRuns",
    "AsyncPipelines",
    "AsyncRuns",
    "AsyncSecrets",
    "AsyncTenant",
    "AsyncTools",
    "AsyncUsage",
    "AsyncUsers",
    "AsyncVfs",
    "AsyncVfsHandle",
    "AsyncWebhooks",
    "UsageFilters",
]
