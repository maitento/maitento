# Maitento project files for VS Code

Editor support for [Maitento](https://docs.maitento.com) projects: the `.mtr` files that define agents, interactions,
connectors, tools, capsules, looms and app settings, and the Cogniscript (`.mtc`) code of apps.

- **Highlighting** for `.mtr` and `.mtc` files.
- **Completion** of property names for the block you are in, of the values a property takes (`"Automatic"`,
  `true`, ...), and of the names your project declares inside `@ref("`, `@prompt("` and `@json("`.
- **Hover** on a property for what it does, its type, whether it is required and its default, with a link to the
  [project-file reference](https://docs.maitento.com/reference/project-files/). Hover on a reference or an include
  to see which file it points at.
- **Checks as you type**: syntax mistakes (a missing space around `=`, a comma in a block, unquoted text), unknown
  properties (with the one you probably meant), missing required properties, a property set twice, values of the
  wrong kind (an unknown enum value, a duration that is not `"hh:mm:ss"`, a URL that is not a full URL, JSON that does
  not parse, an empty list), `@prompt` and `@json` files that do not exist, and `@ref` names the project does not
  declare.
- **Snippets** for a new file of each kind: type `mtr-` (for example `mtr-agent`), or accept the suggestion offered
  in an empty file.

The extension knows what each kind of file may contain from `mtr-schema.json`, which is generated from Maitento's own
code, so it accepts what a deploy accepts.

## Install

The extension is not on the Marketplace yet. Build the package and install it:

```bash
cd editors/vscode
npm ci
npm run package
code --install-extension maitento-mtr.vsix
```

## How it finds your project

A Maitento project is a folder with `agents/`, `interactions/one-shot/`, `connectors/open-api/` and the other folders
described in the [reference](https://docs.maitento.com/reference/project-files/). The kind of a `.mtr` file comes from
the folder it is in: `agents/greeter.mtr` is an agent named `greeter`. The extension takes the folder above it that
looks most like a project as the project's root, and reads the names of everything declared there to complete and
check references and includes.

A `.mtr` file outside those folders is checked for syntax only.

## What it reports

| Severity | Examples |
|---|---|
| Error | invalid syntax; an unknown property; a missing required property; a property set twice; a value of the wrong kind; a missing `@prompt` / `@json` file; two files of the same kind with the same name; an app folder with two `.mtr` files |
| Warning | an `@ref` the project does not declare (it may already exist in the namespace you deploy to); a duration that is a bare number of days; a name a deploy would refuse; an app folder with no `.mtc` code |

Every message has a code (such as `unknown-property` or `reference-not-found`) shown in the Problems panel.

## Settings and commands

| | |
|---|---|
| `maitento.mtr.diagnostics` | Check `.mtr` files as you type (default `true`). |
| **Maitento: Open the project-file reference** | Opens the reference page for the kind of file you are editing. |

## Check a project from the command line

The same checks run outside the editor, for example in a build:

```bash
cd editors/vscode
npm ci && npm run build
npm run check-project -- ../../examples/08-first-tool/maitento
```

It prints each finding as `file:line:column: severity code: message` and exits with 1 when there is an error.
`--errors-only` leaves out warnings.

## Develop

```bash
npm ci
npm test          # builds, then runs the unit tests (node:test)
npm run package   # builds maitento-mtr.vsix
```

`npm run build` compiles the TypeScript and copies `../../sdks/mtr-schema.json` into the extension. To try a change,
open this folder in VS Code and press F5.
