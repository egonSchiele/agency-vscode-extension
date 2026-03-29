import * as vscode from "vscode";
import { execSync } from "child_process";

interface AgencyDefinition {
  file: string;
  line: number;
  column: number;
}

export class AgencyDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Definition> {
    console.log(`[agency-def] provideDefinition called at line=${position.line} col=${position.character}`);
    console.log(`[agency-def] document: ${document.uri.fsPath}, languageId: ${document.languageId}`);

    const result = this.findDefinition(document.getText(), position, document.uri.fsPath);
    if (!result) {
      console.log("[agency-def] findDefinition returned null");
      return null;
    }

    console.log(`[agency-def] result: file=${result.file} line=${result.line} col=${result.column}`);

    const uri = result.file === document.fileName
      ? document.uri
      : vscode.Uri.file(result.file);

    console.log(`[agency-def] returning Location: ${uri.fsPath}:${result.line}:${result.column}`);
    return new vscode.Location(uri, new vscode.Position(result.line, result.column));
  }

  private findDefinition(
    text: string,
    position: vscode.Position,
    fileName: string
  ): AgencyDefinition | null {
    const cmd = `pnpm agency definition --file ${fileName} --line ${position.line} --column ${position.character}`;
    console.log(`[agency-def] running: ${cmd}`);
    console.log(`[agency-def] cwd: ${vscode.workspace.workspaceFolders?.[0]?.uri.fsPath}`);

    try {
      const output = execSync(cmd, {
        input: text,
        encoding: "utf-8",
        cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
        maxBuffer: 10 * 1024 * 1024,
        stdio: ["pipe", "pipe", "ignore"],
      });

      console.log(`[agency-def] raw output: ${JSON.stringify(output)}`);

      const lines = output.split("\n");
      const jsonStart = lines.findIndex(
        (l: string) => l.startsWith("{") || l.startsWith("[")
      );

      console.log(`[agency-def] jsonStart index: ${jsonStart}`);

      if (jsonStart === -1) {
        console.log("[agency-def] no JSON found in output");
        return null;
      }

      const jsonStr = lines.slice(jsonStart).join("\n").trim();
      console.log(`[agency-def] jsonStr: ${jsonStr}`);

      if (!jsonStr) {
        console.log("[agency-def] jsonStr is empty");
        return null;
      }

      const parsed = JSON.parse(jsonStr);
      console.log(`[agency-def] parsed: ${JSON.stringify(parsed)}`);

      if (parsed && typeof parsed.line === "number") {
        return parsed;
      }

      console.log("[agency-def] parsed object missing 'line' field");
      return null;
    } catch (e: any) {
      console.error(`[agency-def] error: ${e.message}`);
      if (e.stdout) console.error(`[agency-def] stdout: ${e.stdout}`);
      if (e.stderr) console.error(`[agency-def] stderr: ${e.stderr}`);
      return null;
    }
  }
}
