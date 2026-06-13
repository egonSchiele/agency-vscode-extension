import * as cp from "child_process";
import * as vscode from "vscode";
import {
  CloseAction,
  ErrorAction,
  LanguageClient,
  LanguageClientOptions,
  RevealOutputChannelOn,
  ServerOptions,
  State,
} from "vscode-languageclient/node";
import { AgencyFormattingProvider } from "./formatter";
import { activateDiagnostics } from "./diagnostics";
import { AgencyDefinitionProvider } from "./definition";

// How long the spawned server process must stay alive before we trust that
// the agency script actually exists. When the script is missing the command
// exits almost immediately (e.g. pnpm exits with code 1 when the "agency"
// script is not defined), while a real LSP server keeps running.
const SERVER_PROBE_TIMEOUT_MS = 1000;

let client: LanguageClient | undefined;
let fallbackActivated = false;

// The library force-shows error notifications for some failures (e.g.
// "couldn't create connection to server") with no option to opt out. LSP
// failures are recoverable for us (we fall back to CLI providers), so route
// those to the output channel only instead of bothering the user.
class SilentLanguageClient extends LanguageClient {
  error(
    message: string,
    data?: any,
    showNotification?: boolean | "force",
  ): void {
    super.error(message, data, showNotification === "force" ? false : showNotification);
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log("Agency extension is now active");

  const config = vscode.workspace.getConfiguration("agency.lsp");
  const commandSetting = config.get<string>("command", "pnpm run --silent agency");
  const parts = commandSetting.split(/\s+/);
  const command = parts[0];
  const args = [...parts.slice(1), "lsp"];

  const serverProcess = await spawnServerIfAvailable(command, args);
  if (!serverProcess) {
    console.error(
      `Agency: couldn't find the agency script anywhere (tried "${[command, ...args].join(" ")}"). ` +
        "Agency language features are disabled. Set the 'agency.lsp.command' " +
        "setting to a working command and reload the window.",
    );
    return;
  }

  // Hand the already-running probe process to the client instead of letting
  // it spawn a second one.
  const serverOptions: ServerOptions = () => Promise.resolve(serverProcess);

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "agency" }],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher("**/agency.json"),
    },
    revealOutputChannelOn: RevealOutputChannelOn.Never,
    // Returning false stops the client instead of retrying initialize.
    initializationFailedHandler: () => false,
    // DoNotRestart prevents the crash/restart loop ("The server crashed 5
    // times in the last 3 minutes"); handled: true suppresses the
    // notification for each failure. Errors still go to the output channel.
    errorHandler: {
      error: () => ({ action: ErrorAction.Shutdown, handled: true }),
      closed: () => ({ action: CloseAction.DoNotRestart, handled: true }),
    },
  };

  client = new SilentLanguageClient(
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

  client.start().catch((error) => {
    console.error("Agency LSP client failed to start:", error);
  });

  context.subscriptions.push({
    dispose: () => {
      const stopping = client ? client.stop() : Promise.resolve();
      client = undefined;
      // The client doesn't track processes it didn't spawn itself, so make
      // sure the server doesn't outlive the extension.
      void Promise.resolve(stopping)
        .catch(() => undefined)
        .finally(() => {
          if (serverProcess.exitCode === null && !serverProcess.killed) {
            serverProcess.kill();
          }
        });
    },
  });
}

/**
 * Spawns the LSP server command and resolves with the process if it is still
 * running after a short probe window, or undefined if it could not be
 * spawned (e.g. the binary doesn't exist) or exited right away (e.g. the
 * agency script is not available). Starting the LanguageClient with a
 * command that immediately fails would surface error notifications to the
 * user, so availability must be established before the client starts.
 */
function spawnServerIfAvailable(
  command: string,
  args: string[],
): Promise<cp.ChildProcess | undefined> {
  const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const serverProcess = cp.spawn(command, args, { cwd });

  return new Promise((resolve) => {
    const onFailure = () => {
      clearTimeout(timer);
      resolve(undefined);
    };
    const timer = setTimeout(() => {
      serverProcess.removeListener("error", onFailure);
      serverProcess.removeListener("exit", onFailure);
      resolve(serverProcess);
    }, SERVER_PROBE_TIMEOUT_MS);
    serverProcess.once("error", onFailure);
    serverProcess.once("exit", onFailure);
  });
}

function activateFallbackProviders(context: vscode.ExtensionContext): void {
  if (fallbackActivated) {
    return;
  }
  fallbackActivated = true;
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
