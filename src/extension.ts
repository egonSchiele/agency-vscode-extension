import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  State,
} from "vscode-languageclient/node";
import { AgencyFormattingProvider } from "./formatter";
import { activateDiagnostics } from "./diagnostics";
import { AgencyDefinitionProvider } from "./definition";

let client: LanguageClient | undefined;

export function activate(context: vscode.ExtensionContext): void {
  console.log("Agency extension is now active");

  const config = vscode.workspace.getConfiguration("agency.lsp");
  const commandSetting = config.get<string>("command", "pnpm run --silent agency");
  const parts = commandSetting.split(/\s+/);
  const command = parts[0];
  const args = [...parts.slice(1), "lsp"];

  const serverOptions: ServerOptions = {
    run: { command, args },
    debug: { command, args },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "agency" }],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher("**/agency.json"),
    },
  };

  client = new LanguageClient(
    "agencyLanguageServer",
    "Agency Language Server",
    serverOptions,
    clientOptions,
  );

  client.onDidChangeState((e) => {
    if (e.newState === State.Stopped) {
      console.log(
        "Agency LSP server failed to start or crashed. Falling back to CLI-based providers.",
      );
      client = undefined;
      activateFallbackProviders(context);
    }
  });

  client.start();

  context.subscriptions.push({
    dispose: () => {
      if (client) {
        client.stop();
      }
    },
  });
}

function activateFallbackProviders(context: vscode.ExtensionContext): void {
  console.log("Agency: activating CLI-based fallback providers");

  const formatterProvider =
    vscode.languages.registerDocumentFormattingEditProvider(
      { scheme: "file", language: "agency" },
      new AgencyFormattingProvider(),
    );
  context.subscriptions.push(formatterProvider);

  const definitionProvider = vscode.languages.registerDefinitionProvider(
    { scheme: "file", language: "agency" },
    new AgencyDefinitionProvider(),
  );
  context.subscriptions.push(definitionProvider);

  activateDiagnostics(context);

  // Format on save (fallback mode only)
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
            new vscode.CancellationTokenSource().token,
          ),
        ),
      );
    }),
  );
}

export function deactivate(): Promise<void> | undefined {
  if (client) {
    return client.stop();
  }
  return undefined;
}
