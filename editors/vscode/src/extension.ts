import * as path from "path";
import * as vscode from "vscode";
import { analyze, Analysis } from "./mtr/analyzer";
import { complete } from "./mtr/completion";
import { docsUrl, DOCS_BASE } from "./mtr/docs";
import { hoverAt } from "./mtr/hover";
import { nodeFileSystem } from "./mtr/nodeFileSystem";
import { Severity } from "./mtr/parser";
import { findProjectRoot, placeFile, Placement, ProjectIndex } from "./mtr/project";
import { bundledSchemaPath, loadSchema } from "./mtr/schema";

const LANGUAGE = "mtr";

interface FileContext {
  placement?: Placement;
  project?: ProjectIndex;
  file?: string;
}

export function activate(context: vscode.ExtensionContext): void {
  const schema = loadSchema(bundledSchemaPath());
  const diagnostics = vscode.languages.createDiagnosticCollection("maitento");
  const projects = new Map<string, ProjectIndex>();
  const analyses = new Map<string, { version: number; analysis: Analysis }>();
  const pending = new Map<string, NodeJS.Timeout>();

  const enabled = (): boolean => vscode.workspace.getConfiguration("maitento").get<boolean>("mtr.diagnostics", true);

  const fileContext = (document: vscode.TextDocument): FileContext => {
    if (document.uri.scheme !== "file") return {};
    const file = document.uri.fsPath;
    const root = findProjectRoot(schema, file, nodeFileSystem);
    if (!root) return { file };
    let project = projects.get(root);
    if (!project) {
      project = new ProjectIndex(root, schema, nodeFileSystem);
      projects.set(root, project);
    }
    const placement = placeFile(schema, path.relative(root, file).split(path.sep).join("/"));
    return { placement, project, file };
  };

  const analysisOf = (document: vscode.TextDocument): Analysis => {
    const key = document.uri.toString();
    const cached = analyses.get(key);
    if (cached && cached.version === document.version) return cached.analysis;
    const analysis = analyze(document.getText(), { schema, ...fileContext(document) });
    analyses.set(key, { version: document.version, analysis });
    return analysis;
  };

  const validate = (document: vscode.TextDocument): void => {
    if (document.languageId !== LANGUAGE) return;
    if (!enabled()) {
      diagnostics.delete(document.uri);
      return;
    }
    analyses.delete(document.uri.toString());
    const { issues } = analysisOf(document);
    diagnostics.set(document.uri, issues.map((issue) => {
      const range = new vscode.Range(document.positionAt(issue.range.start), document.positionAt(issue.range.end));
      const diagnostic = new vscode.Diagnostic(range, issue.message, severity(issue.severity));
      diagnostic.source = "maitento";
      diagnostic.code = issue.code;
      return diagnostic;
    }));
  };

  const validateLater = (document: vscode.TextDocument): void => {
    const key = document.uri.toString();
    clearTimeout(pending.get(key));
    pending.set(key, setTimeout(() => {
      pending.delete(key);
      validate(document);
    }, 250));
  };

  /** A file was added, removed or changed on disk: forget the projects it may belong to and check open files again. */
  const projectChanged = (uri: vscode.Uri): void => {
    for (const root of [...projects.keys()]) {
      if (!path.relative(root, uri.fsPath).startsWith("..")) projects.delete(root);
    }
    for (const document of vscode.workspace.textDocuments) validateLater(document);
  };

  const watcher = vscode.workspace.createFileSystemWatcher("**/*.{mtr,md,json,mtc}");
  context.subscriptions.push(
    diagnostics,
    watcher,
    watcher.onDidCreate(projectChanged),
    watcher.onDidDelete(projectChanged),
    watcher.onDidChange((uri) => {
      if (!uri.fsPath.toLowerCase().endsWith(".mtr")) projectChanged(uri);
    }),
    vscode.workspace.onDidOpenTextDocument(validate),
    vscode.workspace.onDidChangeTextDocument((e) => validateLater(e.document)),
    vscode.workspace.onDidCloseTextDocument((document) => {
      diagnostics.delete(document.uri);
      analyses.delete(document.uri.toString());
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("maitento")) vscode.workspace.textDocuments.forEach(validate);
    }),
    vscode.languages.registerHoverProvider(LANGUAGE, {
      provideHover(document, position) {
        const hover = hoverAt(analysisOf(document), document.offsetAt(position), { schema, ...fileContext(document) });
        if (!hover) return undefined;
        const markdown = new vscode.MarkdownString(hover.markdown);
        return new vscode.Hover(markdown, new vscode.Range(document.positionAt(hover.range.start), document.positionAt(hover.range.end)));
      },
    }),
    vscode.languages.registerCompletionItemProvider(LANGUAGE, {
      provideCompletionItems(document, position) {
        const offset = document.offsetAt(position);
        return complete(document.getText(), offset, { schema, ...fileContext(document) }).map((s) => {
          const item = new vscode.CompletionItem(s.label, itemKind(s.kind));
          item.insertText = s.isSnippet ? new vscode.SnippetString(s.insertText) : s.insertText;
          item.range = new vscode.Range(document.positionAt(s.replaceFrom), position);
          item.detail = s.detail;
          if (s.documentation) item.documentation = new vscode.MarkdownString(s.documentation);
          if (s.sortText) item.sortText = s.sortText;
          return item;
        });
      },
    }, '"', "@", "(", "="),
    vscode.commands.registerCommand("maitento.openMtrReference", () => {
      const document = vscode.window.activeTextEditor?.document;
      const kind = document?.languageId === LANGUAGE ? fileContext(document).placement?.kind.id : undefined;
      void vscode.env.openExternal(vscode.Uri.parse((kind && docsUrl(kind)) || DOCS_BASE));
    }),
  );

  vscode.workspace.textDocuments.forEach(validate);
}

export function deactivate(): void {
  // Everything is disposed through the extension context.
}

function severity(value: Severity): vscode.DiagnosticSeverity {
  switch (value) {
    case "error":
      return vscode.DiagnosticSeverity.Error;
    case "warning":
      return vscode.DiagnosticSeverity.Warning;
    default:
      return vscode.DiagnosticSeverity.Information;
  }
}

function itemKind(kind: string): vscode.CompletionItemKind {
  switch (kind) {
    case "property":
      return vscode.CompletionItemKind.Property;
    case "reference":
      return vscode.CompletionItemKind.Reference;
    case "file":
      return vscode.CompletionItemKind.File;
    case "file-template":
      return vscode.CompletionItemKind.Snippet;
    default:
      return vscode.CompletionItemKind.Value;
  }
}

