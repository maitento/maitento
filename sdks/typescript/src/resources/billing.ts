import type {
  AutoTopUpApiRequest,
  AutoTopUpView,
  BillingCatalogue,
  BillingNotice,
  BillingStanding,
  EffectiveEntitlements,
  LowBalanceAlertSettings,
  TenantBalance,
} from "../models.js";
import { Resource, type RequestOptions } from "./shared.js";

/**
 * The tenant's plan, balance and billing settings. Anyone in the tenant can read them; changing the settings needs
 * `Tenant.Admin`. Buying a plan or credit, and changing the plan, happen in the portal (they go through the payment
 * provider's pages).
 */
export class Billing extends Resource {
  /**
   * Where the tenant stands: its plan and its state, its balance, whether it can start work (out of credit, or an
   * allowance used up), any plan change on its way, and this billing period's use of each allowance.
   */
  async standing(options?: RequestOptions): Promise<BillingStanding> {
    return this.request({ method: "GET", path: "/billing/standing", response: "BillingStanding", options });
  }

  /** What the plan includes and costs: allowances, lanes, limits, retention, priority and prices. */
  async plan(options?: RequestOptions): Promise<EffectiveEntitlements> {
    return this.request({ method: "GET", path: "/billing/plan", response: "EffectiveEntitlements", options });
  }

  /** The balance, and whether it can pay for more work. */
  async balance(options?: RequestOptions): Promise<TenantBalance> {
    return this.request({ method: "GET", path: "/billing/balance", response: "TenantBalance", options });
  }

  /** The plans on sale, cheapest first, with what each includes and costs (the tenant's own plan among them). */
  async catalogue(options?: RequestOptions): Promise<BillingCatalogue> {
    return this.request({ method: "GET", path: "/billing/catalogue", response: "BillingCatalogue", options });
  }

  /** The tenant's latest billing notices (what its `Billing` webhooks were sent), newest first. */
  async notices(query?: { limit?: number }, options?: RequestOptions): Promise<BillingNotice[]> {
    return this.request({ method: "GET", path: "/billing/notices", query: { limit: query?.limit }, response: "BillingNotice[]", options });
  }

  /** The automatic top-up: whether it's on, when it buys credit and how much, and whether it stopped. */
  async autoTopUp(options?: RequestOptions): Promise<AutoTopUpView> {
    return this.request({ method: "GET", path: "/billing/auto-top-up", response: "AutoTopUpView", options });
  }

  /** Turns the automatic top-up on or off, or changes it (`Tenant.Admin`). Saving it again restarts one that stopped. */
  async setAutoTopUp(settings: AutoTopUpApiRequest, options?: RequestOptions): Promise<AutoTopUpView> {
    return this.request({
      method: "PUT",
      path: "/billing/auto-top-up",
      body: settings,
      bodyType: "AutoTopUpApiRequest",
      response: "AutoTopUpView",
      idempotent: true,
      options,
    });
  }

  /** The low-balance and work-refused alerts the tenant's admins get. */
  async alerts(options?: RequestOptions): Promise<LowBalanceAlertSettings> {
    return this.request({ method: "GET", path: "/billing/alerts", response: "LowBalanceAlertSettings", options });
  }

  /** Replaces the alerts (`Tenant.Admin`). */
  async setAlerts(settings: LowBalanceAlertSettings, options?: RequestOptions): Promise<LowBalanceAlertSettings> {
    return this.request({
      method: "PUT",
      path: "/billing/alerts",
      body: settings,
      bodyType: "LowBalanceAlertSettings",
      response: "LowBalanceAlertSettings",
      idempotent: true,
      options,
    });
  }
}
