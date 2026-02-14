# Agency VS Code Extension

## Project Overview

This is a **client-only VS Code extension** (no Language Server Protocol) that provides language support for the **Agency language** (`.agency` files). Agency is a custom language for defining agents with LLM integration, async/await, streaming, and type definitions.

The extension provides:
- **Syntax highlighting** via TextMate grammar
- **Document formatting** via `agency-lang` CLI
- **Real-time diagnostics** (error squiggles) via `agency-lang` CLI
- **Language configuration** (bracket matching, auto-closing, comments)

## Architecture

### No LSP Approach
This extension intentionally avoids the Language Server Protocol and instead:
- Uses TextMate grammar (`syntaxes/agency.tmLanguage.json`) for syntax highlighting
- Shells out to the `agency-lang` CLI for formatting and diagnostics
- Keeps everything lightweight and synchronous

### Dependencies
- **`agency-lang`** npm package — the actual language implementation (parser, compiler, runtime, formatter, diagnostics)
- All language processing happens via CLI commands, not in-process API calls

## File Structure

```
src/
├── extension.ts      # Entry point, registers providers and activates diagnostics
├── formatter.ts      # DocumentFormattingEditProvider (shells out to `pnpm agency fmt`)
└── diagnostics.ts    # Diagnostic provider (shells out to `pnpm agency diagnostics`)

syntaxes/
└── agency.tmLanguage.json  # TextMate grammar for syntax highlighting

language-configuration.json  # VS Code language config (brackets, comments, etc.)
package.json                 # Extension manifest
tsconfig.json                # TypeScript config (compiles src/ → out/)
```

### Key Files

**`src/extension.ts`**
- Activates on startup (`onStartupFinished`)
- Registers the formatting provider
- Calls `activateDiagnostics(context)` to set up error checking

**`src/formatter.ts`**
- Implements `DocumentFormattingEditProvider`
- Shells out to `pnpm agency fmt` with document content via stdin
- Strips pnpm header lines from stdout (first 3 lines)
- Returns formatted text or original text on error

**`src/diagnostics.ts`**
- Creates a `DiagnosticCollection` for showing error squiggles
- Listens to `onDidChangeTextDocument`, `onDidOpenTextDocument`, `onDidCloseTextDocument`
- Debounces updates by 300ms to avoid running on every keystroke
- Shells out to `pnpm agency diagnostics` with stdin
- Parses JSON output and creates VS Code `Diagnostic` objects
- Strips pnpm header lines by finding first line starting with `{` or `[`

**`syntaxes/agency.tmLanguage.json`**
- TextMate grammar defining syntax highlighting rules
- Supports keywords, types, functions, operators, strings, comments, etc.

## Development Workflow

### Building
```bash
npm run build    # or: tsc
```
Compiles TypeScript from `src/` to `out/` (configured in `tsconfig.json`).

### Watch Mode
```bash
npm run watch    # or: tsc -watch
```
Auto-recompiles on file changes.

### Testing Changes
1. Make code changes
2. Run `npm run build` (or rely on watch mode)
3. In VS Code, press `Cmd+Shift+P` → **"Developer: Reload Window"**
4. Open a `.agency` file to test

### Debugging
- Press `Cmd+Shift+P` → **"Developer: Toggle Developer Tools"**
- Check the Console tab for `console.log` and errors
- The extension logs "Agency extension is now active" on activation
- Diagnostic errors log as "Agency diagnostics error: ..."

## Important Patterns

### pnpm Stdout Header Issue
When calling `pnpm run agency <command>`, pnpm prefixes stdout with header lines. Both the formatter and diagnostics handle this:

**Formatter approach:**
```ts
const removePnpmHeader = formattedText.split("\n").slice(3).join("\n");
```

**Diagnostics approach:**
```ts
const lines = output.split("\n");
const jsonStart = lines.findIndex((l) => l.startsWith("{") || l.startsWith("["));
const jsonStr = lines.slice(jsonStart).join("\n").trim();
```

Always account for pnpm headers when parsing CLI output.

### Diagnostic Format
The `pnpm agency diagnostics` command outputs JSON:
```json
{
  "line": 0,
  "column": 6,
  "length": 1,
  "prettyMessage": "Near: import!;\n            ^\nexpected a statement of the form `import { x, y } from 'filename'`",
  "message": "expected a statement of the form `import { x, y } from 'filename'`"
}
```

Fields are **0-indexed**. VS Code `Position` is also 0-indexed, so no conversion needed.

### Debouncing Diagnostics
Diagnostics are debounced by 300ms to avoid running the CLI on every keystroke:
```ts
debounceTimer = setTimeout(() => updateDiagnostics(document), 300);
```

### Error Handling
Both formatter and diagnostics use try-catch with `execSync`:
- Formatter shows error message to user and returns original text
- Diagnostics silently return empty array (no squiggles) and log to console

## Common Tasks

### Adding New Language Features
1. **Syntax highlighting**: Edit `syntaxes/agency.tmLanguage.json`
2. **Formatting**: Update `agency-lang` package (this extension just calls the CLI)
3. **Diagnostics**: Update `agency-lang` package (this extension just calls the CLI)
4. **Autocompletion/IntelliSense**: Would require implementing `CompletionItemProvider`
5. **Hover info**: Would require implementing `HoverProvider`

### Updating the `agency-lang` Dependency
```bash
pnpm update agency-lang
```
Then rebuild and reload.

### Publishing the Extension
```bash
npm run vscode:prepublish  # Runs build
vsce package               # Creates .vsix file
vsce publish               # Publishes to marketplace
```

## Extension Activation

- **When**: `onStartupFinished` (runs after VS Code fully loads)
- **Language ID**: `agency`
- **File Extension**: `.agency`
- **Entry Point**: `./out/extension.js` (compiled from `src/extension.ts`)

## Guidelines for Future Changes

- **Keep it simple**: This is a client-only extension by design. Avoid adding an LSP unless absolutely necessary.
- **Shell out to CLI**: Continue using the `agency-lang` CLI for language operations rather than importing APIs in-process.
- **Handle pnpm headers**: Always strip pnpm output headers when parsing stdout.
- **Debounce expensive operations**: Use debouncing for any operation that runs on every keystroke.
- **Never skip the build**: Changes to `src/` only take effect after compiling to `out/` and reloading the extension host.
