---
title: Secrets
description: Store API tokens and passwords once, and refer to them by name instead of putting them in files.
sidebar:
  order: 7
---

# Secrets

A **secret** is a named value, such as an API token or a password, stored in your tenant. Definitions refer to it by
name, so the value never appears in your project files.

See it in [tutorial 9, Call your code](../tutorials/09-call-your-code.md): a tool sends your server's key from a
secret, a changed key takes effect without a redeploy, and each run chooses which shop's secret to send.

## Create one

<!-- tabs -->
```ts
await mt.secrets.create({ name: "orders-api-key", value: process.env.ORDERS_API_KEY! });
```
```python
mt.secrets.create(name="orders-api-key", value=os.environ["ORDERS_API_KEY"])
```
```csharp
await mt.Secrets.CreateAsync("orders-api-key", Environment.GetEnvironmentVariable("ORDERS_API_KEY")!);
```
```bash
mt secret-create orders-api-key --value "$ORDERS_API_KEY"
```
```bash title="curl"
curl -X POST https://api.maitento.com/secrets \
  -H "Authorization: $MAITENTO_AUTH" -H "Content-Type: application/json" \
  -d '{"name": "orders-api-key", "value": "..."}'
```
<!-- /tabs -->

Create secrets **before** you deploy anything that refers to them: a deploy checks that every secret it names exists,
and fails if one doesn't:

```text
Unable to resolve resource reference for secret 'orders-api-key'
```

## Use one

In a **tool**, to authenticate calls to your API:

<!-- snippet: examples/09-call-your-code/maitento/external-operations/open-api/get-order.mtr -->
```hcl title="external-operations/open-api/get-order.mtr"
connector = @ref("orders-get")
// Maitento sends the secret's value in this header. Your server checks it.
auth = {
  header = "X-Api-Key"
  secret = @ref("orders-api-key")
}
guidance = "Looks up an order: its items, total, status and how much has already been refunded."
```
<!-- /snippet -->

**A new value needs no redeploy.** A tool names the secret, not its value, and Maitento reads the value at each call.
Set a new value (`secrets.update`, `mt secret-update`, or the portal) and the next call sends it.

**Each run can choose the secret.** When the key depends on the run, such as one per shop or per customer, the
interaction declares an `inputs.functions.auth` input and each run passes the **id** of the secret to send, which
replaces the tool's own for that run. A secret's name is refused when the run starts. See
[secrets chosen by the run](tools.md#secrets-chosen-by-the-run).

In a **[capsule](capsules.md)**, where it is written to a file at `/mnt/secrets/<mountName>`.

## Good to know

- **Secrets belong to the whole tenant**, not to a namespace, so names must be unique across your tenant.
- **Anyone in the tenant can use a secret** in their own definitions. Keep separate tenants for work that must not
  share credentials.
- **Secrets are write-only.** Once a value is saved, nothing reads it back: not the portal, the API, the SDKs, the
  `mt` CLI or an app. Listings and responses leave it out. To change one, set a new value; to check which secret a
  definition uses, look at its name. Only Maitento itself reads the value, to send it where a tool or capsule needs it.
- **A secret only goes where you pointed it.** A tool's secret is sent only to its connector's own address, and a
  webhook's secret only to the webhook's address. Maitento never forwards either to another host that a redirect
  points at, and only ever sends them to addresses on the public internet (see [tools](tools.md#good-to-know) and
  [webhooks](runs-and-events.md#3-get-called-back-webhooks)).
