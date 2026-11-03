import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import { describe, it } from "node:test";
import { publicRoot } from "./helpers";

/**
 * The VS Code glue, run against a stand-in for the `vscode` module: activation registers the providers, an open
 * `.mtr` file gets its diagnostics, and completion and hover answer through VS Code's types.
 */
interface Captured {
  diagnostics: Map<string, { message: string; severity: number }[]>;
  open?: (document: FakeDocument) => void;
  hover?: { provideHover(document: FakeDocument, position: { offset: number }): unknown };
  completion?: { provideCompletionItems(document: FakeDocument, position: { offset: number }): { label: string; insertText: unknown }[] };
  triggers: string[];
}

interface FakeDocument {
  uri: { scheme: string; fsPath: string; toString(): string };
  languageId: string;
  version: number;
  getText(): string;
  positionAt(offset: number): { offset: number };
  offsetAt(position: { offset: number }): number;
}

function fakeVscode(captured: Captured): unknown {
  const disposable = { dispose: () => undefined };
  const event = () => disposable;
  class Range {
    constructor(readonly start: unknown, readonly end: unknown) {}
  }
  class Diagnostic {
    source?: string;
    code?: string;
    constructor(readonly range: unknown, readonly message: string, readonly severity: number) {}
  }
  class MarkdownString {
    constructor(readonly value: string) {}
  }
  class Hover {
    constructor(readonly contents: MarkdownString, readonly range: unknown) {}
  }
  class CompletionItem {
    insertText?: unknown;
    range?: unknown;
    constructor(readonly label: string, readonly kind: number) {}
  }
  class SnippetString {
    constructor(readonly value: string) {}
  }
  return {
    Range, Diagnostic, MarkdownString, Hover, CompletionItem, SnippetString,
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    CompletionItemKind: { Property: 9, Value: 12, Reference: 17, File: 16, Snippet: 14 },
    Uri: { parse: (value: string) => ({ toString: () => value }) },
    env: { openExternal: async () => true },
    window: { activeTextEditor: undefined },
    commands: { registerCommand: () => disposable },
    languages: {
      createDiagnosticCollection: () => ({
        set: (uri: { toString(): string }, items: { message: string; severity: number }[]) => captured.diagnostics.set(uri.toString(), items),
        delete: (uri: { toString(): string }) => captured.diagnostics.delete(uri.toString()),
        dispose: () => undefined,
      }),
      registerHoverProvider: (_language: string, provider: Captured["hover"]) => {
        captured.hover = provider;
        return disposable;
      },
      registerCompletionItemProvider: (_language: string, provider: Captured["completion"], ...triggers: string[]) => {
        captured.completion = provider;
        captured.triggers = triggers;
        return disposable;
      },
    },
    workspace: {
      textDocuments: [],
      getConfiguration: () => ({ get: <T>(_key: string, fallback: T) => fallback }),
      createFileSystemWatcher: () => ({ onDidCreate: event, onDidDelete: event, onDidChange: event, dispose: () => undefined }),
      onDidOpenTextDocument: (listener: (d: FakeDocument) => void) => {
        captured.open = listener;
        return disposable;
      },
      onDidChangeTextDocument: event,
      onDidCloseTextDocument: event,
      onDidChangeConfiguration: event,
    },
  };
}

function document(file: string, text = fs.readFileSync(file, "utf8")): FakeDocument {
  return {
    uri: { scheme: "file", fsPath: file, toString: () => `file://${file}` },
    languageId: "mtr",
    version: 1,
    getText: () => text,
    positionAt: (offset) => ({ offset }),
    offsetAt: (position) => position.offset,
  };
}

function activate(): Captured {
  const captured: Captured = { diagnostics: new Map(), triggers: [] };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Module = require("module") as { _load: (request: string, ...rest: unknown[]) => unknown };
  const load = Module._load;
  const vscode = fakeVscode(captured);
  Module._load = function (this: unknown, request: string, ...rest: unknown[]) {
    return request === "vscode" ? vscode : load.call(this, request, ...rest);
  };
  try {
    const modulePath = require.resolve("../src/extension");
    delete require.cache[modulePath];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const extension = require(modulePath) as { activate(context: { subscriptions: unknown[] }): void };
    extension.activate({ subscriptions: [] });
  } finally {
    Module._load = load;
  }
  return captured;
}

describe("the extension in VS Code", () => {
  const project = path.join(publicRoot, "examples", "08-first-tool", "maitento");
  const agentFile = path.join(project, "agents", "weather-bot.mtr");

  it("registers completion (with its trigger characters), hover, and checks a file when it opens", () => {
    const captured = activate();
    assert.ok(captured.completion && captured.hover && captured.open);
    assert.deepEqual(captured.triggers, ['"', "@", "(", "="]);

    const good = document(agentFile);
    captured.open!(good);
    assert.deepEqual(captured.diagnostics.get(good.uri.toString()), []);

    const bad = document(agentFile, 'model = @ref("deepseek.deepseek-v4-flash")\nsumary = "x"\n');
    captured.open!(bad);
    const found = captured.diagnostics.get(bad.uri.toString())!;
    assert.deepEqual(found.map((d) => d.severity), [0, 0], "an unknown property and the missing ones are errors");
  });

  it("answers completion and hover through VS Code's types", () => {
    const captured = activate();
    const text = fs.readFileSync(agentFile, "utf8");
    const items = captured.completion!.provideCompletionItems(document(agentFile, `${text}\n`), { offset: text.length + 1 });
    assert.ok(items.some((i) => i.label === "allowWebSearch"));

    const hover = captured.hover!.provideHover(document(agentFile), { offset: text.indexOf("summary") + 2 }) as { contents: { value: string } };
    assert.match(hover.contents.value, /\*\*`summary`\*\*/);
    assert.match(hover.contents.value, /reference\/project-files\/agents\/#summary/);
  });
});
