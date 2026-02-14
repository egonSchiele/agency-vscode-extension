import * as vscode from "vscode";
import { AgencyFormattingProvider } from "./formatter";
import { activateDiagnostics } from "./diagnostics";

export function activate(context: vscode.ExtensionContext) {
  console.log("Agency extension is now active");

  // Register the document formatting provider for Agency files
  const formatterProvider = vscode.languages.registerDocumentFormattingEditProvider(
    { scheme: 'file', language: 'agency' },
    new AgencyFormattingProvider()
  );

  context.subscriptions.push(formatterProvider);

  activateDiagnostics(context);
}

export function deactivate() {}
