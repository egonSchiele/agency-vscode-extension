import * as vscode from "vscode";
import { ADLFormattingProvider } from "./formatter";

export function activate(context: vscode.ExtensionContext) {
  console.log("ADL extension is now active");

  /*   // Register the document formatting provider for ADL files
  const formatterProvider = vscode.languages.registerDocumentFormattingEditProvider(
    { scheme: 'file', language: 'adl' },
    new ADLFormattingProvider()
  );

  context.subscriptions.push(formatterProvider);
 */
}

export function deactivate() {}
