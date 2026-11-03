import { seg } from "../core/http.js";
import type {
  AutomatedAction,
  CreateAutomatedActionRequest,
  CronSchedule,
  ExecutionHistoryEntry,
  MessageTrigger,
  TriggerResponse,
  UpdateAutomatedActionRequest,
} from "../models.js";
import { Definitions } from "./definitions.js";
import { splitNamespace, type NamespaceOptions, type RequestOptions } from "./shared.js";

/**
 * A cron schedule to add or replace. Every field has a server default (`id` a new id, each cron field `"*"`,
 * enabled), so give only what you need: `{ minute: "0", hour: "9" }` fires daily at 09:00 UTC.
 */
export type ScheduleInput = Partial<Omit<CronSchedule, "nextOccurrence">>;

/** A message trigger to add or replace: start the action when a run of this kind changes (optionally filtered). */
export type MessageTriggerInput = Partial<MessageTrigger> & Pick<MessageTrigger, "triggerType">;

/** Automations ("automated actions"): start runs on a schedule, on another run's change, or on demand. */
export class Automations extends Definitions<AutomatedAction> {
  protected readonly segment = "automated-actions";
  protected readonly itemType = "AutomatedAction";

  /** Creates an automation in the namespace. */
  async create(request: CreateAutomatedActionRequest, options?: NamespaceOptions): Promise<AutomatedAction> {
    const { namespace, rest } = splitNamespace(options);
    return this.request({
      method: "POST",
      path: this.namespacePath(namespace),
      body: request,
      bodyType: "CreateAutomatedActionRequest",
      response: "AutomatedAction",
      options: rest,
    });
  }

  /** Replaces an automation's name, description and actions. */
  async update(id: string, request: UpdateAutomatedActionRequest, options?: RequestOptions): Promise<AutomatedAction> {
    return this.request({
      method: "PUT",
      path: `/automated-actions/by-id/${seg(id)}`,
      body: request,
      bodyType: "UpdateAutomatedActionRequest",
      response: "AutomatedAction",
      idempotent: true,
      options,
    });
  }

  /**
   * Runs the automation now. Starts work, so it is never retried. Returns the first run started. Throws a
   * `ValidationError` with code `api:automations:start-failed` (then the cause's own codes) when nothing could start.
   */
  async trigger(id: string, options?: RequestOptions): Promise<TriggerResponse> {
    return this.request({
      method: "POST",
      path: `/automated-actions/by-id/${seg(id)}/trigger`,
      response: "TriggerResponse",
      idempotent: false,
      options,
    });
  }

  /** The automation's recent executions. */
  async history(id: string, query?: { limit?: number }, options?: RequestOptions): Promise<ExecutionHistoryEntry[]> {
    return this.request({
      method: "GET",
      path: `/automated-actions/by-id/${seg(id)}/history`,
      query: { limit: query?.limit },
      response: "ExecutionHistoryEntry[]",
      options,
    });
  }

  /** Adds a cron schedule. */
  async addSchedule(id: string, schedule: ScheduleInput, options?: RequestOptions): Promise<AutomatedAction> {
    return this.request({
      method: "POST",
      path: `/automated-actions/by-id/${seg(id)}/schedules`,
      body: schedule,
      bodyType: "CronSchedule",
      response: "AutomatedAction",
      options,
    });
  }

  /** Replaces a schedule. */
  async updateSchedule(id: string, scheduleId: string, schedule: ScheduleInput, options?: RequestOptions): Promise<AutomatedAction> {
    return this.request({
      method: "PUT",
      path: `/automated-actions/by-id/${seg(id)}/schedules/${seg(scheduleId)}`,
      body: schedule,
      bodyType: "CronSchedule",
      response: "AutomatedAction",
      idempotent: true,
      options,
    });
  }

  /** Removes a schedule. */
  async removeSchedule(id: string, scheduleId: string, options?: RequestOptions): Promise<AutomatedAction> {
    return this.request({
      method: "DELETE",
      path: `/automated-actions/by-id/${seg(id)}/schedules/${seg(scheduleId)}`,
      response: "AutomatedAction",
      options,
    });
  }

  /** Enables a schedule. */
  async enableSchedule(id: string, scheduleId: string, options?: RequestOptions): Promise<AutomatedAction> {
    return this.toggle(id, "schedules", scheduleId, "enable", options);
  }

  /** Disables a schedule. */
  async disableSchedule(id: string, scheduleId: string, options?: RequestOptions): Promise<AutomatedAction> {
    return this.toggle(id, "schedules", scheduleId, "disable", options);
  }

  /** Adds a message trigger. */
  async addMessageTrigger(id: string, trigger: MessageTriggerInput, options?: RequestOptions): Promise<AutomatedAction> {
    return this.request({
      method: "POST",
      path: `/automated-actions/by-id/${seg(id)}/message-triggers`,
      body: trigger,
      bodyType: "MessageTrigger",
      response: "AutomatedAction",
      options,
    });
  }

  /** Replaces a message trigger. */
  async updateMessageTrigger(
    id: string,
    triggerId: string,
    trigger: MessageTriggerInput,
    options?: RequestOptions,
  ): Promise<AutomatedAction> {
    return this.request({
      method: "PUT",
      path: `/automated-actions/by-id/${seg(id)}/message-triggers/${seg(triggerId)}`,
      body: trigger,
      bodyType: "MessageTrigger",
      response: "AutomatedAction",
      idempotent: true,
      options,
    });
  }

  /** Removes a message trigger. */
  async removeMessageTrigger(id: string, triggerId: string, options?: RequestOptions): Promise<AutomatedAction> {
    return this.request({
      method: "DELETE",
      path: `/automated-actions/by-id/${seg(id)}/message-triggers/${seg(triggerId)}`,
      response: "AutomatedAction",
      options,
    });
  }

  /** Enables a message trigger. */
  async enableMessageTrigger(id: string, triggerId: string, options?: RequestOptions): Promise<AutomatedAction> {
    return this.toggle(id, "message-triggers", triggerId, "enable", options);
  }

  /** Disables a message trigger. */
  async disableMessageTrigger(id: string, triggerId: string, options?: RequestOptions): Promise<AutomatedAction> {
    return this.toggle(id, "message-triggers", triggerId, "disable", options);
  }

  private toggle(
    id: string,
    kind: "schedules" | "message-triggers",
    itemId: string,
    action: "enable" | "disable",
    options: RequestOptions | undefined,
  ): Promise<AutomatedAction> {
    return this.request({
      method: "POST",
      path: `/automated-actions/by-id/${seg(id)}/${kind}/${seg(itemId)}/${action}`,
      response: "AutomatedAction",
      idempotent: true,
      options,
    });
  }
}
