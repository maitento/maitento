---
title: Build with an AI coding agent
description: Give Claude Code, Codex, Cursor, GitHub Copilot and other coding agents the Maitento skill, so they write and deploy Maitento projects correctly.
sidebar:
  order: 1
---

# Build with an AI coding agent

Coding agents such as Claude Code, Codex, Cursor and GitHub Copilot write TypeScript and Python well, but they have
never seen Maitento's [project files](../concepts/projects-and-deploys.md) (`.mtr`) or
[Cogniscript](../concepts/cogniscript.md), the language apps are written in. Ask one for a Maitento app without help
and it guesses at the syntax. The **Maitento skill** is the help: a folder of instructions and reference pages that
the agent reads when you ask it for Maitento work, so it writes files that validate and deploy.

## What the skill covers

- **How a project is laid out,** and the rules of `.mtr` files that catch people out (and agents even more).
- **Each kind of file:** [agents](../concepts/agents.md), [interactions](../concepts/interactions.md),
  [tools](../concepts/tools.md), [apps](../concepts/apps.md) in Cogniscript,
  [code pipelines](../concepts/code-pipelines.md), [knowledge](../concepts/knowledge.md) and
  [memory](../concepts/memory.md).
- **Validating and deploying** with the [`mt` command line](../reference/cli/index.md) or an SDK, and calling what
  you deployed from your code.
- **What the [error codes](../reference/errors.md) mean,** and what to change.
- **Where to look next:** it points the agent at these docs for anything it doesn't cover.

The skill is a folder with a `SKILL.md` and the pages it refers to, in the open
[Agent Skills](https://agentskills.io) format, so the same folder works in every agent below. Its source is
[`skills/maitento`](https://github.com/maitento/maitento/tree/main/skills/maitento) in the public repository.

## Install it

The portal shows these steps too, with copy buttons, under **Settings → API keys → Use with an AI coding agent**.

### Claude Code

The public repository is a Claude Code plugin marketplace. In Claude Code, run:

```text
/plugin marketplace add maitento/maitento
/plugin install maitento@maitento
```

Claude Code uses the skill whenever a request is about Maitento, and you can call it yourself as `/maitento:maitento`.
To get a newer version later, run `claude plugin marketplace update maitento` in your terminal.

### Codex, Cursor, GitHub Copilot, Gemini CLI and others

These agents look for skills in `~/.agents/skills`. Download
[maitento-skill.zip](https://docs.maitento.com/downloads/maitento-skill.zip) and unzip it there:

<!-- tabs -->
```bash title="macOS and Linux"
curl -fsSLo maitento-skill.zip https://docs.maitento.com/downloads/maitento-skill.zip
mkdir -p ~/.agents/skills && unzip -o maitento-skill.zip -d ~/.agents/skills
```
```powershell title="Windows"
Invoke-WebRequest https://docs.maitento.com/downloads/maitento-skill.zip -OutFile maitento-skill.zip
Expand-Archive maitento-skill.zip -DestinationPath "$HOME\.agents\skills" -Force
```
<!-- /tabs -->

You should end up with `~/.agents/skills/maitento/SKILL.md`. For one project only, unzip it into the project's own
`.agents/skills` folder instead. An agent that keeps its skills somewhere else (Claude Code without the plugin uses
`~/.claude/skills`) takes the same `maitento` folder there. Every GitHub Release of the SDKs has the zip attached too.

### claude.ai and the Claude apps

Upload `maitento-skill.zip` as a skill in claude.ai's settings. Claude then uses it in chats about Maitento, in the
browser and in the desktop and mobile apps.

### New projects: `mt init`

[`mt init`](../reference/cli/index.md#mt-init-and-mt-doctor) writes the skill into every project it creates, in both
`.claude/skills/maitento` and `.agents/skills/maitento`, with an `AGENTS.md` at the project's root. Open your coding
agent in the new folder and there's nothing else to install:

```bash
mt init my-app
```

It never writes over a file that's already there. Pass `--no-agent-files` to leave them out.

## AGENTS.md

Most coding agents read an `AGENTS.md` at the root of a repository before they start. The one `mt init` writes says
that this is a Maitento project, where its files are, and how to check and deploy them, and sends the agent to the
skill for the details. It's yours: add your own conventions to it, and commit it with the project.

## The docs, for agents

Every page of these docs has a Markdown copy, which reads better in an agent's context than a web page. The menu next
to each page's title has **Copy as Markdown**, **View as Markdown**, **Open in Claude** and **Open in ChatGPT**.
[llms.txt](https://docs.maitento.com/llms.txt) lists every page with a link to its Markdown copy, and
[llms-full.txt](https://docs.maitento.com/llms-full.txt) has all of them in one file. Give an agent either when it
needs more than the skill.

## Check its work

The skill makes mistakes rarer, not impossible. Ask the agent to validate before it deploys, and look at the result
yourself:

```bash
mt build ./maitento
```

`mt build` compiles and checks every file and saves nothing. [`mt doctor`](../reference/cli/index.md#mt-init-and-mt-doctor)
checks your setup: the API, your credential, the namespace and the model keys the project's agents need.

## If it didn't work

- **The agent doesn't seem to know Maitento.** Check where the folder landed: `SKILL.md` must sit directly in
  `skills/maitento/`, not in `skills/maitento/maitento/`. Start a new session, since agents read their skills when
  they start, and mention Maitento in your request. In Claude Code, `/plugin` shows whether the plugin is installed
  and enabled.
- **It still writes invalid `.mtr` files.** Run `mt build ./maitento` and give the agent the errors. The
  [project-file reference](../reference/project-files/index.md) has every property it can set.
- **`/plugin marketplace add` fails.** Check that you can reach github.com, and that your Claude Code is up to date.
