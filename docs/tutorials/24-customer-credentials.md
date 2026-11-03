---
title: 24. Your customers' keys
description: Run each customer's work on that customer's own model provider key, with a credential stack per customer.
sidebar:
  order: 24
---

# 24. Your customers' keys

Your product serves several customers, and one of them, Acme, wants its own DeepSeek account to pay for its work.
So far every run used your tenant's keys. Here you add Acme's key as a **credential**, put it in a **credential
stack** of Acme's own, and start Acme's runs on that stack. Nothing else in your tenant changes.

> **You'll learn**
>
> - how to add a provider key as a credential, tagged with the customer it belongs to
> - how to put credentials in a stack, and start a run on it
> - how to read which stack a run used, and why
>
> **New concepts:** [credentials](../concepts/credentials.md#add-a-credential) ·
> [credential stacks](../concepts/credentials.md#which-stack-a-run-uses)
>
> **Builds on:** [2. Prompts and inputs](02-prompts-and-inputs.md)
>
> **Time:** ~10 min · **Cost:** under $0.01 on DeepSeek · **Needs:** a second DeepSeek key to stand in for the
> customer's (your own works), in `CUSTOMER_DEEPSEEK_API_KEY`; a tenant admin's API key, because only admins add
> credentials

## 1. The interaction

A one-shot interaction that summarises the text a customer sends:

<!-- snippet: examples/24-customer-credentials/maitento/interactions/one-shot/summarise.mtr -->
```hcl title="maitento/interactions/one-shot/summarise.mtr"
// One customer's request: summarise the text they sent.
agent = {
  name = "Summariser"
  agent = @ref("summariser")
}
task = "Summarise this: %%text%%"
inputs.prompts = [
  {
    name = "text"
    description = "The text to summarise"
    required = true
  }
]
```
<!-- /snippet -->

<!-- snippet: examples/24-customer-credentials/maitento/agents/summariser.mtr -->
```hcl title="maitento/agents/summariser.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You summarise text in one short sentence. Reply with the sentence only."
summary = "Summarises text in one sentence"
```
<!-- /snippet -->

Nothing in it says whose key pays. That's decided when a run starts.

## 2. Add the customer's key, then a stack for the customer

The script below does it all. First the parts that set the customer up:

- **The credential** holds Acme's key. It's tagged `acme`, so everything made for Acme can be found, and removed, by
  that tag. Maitento never shows the key again, only its last four characters.
- **The stack** `customer-acme` lists the credentials Acme's runs may use, in order. Here there's just the one.

The script starts by removing what an earlier run of it made, so you can run it as often as you like.

## 3. Start a run on the customer's stack

`credentialStack` in the start request names the stack. The run's model calls use only its credentials, and never your
tenant's keys or Maitento's:

<!-- tabs -->
<!-- snippet: examples/24-customer-credentials/typescript/customer.ts -->
```ts title="TypeScript"
import { Maitento } from "@maitento/sdk";

const mt = new Maitento();
await mt.deploy("../maitento");

// One customer, Acme, brings its own DeepSeek key. Everything made for it carries its tag.
const customer = "acme";
const key = process.env.CUSTOMER_DEEPSEEK_API_KEY;
if (!key) throw new Error("Set CUSTOMER_DEEPSEEK_API_KEY to the customer's DeepSeek key.");

// Start from nothing: remove what an earlier run of this script made.
for (const old of await mt.credentialStacks.list())
  if (old.name === `customer-${customer}`) await mt.credentialStacks.delete(old.id);
await mt.credentials.deleteByTag(customer);

// The customer's key, as a credential tagged with the customer.
const credential = await mt.credentials.create({
  name: `${customer} DeepSeek`,
  provider: "DeepSeek",
  keys: [{ value: key }],
  tag: customer,
});
console.log(`Credential "${credential.name}", key ending ${credential.keys[0].keyHint}`);

// A stack for the customer, holding just that credential.
const stack = await mt.credentialStacks.create({
  name: `customer-${customer}`,
  entries: [{ credentialId: credential.id }],
});

// The customer's run, on the customer's stack.
const run = await mt.interactions.run("summarise", {
  inputs: { text: "Our order arrived two days late and one box was damaged, but support sent a replacement at once." },
  credentialStack: stack.name,
});
console.log(run.output);
console.log(`Ran on stack "${run.credentialStack?.stackName}", chosen at the ${run.credentialStack?.source}`);
```
<!-- /snippet -->
<!-- snippet: examples/24-customer-credentials/python/customer.py -->
```python title="Python"
import os

from maitento import Maitento

mt = Maitento()
mt.deploy("../maitento")

# One customer, Acme, brings its own DeepSeek key. Everything made for it carries its tag.
customer = "acme"
key = os.environ.get("CUSTOMER_DEEPSEEK_API_KEY")
if not key:
    raise SystemExit("Set CUSTOMER_DEEPSEEK_API_KEY to the customer's DeepSeek key.")

# Start from nothing: remove what an earlier run of this script made.
for old in mt.credential_stacks.list():
    if old.name == f"customer-{customer}":
        mt.credential_stacks.delete(old.id)
mt.credentials.delete_by_tag(customer)

# The customer's key, as a credential tagged with the customer.
credential = mt.credentials.create(
    name=f"{customer} DeepSeek",
    provider="DeepSeek",
    keys=[{"value": key}],
    tag=customer,
)
print(f'Credential "{credential.name}", key ending {credential.keys[0].key_hint}')

# A stack for the customer, holding just that credential.
stack = mt.credential_stacks.create(name=f"customer-{customer}", entries=[{"credential_id": credential.id}])

# The customer's run, on the customer's stack.
run = mt.interactions.run(
    "summarise",
    inputs={"text": "Our order arrived two days late and one box was damaged, but support sent a replacement at once."},
    credential_stack=stack.name,
)
print(run.output)
if run.credential_stack:
    print(f'Ran on stack "{run.credential_stack.stack_name}", chosen at the {run.credential_stack.source}')
```
<!-- /snippet -->
<!-- snippet: examples/24-customer-credentials/csharp/customer.cs -->
```csharp title="C#"
#:package Maitento.Sdk@26.10.0

using Maitento.Entities.Credentials;
using Maitento.Entities.Database;
using Maitento.Entities.Interactions;
using Maitento.Entities.ModelKeys;
using Maitento.Sdk;

await using var mt = MaitentoClient.CreateFromEnvironment();
await mt.DeployAsync("../maitento");

// One customer, Acme, brings its own DeepSeek key. Everything made for it carries its tag.
const string customer = "acme";
var key = Environment.GetEnvironmentVariable("CUSTOMER_DEEPSEEK_API_KEY")
    ?? throw new InvalidOperationException("Set CUSTOMER_DEEPSEEK_API_KEY to the customer's DeepSeek key.");

// Start from nothing: remove what an earlier run of this script made.
foreach (var old in await mt.CredentialStacks.ListAsync())
    if (old.Name == $"customer-{customer}")
        await mt.CredentialStacks.DeleteAsync(old.Id);
await mt.Credentials.DeleteByTagAsync(customer);

// The customer's key, as a credential tagged with the customer.
var credential = await mt.Credentials.CreateAsync(new ModelCredentialRequest
{
    Name = $"{customer} DeepSeek",
    Provider = ModelKeyProvider.DeepSeek,
    Keys = [new ModelCredentialKeyRequest { Value = key }],
    Tag = customer,
});
Console.WriteLine($"Credential \"{credential.Name}\", key ending {credential.Keys[0].KeyHint}");

// A stack for the customer, holding just that credential.
var stack = await mt.CredentialStacks.CreateAsync(new CredentialStackRequest
{
    Name = $"customer-{customer}",
    Entries = [new CredentialStackEntry { CredentialId = credential.Id }],
});

// The customer's run, on the customer's stack.
var run = await mt.Interactions.RunAsync("summarise", new InteractionProcessStartRequest
{
    Inputs = [new NameValuePair("text", "Our order arrived two days late and one box was damaged, but support sent a replacement at once.")],
    CredentialStack = stack.Name,
});
Console.WriteLine(run.Output);
Console.WriteLine($"Ran on stack \"{run.CredentialStack?.StackName}\", chosen at the {run.CredentialStack?.Source}");
```
<!-- /snippet -->
<!-- /tabs -->

Run it from the language's folder in [`examples/24-customer-credentials`](../../examples/24-customer-credentials/),
with the customer's key in `CUSTOMER_DEEPSEEK_API_KEY`:

```text
Credential "acme DeepSeek", key ending da26
The order arrived two days late with one damaged box, though support promptly sent a replacement.
Ran on stack "customer-acme", chosen at the Start
```

> **Done when** the last line names `customer-acme`, chosen at the `Start`.

Every run keeps the stack it used in its `credentialStack`: the stack's name and version, its entries, and
`source`, where the choice came from. A stack named at the start beats every other, so `source` is `Start`.

## All the files

<!-- project: examples/24-customer-credentials -->
**On GitHub:** [`examples/24-customer-credentials`](https://github.com/maitento/maitento/tree/main/examples/24-customer-credentials) · [TypeScript](https://github.com/maitento/maitento/tree/main/examples/24-customer-credentials/typescript) · [Python](https://github.com/maitento/maitento/tree/main/examples/24-customer-credentials/python) · [C#](https://github.com/maitento/maitento/tree/main/examples/24-customer-credentials/csharp)

<details>
<summary>All the files in this project (2)</summary>

<!-- tabs: files -->
**`maitento/agents/summariser.mtr`**
```hcl title="maitento/agents/summariser.mtr"
model = @ref("deepseek.deepseek-v4-flash")
prompt = "You summarise text in one short sentence. Reply with the sentence only."
summary = "Summarises text in one sentence"
```

**`maitento/interactions/one-shot/summarise.mtr`**
```hcl title="maitento/interactions/one-shot/summarise.mtr"
// One customer's request: summarise the text they sent.
agent = {
  name = "Summariser"
  agent = @ref("summariser")
}
task = "Summarise this: %%text%%"
inputs.prompts = [
  {
    name = "text"
    description = "The text to summarise"
    required = true
  }
]
```
<!-- /tabs -->

</details>

<!-- /project -->

## Break it on purpose

Start the run on a stack that doesn't exist, `customer-nobody`. Maitento refuses the run before it starts, so nothing
runs on a key you didn't mean:

```text title="TypeScript"
ValidationError: PUT /namespaces/tutorials/interactions/by-name/summarise/start failed with 400 (api:credential-stacks:unknown): Credential stack 'customer-nobody', named by the start, doesn't exist in this tenant. [api:credential-stacks:unknown]
```

A run never quietly falls back to another stack when the one it names is missing.

## If it didn't work

- **`api:credentials:limit-reached`** or **`api:credential-stacks:limit-reached`**: your plan's limit on credentials or
  stacks is reached. Delete one you don't need, or run the script on a tenant with room for one more of each.
- **`api:credentials:name-in-use`**: a credential called `acme DeepSeek` already exists without the `acme` tag, so the
  clean-up didn't remove it. Delete it, or change the name in the script.
- **`api:credentials:no-usable-credential`** in the run's failure details: the stack has no credential for the model's
  provider. The agent uses a DeepSeek model, so the credential's `provider` must be `DeepSeek`.
- **`api:credentials:all-failed`**: DeepSeek refused the key. Check `CUSTOMER_DEEPSEEK_API_KEY`, or test the
  credential: `mt credential-test "acme DeepSeek"`.
- **A 403**: adding credentials needs a tenant admin's API key.
- **`No namespace`**, **`Project folder not found: ../maitento`**: see [tutorial 1](01-hello-agent.md#if-it-didnt-work).

## Review

You built:

- a credential holding a customer's own provider key, tagged with the customer;
- a credential stack for that customer;
- a run on the customer's stack, and a check of which stack it used.

The concepts:

- [Credentials](../concepts/credentials.md#add-a-credential): your access to one provider. Its keys are write-only.
- [Credential stacks](../concepts/credentials.md#which-stack-a-run-uses): the ordered credentials a run may use. A
  run on a stack never uses Maitento's own keys.
- [Which stack a run uses](../concepts/credentials.md#which-stack-a-run-uses): the start's, then the parent run's,
  then the definition's, then the namespace's default, then the tenant's.

## Challenge

Give the interaction a stack of its own: add `credentialStack = "customer-acme"` to `summarise.mtr`, deploy, and
start a run **without** naming a stack. The run should still use Acme's stack, with `source` now `Definition`.

The answer is in [`examples/24-customer-credentials/solution`](../../examples/24-customer-credentials/solution/).
