import * as vscode from "vscode";
import { AgencyFormattingProvider } from "./formatter";
import { activateDiagnostics } from "./diagnostics";
import { activateCompletions } from "./completions";
import { AgencyDefinitionProvider } from "./definition";

export function activate(context: vscode.ExtensionContext) {
  console.log("Agency extension is now active");

  // Register the document formatting provider for Agency files
  const formatterProvider = vscode.languages.registerDocumentFormattingEditProvider(
    { scheme: 'file', language: 'agency' },
    new AgencyFormattingProvider()
  );

  context.subscriptions.push(formatterProvider);

  const definitionProvider = vscode.languages.registerDefinitionProvider(
    { scheme: "file", language: "agency" },
    new AgencyDefinitionProvider()
  );
  context.subscriptions.push(definitionProvider);

  activateDiagnostics(context);
  activateCompletions(context);
}

export function deactivate() {}
