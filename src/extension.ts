import * as vscode from "vscode";
import { AgencyFormattingProvider } from "./formatter";
import { activateDiagnostics } from "./diagnostics";

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

  // Format on save when the setting is enabled
  const formatter = new AgencyFormattingProvider();
  context.subscriptions.push(
    vscode.workspace.onWillSaveTextDocument((event) => {
      if (event.document.languageId !== "agency") {
        return;
      }
      const config = vscode.workspace.getConfiguration("agency");
      if (!config.get<boolean>("formatOnSave", false)) {
        return;
      }
      event.waitUntil(
        Promise.resolve(
          formatter.provideDocumentFormattingEdits(
            event.document,
            { tabSize: 2, insertSpaces: true },
            new vscode.CancellationTokenSource().token
          )
        )
      );
    })
  );
}

export function deactivate() {}
