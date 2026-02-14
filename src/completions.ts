import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

let languageDocs = "";

export function activateCompletions(context: vscode.ExtensionContext) {
  // Load language docs once at activation
  const docsPath = path.join(context.extensionPath, "DOCS_FOR_CLAUDE.md");
  try {
    languageDocs = fs.readFileSync(docsPath, "utf-8");
  } catch {
    console.error("Agency completions: could not load DOCS_FOR_CLAUDE.md");
    return;
  }

  const provider = vscode.languages.registerInlineCompletionItemProvider(
    { language: "agency" },
    new AgencyCompletionProvider()
  );

  context.subscriptions.push(provider);
}

class AgencyCompletionProvider
  implements vscode.InlineCompletionItemProvider
{
  private pendingResolve: (() => void) | null = null;
  private readonly debounceMs = 1000;
  private lastCompletionTime = 0;
  private readonly cooldownMs = 2000;

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[]> {
    // Cooldown after returning a completion (prevents re-triggering on accept)
    if (Date.now() - this.lastCompletionTime < this.cooldownMs) {
      return [];
    }

    // Cancel any previous pending debounce
    if (this.pendingResolve) {
      this.pendingResolve();
      this.pendingResolve = null;
    }

    // Debounce: wait for the user to stop typing
    const cancelled = await new Promise<boolean>((resolve) => {
      this.pendingResolve = () => resolve(true);
      const timer = setTimeout(() => resolve(false), this.debounceMs);
      token.onCancellationRequested(() => {
        clearTimeout(timer);
        resolve(true);
      });
    });
    if (cancelled || token.isCancellationRequested) {
      return [];
    }

    // Don't complete on empty lines at the start of the file
    const prefix = document.getText(
      new vscode.Range(new vscode.Position(0, 0), position)
    );
    if (prefix.trim().length === 0) {
      return [];
    }

    const [model] = await vscode.lm.selectChatModels({
      vendor: "copilot",
      family: "gpt-4o-mini",
    });
    if (!model) {
      return [];
    }

    // Include some suffix context (up to 50 lines after cursor)
    const suffixEnd = Math.min(document.lineCount - 1, position.line + 50);
    const suffix = document.getText(
      new vscode.Range(
        position,
        new vscode.Position(suffixEnd, document.lineAt(suffixEnd).text.length)
      )
    );

    // The text after the cursor on the current line
    const currentLine = document.lineAt(position.line);
    const textAfterCursor = currentLine.text.substring(position.character);

    const messages = [
      vscode.LanguageModelChatMessage.User(
        `You are an autocomplete engine for the Agency programming language. Here is the language reference:\n\n${languageDocs}\n\nRules:\n- Return ONLY the code that should be inserted at the cursor position. No explanation, no markdown fences.\n- You are REPLACING everything from the cursor to the end of the current line. The text "${textAfterCursor}" will be removed. Your completion should include any part of it you want to keep.\n- Keep completions short: finish the current statement or block, at most a few lines.\n- If you cannot determine a useful completion, return nothing.\n- Match the indentation style of the existing code.`
      ),
      vscode.LanguageModelChatMessage.User(
        `Complete this Agency code at the cursor position marked with <CURSOR>:\n\n${prefix}<CURSOR>${suffix}`
      ),
    ];

    try {
      const response = await model.sendRequest(messages, {}, token);
      let completion = "";
      for await (const fragment of response.text) {
        if (token.isCancellationRequested) {
          return [];
        }
        completion += fragment;
      }

      completion = completion.trim();
      if (!completion) {
        return [];
      }

      // Replace from cursor to end of line so mid-line completions make sense
      const replaceRange = new vscode.Range(position, currentLine.range.end);

      this.lastCompletionTime = Date.now();
      return [new vscode.InlineCompletionItem(completion, replaceRange)];
    } catch {
      return [];
    }
  }
}
