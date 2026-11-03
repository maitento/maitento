// The official TypeScript / JavaScript SDK for Maitento. Docs: https://docs.maitento.com

export { Maitento, DEFAULT_BASE_URL, DEFAULT_MAX_RETRIES, DEFAULT_TIMEOUT_MS, type MaitentoOptions } from "./client.js";

export {
  MaitentoError,
  ApiError,
  ValidationError,
  AuthenticationError,
  PermissionError,
  NotFoundError,
  ConflictError,
  RequestTooLargeError,
  FileIngestionError,
  RateLimitError,
  ProcessFailedError,
  CapsuleCommandAbortedError,
  BuildFailedError,
  ConnectionError,
  TimeoutError,
  AbortError,
  type ApiErrorInit,
  type ValidationFailure,
} from "./core/errors.js";

export type { ApiKeyCredential } from "./core/auth.js";
export type { FileContent, QueryValue, RequestOptions } from "./core/http.js";
export { Page, PagePromise } from "./core/paging.js";
export { SDK_VERSION } from "./core/env.js";

// Models: the SDK's view of the wire models (dates as `Date`, durations in milliseconds), and the enums.
export * from "./models.js";
export * from "./generated/enums.js";
export {
  isDotNetTimeSpan,
  parseDotNetDateTime,
  parseDotNetTimeSpan,
  toDotNetTimeSpan,
  type DotNetTimeSpan,
} from "./generated/runtime.js";
/** The raw wire models (dates and durations as the strings the server sends), for code that handles raw JSON. */
export * as wire from "./generated/index.js";

export {
  EventStream,
  PING_INTERVAL_MS,
  reconnectDelay,
  type ConnectionEventName,
  type EventFilter,
  type EventFrame,
  type EventScope,
  type WebSocketFactory,
  type WebSocketImplementation,
  type WebSocketLike,
} from "./events.js";
export type { Events } from "./events.js";

export { isTerminalStatus, type RunOptions } from "./run.js";
export { isFinalCommandStatus, type CommandWaitOptions } from "./command.js";
export { transcript, type TranscriptEntry, type TranscriptKind } from "./transcript.js";
export {
  WEBHOOK_DEFAULT_TOLERANCE_SECONDS,
  WEBHOOK_HEADERS,
  constantTimeEqual,
  parseWebhook,
  signWebhook,
  verifyWebhook,
  type HeadersLike,
  type ParsedWebhook,
  type VerifyWebhookOptions,
  type WebhookBody,
} from "./webhooks.js";

export {
  PROJECT_EXTENSIONS,
  ProjectError,
  buildRequestFromProject,
  type ProjectFiles,
} from "./deploy/project.js";

// Request and option types of the resource groups.
export type {
  DefinitionTarget,
  Inputs,
  ListOptions,
  NamespaceOptions,
  RunTarget,
} from "./resources/shared.js";
export type { AppStart } from "./resources/apps.js";
export type { MessageTriggerInput, ScheduleInput } from "./resources/automations.js";
export type { BuildListQuery, BuildOptions, DeployOptions, ProjectSource } from "./resources/builds.js";
export type { OpenApiConnectorCreate } from "./resources/connectors.js";
export type {
  CredentialCreateRequest,
  CredentialFinishSignInRequest,
  CredentialListQuery,
  CredentialSignInTokens,
  CredentialStackCreateRequest,
  CredentialStackEntryRequest,
  CredentialStackUpdateRequest,
  CredentialUpdateRequest,
} from "./resources/credentials.js";
export type { FileInput, UploadOptions } from "./resources/files.js";
export type { InteractionStartRequest, MessageAuthor } from "./resources/interactions.js";
export type { ThreadListQuery } from "./resources/looms.js";
export type { ModelKeyCreateRequest, ModelKeyUpdateRequest } from "./resources/models.js";
export type { PipelineStart } from "./resources/pipelines.js";
export type { RunListQuery } from "./resources/runs.js";
export type { WebhookCreateRequest } from "./resources/secrets.js";
export type { UsageBreakdownQuery, UsageFilter, UsageRunsQuery, UsageSeriesQuery } from "./resources/usage.js";
export type { VfsHandle } from "./resources/vfs.js";
