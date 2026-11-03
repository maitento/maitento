---
title: Models and model keys
description: Which models your agents can use, and how Maitento pays the model provider with your own key.
sidebar:
  order: 2
---

# Models and model keys

Maitento doesn't have models of its own. It calls models from providers such as OpenAI, Anthropic and DeepSeek, on
**your account with that provider**. You add your provider key to Maitento once, as a **model key**, and every run
uses it.

To choose which account serves which runs, such as each of your customers on their own key, use
[credentials and credential stacks](credentials.md). A run on a credential stack uses that stack's credentials only,
not your model keys.

[Get started](../get-started/3-model-key.md) adds a DeepSeek key, and every tutorial from
[tutorial 1](../tutorials/01-hello-agent.md) on runs its agents on it.

## Pick a model

Each agent names one model from Maitento's **model catalogue**:

```hcl
model = @ref("deepseek.deepseek-v4-flash")
```

The catalogue lists names like `openAi.gpt-5.4-mini`, `anthropic.sonnet-5` and `deepseek.deepseek-v4-flash`. List
what your tenant can use, because the catalogue grows:

<!-- tabs -->
```ts
const models = await mt.models.list();
```
```python
models = mt.models.list()
```
```csharp
var models = await mt.AiModels.GetAllAsync();
```
```bash
mt aimodel-list
```
```bash title="curl"
curl https://api.maitento.com/ai-models \
  -H "Authorization: $MAITENTO_AUTH"
```
<!-- /tabs -->

## Add a model key

Add a key for each provider your agents use. In the portal go to **Settings → Model keys → Add key**, or call the
API:

<!-- tabs -->
```ts
await mt.modelKeys.create({ provider: "DeepSeek", label: "Production", apiKey: process.env.DEEPSEEK_API_KEY! });
```
```python
mt.model_keys.create(provider="DeepSeek", label="Production", api_key=os.environ["DEEPSEEK_API_KEY"])
```
```csharp
await mt.ModelKeys.CreateAsync(ModelKeyProvider.DeepSeek, "Production", Environment.GetEnvironmentVariable("DEEPSEEK_API_KEY")!);
```
```bash title="curl"
curl -X POST https://api.maitento.com/tenants/self/model-keys \
  -H "Authorization: $MAITENTO_AUTH" \
  -H "Content-Type: application/json" \
  -d '{"provider": "DeepSeek", "label": "Production", "apiKey": "sk-..."}'
```
<!-- /tabs -->

| Provider | `provider` value | Models in the catalogue start with |
|---|---|---|
| OpenAI | `OpenAi` | `openAi.` |
| Anthropic | `Anthropic` | `anthropic.` |
| DeepSeek | `DeepSeek` | `deepseek.` |
| Google Gemini | `Gemini` | `gemini.` |
| Alibaba Qwen | `Qwen` | `qwen.` |
| Zhipu GLM | `Glm` | `glm.` |
| Moonshot Kimi | `Kimi` | `kimi.` |

Things to know about model keys:

- **Only tenant admins can add, change or remove them.** Everyone in the tenant can see the list. Nobody can read
  a key back after it is saved: Maitento shows only its last four characters.
- **You can add several keys for one provider.** Maitento tries them in `priority` order (lowest first) and moves to
  the next when a key is refused or out of quota.
- **Switch one off** without deleting it by setting `isDisabled`.
- **Everything uses them**: interactions, apps, automations, sub-interactions, memory, and the coding agents in code
  pipelines.
- **A key's own endpoint (`baseUrl`) must be public**: an `https` URL on the public internet. A loopback, private or
  internal address is refused when you add the key (`api:model-keys:base-url-not-allowed`), and a name that resolves
  to one is refused each time the key is used, so the call fails and Maitento moves to the next key.

## Embeddings need a different provider

[Knowledge bases](knowledge.md) and [memory](memory.md) turn text into vectors (*embeddings*). Not every provider
offers that: DeepSeek doesn't. If you use knowledge bases or memory, add an **OpenAI** key as well. Gemini or Qwen
also work for knowledge bases. [Tutorial 13](../tutorials/13-your-documents.md) needs one; for
[tutorial 20](../tutorials/20-memory.md) it is optional, because memory falls back to matching words without it.

## When there's no key

A run that needs a provider you have no key for fails straight away. Its failure details say so and end with the
code `[api:model-keys:none-for-provider]`:

```text
No model key is configured for provider 'DeepSeek'. Add one under Settings → Model keys
(or POST /tenants/self/model-keys). [api:model-keys:none-for-provider]
```

If every key for the provider was refused, the code is `[api:model-keys:all-failed]`. Check the key with the
provider and replace it.

Where your tenant allows it, a run can instead fall back to Maitento's own key, with `allowMaitentoFallback: true` in
its start request, and the failure text above suggests that too. A tenant that forbids Maitento's keys never falls
back.

## Passing a key with one run

You can also send provider keys with a single run, in the start request's `credentials`. They are tried before your
tenant's keys and are never stored. This is useful when your own customers bring their own keys. `provider` takes
the same values as a model key.

```json
{
  "inputs": [],
  "credentials": [
    { "provider": "DeepSeek", "apiKey": "sk-...", "credentialId": "customer-42", "isOwnLicense": true, "priority": 0 }
  ]
}
```
