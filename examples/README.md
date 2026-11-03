# Maitento examples

The code for the [tutorials](../docs/tutorials/index.md). Each `NN-name` folder is one tutorial, and each
`cogniscript-NN-name` folder is one lesson of the [Learn Cogniscript](../docs/tutorials/cogniscript/index.md) track.
Inside each one:

| Folder | What it holds |
|---|---|
| `maitento/` | the resource project: agents, interactions, apps, tools and the rest. The scripts deploy it with `deploy("../maitento")`. |
| `typescript/` | the tutorial's scripts in TypeScript |
| `python/` | the same scripts in Python |
| `csharp/` | the same scripts in C#, each a single `.cs` file that `dotnet run` runs directly. Tutorials 9 and 11 also have a small ASP.NET project there: the server Maitento calls. Tutorial 23's server is a single file too. |
| `solution/` | where a tutorial ends with a challenge: one way to solve it, in each language. Run it from that folder, like the other scripts. |

A few tutorials also have the files they work on: `knowledge/`, `data/` or `sample-repo/`. Tutorial 23, the support
desk, also has `web/`: the page its TypeScript, Python and C# servers all serve, and the API they share.
[`00-connect`](00-connect/) is the API key check from [Get started](../docs/get-started/2-api-key.md).

## Before you run them

- `MAITENTO_API_KEY` set to your API key, `"<user id>:<secret>"`, as the portal shows it.
- `MAITENTO_NAMESPACE` set to the namespace to deploy into. The tutorials use `tutorials`.
- A DeepSeek [model key](../docs/concepts/models-and-keys.md): the tutorial agents use `deepseek-v4-flash`. Learn
  Cogniscript's lessons 1 to 5 need none: their apps make no AI calls.
- Node.js 22.18 or later for TypeScript (it runs `.ts` files directly), Python 3.10 or later for Python, and the
  .NET 10 SDK for C# (it runs `.cs` files directly; the `#:package` line at the top of each one fetches
  `Maitento.Sdk`).

Run each script from its own folder, because the paths in it are relative to that folder:

```bash
cd examples/01-hello-agent/typescript
npm install
node hello.ts
```

```bash
cd examples/01-hello-agent/python
pip install -r requirements.txt
python hello.py
```

```bash
cd examples/01-hello-agent/csharp
dotnet run hello.cs
```

Some tutorials need a little more, such as a server Maitento can reach or a git repository. The tutorial's page says
what.
