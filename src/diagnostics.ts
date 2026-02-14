import * as vscode from "vscode";
import { execSync } from "child_process";

interface AgencyDiagnostic {
  line: number;
  column: number;
  length: number;
  message: string;
  prettyMessage: string;
}

let diagnosticCollection: vscode.DiagnosticCollection;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

export function activateDiagnostics(context: vscode.ExtensionContext) {
  diagnosticCollection = vscode.languages.createDiagnosticCollection("agency");

  if (vscode.window.activeTextEditor?.document.languageId === "agency") {
    updateDiagnostics(vscode.window.activeTextEditor.document);
  }

  context.subscriptions.push(
    diagnosticCollection,
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.languageId === "agency") {
        debounceUpdate(e.document);
      }
    }),
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (doc.languageId === "agency") {
        updateDiagnostics(doc);
      }
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      diagnosticCollection.delete(doc.uri);
    }),
  );
}

function debounceUpdate(document: vscode.TextDocument) {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => updateDiagnostics(document), 300);
}

function updateDiagnostics(document: vscode.TextDocument) {
  const errors = runDiagnostics(document.getText());
  const diagnostics = errors.map((err) => {
    const startPos = new vscode.Position(err.line, err.column);
    const endPos = new vscode.Position(
      err.line,
      err.column + (err.length || 1),
    );
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(startPos, endPos),
      err.message,
      vscode.DiagnosticSeverity.Error,
    );
    diagnostic.source = "agency";
    return diagnostic;
  });
  diagnosticCollection.set(document.uri, diagnostics);
}

function runDiagnostics(text: string): AgencyDiagnostic[] {
  try {
    const output = execSync("pnpm agency diagnostics", {
      input: text,
      encoding: "utf-8",
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["pipe", "pipe", "ignore"],
    });

    // pnpm prefixes stdout with header lines; find the first line starting with { or [
    const lines = output.split("\n");
    const jsonStart = lines.findIndex(
      (l: string) => l.startsWith("{") || l.startsWith("["),
    );

    if (jsonStart === -1) {
      return [];
    }
    const jsonStr = lines.slice(jsonStart).join("\n").trim();

    if (!jsonStr) {
      return [];
    }

    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [parsed];
  } catch (e) {
    console.error("Agency diagnostics error:", e);
    return [];
  }
}
