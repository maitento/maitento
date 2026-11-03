# Notes for AI coding agents

This project's AI features are built on **Maitento**, an AI operating system. Agents, the interactions that put them
to work, the tools they call, apps and code pipelines are described in small text files in the `maitento/` folder,
deployed to a Maitento namespace, and started as runs from the code here.

`.mtr` files and Cogniscript (`.mtc`) are Maitento's own formats. Don't write them from memory of other languages:
read the **maitento skill** first. It is in `.claude/skills/maitento/` or `.agents/skills/maitento/` in this
repository (start with `SKILL.md`), and published at https://github.com/maitento/maitento. The docs are at
https://docs.maitento.com, and https://docs.maitento.com/llms.txt indexes them for agents.

## The project folder

```text
maitento/
├── agents/                        agents (.mtr)
├── interactions/one-shot/         interactions: also round-robin/ and managed/
├── connectors/open-api/           HTTP endpoints that tools call
├── external-operations/open-api/  tools agents can call
├── apps/<name>/                   apps, in Cogniscript (*.mtc)
├── code-pipelines/<name>/         code pipelines (pipeline-definition.json)
├── prompts/                       long text, included with @prompt("name")
└── json/                          JSON Schemas, included with @json("name")
```

A definition's name is its file name: `agents/support.mtr` is the agent `support`.

## Checking and deploying

```bash
node .claude/skills/maitento/scripts/check-mtr.cjs ./maitento   # offline check of the .mtr files; no key needed
mt build ./maitento                                              # validate with Maitento; saves nothing
mt deploy ./maitento                                             # save everything, or nothing if any file has an error
```

`mt` and the SDKs read `MAITENTO_API_KEY` (`<user id>:<secret>`), `MAITENTO_NAMESPACE` and, optionally,
`MAITENTO_BASE_URL` from the environment.

## Rules

- Check every changed `.mtr` file, and validate before you deploy.
- Never put an API key, a model key or any other secret in a file. Tools send Maitento secrets, created with
  `mt secret-create`; CI reads the API key from its secret store.
- A deploy never deletes: removing a file leaves the definition in place.
- Secrets, file systems and knowledge bases aren't deployed: create them before deploying anything that names them.
- Running an agent calls a model on the account's own key, so it costs money. Say so before you start runs.
