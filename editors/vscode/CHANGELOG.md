# Changelog

## Unreleased

- Highlighting for `.mtr` project files and Cogniscript (`.mtc`).
- Cogniscript highlighting follows the compiler. It marks `@prompt("name")` and `@json("name")`, numbers such as `.5`, and escapes and names that fail a deploy, such as `\d` and `retry_count`. It doesn't mark GUID literals, square brackets or a single `|` or `&`, which Cogniscript doesn't have.
- Completion, hover and checks for `.mtr` files, from the schema generated from Maitento's code.
- `credentialStack` in an interaction's or app's `.mtr` file: the credential stack its runs use.
- A snippet for a new file of each kind.
- `npm run check-project` runs the same checks over a project folder from the command line.
