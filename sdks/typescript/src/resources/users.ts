import { seg } from "../core/http.js";
import type {
  CurrentUserResponse,
  InvitationCode,
  Invite,
  InviteEmailResponse,
  SendInviteRequest,
  SendInviteResponse,
  User,
  UserApiCreateResponse,
  UserApiKey,
  UserApiKeyCreateRequest,
  UserUpdateRequest,
} from "../models.js";
import { Resource, type RequestOptions } from "./shared.js";

/** Users of the tenant. */
export class Users extends Resource {
  /**
   * The caller: user, tenant and roles. `user.id` is the user id an API key is written with (`"<userId>:<secret>"`).
   */
  async self(options?: RequestOptions): Promise<CurrentUserResponse> {
    return this.request({ method: "GET", path: "/users/self", response: "CurrentUserResponse", options });
  }

  /** Every user of the tenant (Tenant.Admin). */
  async list(options?: RequestOptions): Promise<User[]> {
    return this.request({ method: "GET", path: "/users", response: "User[]", options });
  }

  /** Grants or removes admin, enables or disables a user (Tenant.Admin). */
  async update(id: string, request: UserUpdateRequest, options?: RequestOptions): Promise<void> {
    return this.request({
      method: "PUT",
      path: `/users/by-id/${seg(id)}`,
      body: request,
      bodyType: "UserUpdateRequest",
      response: "void",
      idempotent: true,
      options,
    });
  }
}

/**
 * The caller's own API keys. These routes accept only a JWT (`token` or `email`/`password`), never an API key.
 */
export class ApiKeys extends Resource {
  /** The caller's API keys (never their secrets). */
  async list(options?: RequestOptions): Promise<UserApiKey[]> {
    return this.request({ method: "GET", path: "/users/self/api-keys", response: "UserApiKey[]", options });
  }

  /**
   * Creates an API key. The secret is in the response and never shown again. NOTE: `id` in the response is the KEY's
   * id; authenticate with your USER id (`users.self()`): `"<userId>:<secret>"`.
   */
  async create(request: UserApiKeyCreateRequest, options?: RequestOptions): Promise<UserApiCreateResponse> {
    return this.request({
      method: "POST",
      path: "/users/self/api-keys",
      body: request,
      bodyType: "UserApiKeyCreateRequest",
      response: "UserApiCreateResponse",
      options,
    });
  }

  /** Disables an API key. */
  async delete(id: string, options?: RequestOptions): Promise<void> {
    return this.request({ method: "DELETE", path: `/users/self/api-keys/by-id/${seg(id)}`, response: "void", options });
  }
}

/** Invitations to the tenant. */
export class Invitations extends Resource {
  /** The invitation codes the caller may invite with. */
  async codes(options?: RequestOptions): Promise<InvitationCode[]> {
    return this.request({ method: "GET", path: "/invitations/codes", response: "InvitationCode[]", options });
  }

  /** Invites sent, optionally narrowed by `scope`. */
  async list(query?: { scope?: string }, options?: RequestOptions): Promise<Invite[]> {
    return this.request({
      method: "GET",
      path: "/invitations/invites",
      query: { scope: query?.scope },
      response: "Invite[]",
      options,
    });
  }

  /** Sends an invite. */
  async send(request: SendInviteRequest, options?: RequestOptions): Promise<SendInviteResponse> {
    return this.request({
      method: "POST",
      path: "/invitations/invites",
      body: request,
      bodyType: "SendInviteRequest",
      response: "SendInviteResponse",
      options,
    });
  }

  /** Cancels a pending invite. */
  async cancel(id: string, options?: RequestOptions): Promise<void> {
    return this.request({
      method: "POST",
      path: `/invitations/invites/by-id/${seg(id)}/cancel`,
      response: "void",
      idempotent: true,
      options,
    });
  }

  /** Sends the invite e-mail again. */
  async resendEmail(id: string, options?: RequestOptions): Promise<InviteEmailResponse> {
    return this.request({
      method: "POST",
      path: `/invitations/invites/by-id/${seg(id)}/resend-email`,
      response: "InviteEmailResponse",
      options,
    });
  }
}
