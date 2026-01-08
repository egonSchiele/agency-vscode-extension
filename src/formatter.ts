import * as vscode from "vscode";
import { execSync } from "child_process";

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

    // Replace entire document with formatted text
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(text.length)
    );

    return [vscode.TextEdit.replace(fullRange, formattedText)];
  }

  private format(text: string): string {
    try {
      // Execute `pnpm run agency fmt` with the document content as stdin
      // stdio: ['pipe', 'pipe', 'ignore'] = stdin, stdout, stderr (ignore stderr to suppress pnpm messages)
      const formattedText = execSync("pnpm run agency fmt", {
        input: text,
        encoding: "utf-8",
        cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
        maxBuffer: 10 * 1024 * 1024, // 10 MB buffer
        stdio: ["pipe", "pipe", "ignore"],
      });

      const removePnpmHeader = formattedText.split("\n").slice(3).join("\n");
      return removePnpmHeader.trim();
    } catch (error: any) {
      // If the command fails, show error and return original text
      console.error("Agency formatting error:", error);
      vscode.window.showErrorMessage(
        `Agency formatter error: ${error.message}`
      );
      return text;
    }
  }
}
