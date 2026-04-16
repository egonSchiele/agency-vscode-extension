import * as vscode from "vscode";
import { execSync } from "child_process";

const output = vscode.window.createOutputChannel("Agency");

export class AgencyFormattingProvider
  implements vscode.DocumentFormattingEditProvider
{
  provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    options: vscode.FormattingOptions,
    token: vscode.CancellationToken
  ): vscode.TextEdit[] {
    const text = document.getText();
    const formattedText = this.format(text);

    if (formattedText === text) {
      return [];
    }

    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(text.length)
    );

    return [vscode.TextEdit.replace(fullRange, formattedText)];
  }

  private format(text: string): string {
    for (const runner of ["pnpm", "npm"]) {
      try {
        const formattedText = execSync(`${runner} run agency fmt`, {
          input: text,
          encoding: "utf-8",
          cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
          maxBuffer: 10 * 1024 * 1024,
          stdio: ["pipe", "pipe", "ignore"],
        });

        // Both pnpm and npm prefix stdout with ~3 header lines before the script output
        return formattedText.split("\n").slice(3).join("\n").trim();
      } catch (error: any) {
        output.appendLine(
          `Agency formatter: \`${runner} run agency fmt\` failed: ${error?.message ?? error}`
        );
      }
    }

    output.appendLine(
      "Agency formatter: no working runner found (tried pnpm, npm); leaving document unchanged."
    );
    return text;
  }
}
