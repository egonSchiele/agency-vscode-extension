# Agency VS Code Extension

## Project Overview

This is a VS Code extension that provides language support for the **Agency language** (`.agency` files). Agency is a custom language for defining agents with LLM integration, async/await, streaming, and type definitions.

The extension provides:
- **LSP client** connecting to the `agency lsp` server for rich language features
- **Syntax highlighting** via TextMate grammar
- **CLI-based fallback** providers for formatting, diagnostics, and go-to-definition (used when the LSP server fails to start)
- **Language configuration** (bracket matching, auto-closing, comments)

## Architecture

### LSP-First with CLI Fallback

The extension starts an LSP client that connects to `agency lsp` over stdio. If the LSP server fails to start or crashes, it falls back to CLI-based providers that shell out to the `agency-lang` CLI.

**LSP mode** (primary) provides:
- Inline diagnostics (parse errors, type errors, unresolved imports)
- Go-to-definition (functions, nodes, type aliases)
- Hover info (symbol kind and parameter list)
- Autocomplete (triggered on `.`)
- Document outline/symbols
- Document formatting

**Fallback mode** (when LSP fails) provides:
- CLI-based diagnostics, formatting, and go-to-definition

### How the LSP client works

1. On activation (`onLanguage:agency`), the extension spawns the LSP server using the configured command (default: `pnpm run --silent agency lsp`)
2. The `LanguageClient` connects over stdio using JSON-RPC
3. If the client transitions to `Stopped` state, the fallback CLI-based providers are registered instead
4. The client watches for `**/agency.json` changes and notifies the server

### User-configurable settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `agency.lsp.command` | string | `"pnpm run --silent agency"` | Command to run the Agency CLI. `lsp` is appended automatically. Examples: `"agency"`, `"/usr/local/bin/agency"`, `"npx agency"` |
| `agency.formatOnSave` | boolean | `false` | Auto-format on save (fallback mode only) |

### Dependencies
- **`agency-lang`** npm package — the language implementation (parser, compiler, runtime, formatter, diagnostics, LSP server)
- **`vscode-languageclient`** v9 — official VS Code LSP client library

## File Structure

```
src/
├── extension.ts      # Entry point: starts LSP client, falls back to CLI providers
├── formatter.ts      # Fallback: DocumentFormattingEditProvider (shells out to CLI)
├── diagnostics.ts    # Fallback: Diagnostic provider (shells out to CLI)
└── definition.ts     # Fallback: DefinitionProvider (shells out to CLI)

syntaxes/
└── agency.tmLanguage.json  # TextMate grammar for syntax highlighting

language-configuration.json  # VS Code language config (brackets, comments, etc.)
package.json                 # Extension manifest
tsconfig.json                # TypeScript config (compiles src/ → out/)
```

### Key Files

**`src/extension.ts`**
- Activates on `onLanguage:agency` (when a `.agency` file is opened)
- Reads `agency.lsp.command` setting, splits into command + args, appends `"lsp"`
- Creates and starts a `LanguageClient` over stdio
- On `State.Stopped`, calls `activateFallbackProviders()` to register CLI-based providers
- `deactivate()` stops the client

**`src/formatter.ts`** (fallback only)
- Implements `DocumentFormattingEditProvider`
- Shells out to `pnpm agency fmt` with document content via stdin
- Strips pnpm header lines from stdout (first 3 lines)
- Returns formatted text or original text on error

**`src/diagnostics.ts`** (fallback only)
- Creates a `DiagnosticCollection` for showing error squiggles
- Listens to `onDidChangeTextDocument`, `onDidOpenTextDocument`, `onDidCloseTextDocument`
- Debounces updates by 300ms to avoid running on every keystroke
- Shells out to `pnpm agency diagnostics` with stdin
- Parses JSON output and creates VS Code `Diagnostic` objects

**`src/definition.ts`** (fallback only)
- Implements `DefinitionProvider`
- Shells out to `pnpm agency definition` with file, line, and column args
- Parses JSON output and returns a `Location`

**`syntaxes/agency.tmLanguage.json`**
- TextMate grammar defining syntax highlighting rules
- Always active regardless of LSP or fallback mode

## Development Workflow

### Building
```bash
pnpm run build    # or: tsc
```
Compiles TypeScript from `src/` to `out/` (configured in `tsconfig.json`).

### Watch Mode
```bash
pnpm run watch    # or: tsc -watch
```
Auto-recompiles on file changes.

### Testing Changes
1. Make code changes
2. Run `pnpm run build` (or rely on watch mode)
3. In VS Code, press `Cmd+Shift+P` → **"Developer: Reload Window"**
4. Open a `.agency` file to test

### Debugging
- Press `Cmd+Shift+P` → **"Developer: Toggle Developer Tools"**
- Check the Console tab for `console.log` and errors
- The extension logs "Agency extension is now active" on activation
- If LSP fails: console shows "Agency LSP server failed to start or crashed. Falling back to CLI-based providers."

### Checking if LSP is active
- **Hover** over a function/node/type name — tooltip with type info means LSP is working
- **Autocomplete** — type `.` after an identifier for suggestions (LSP only)
- **Outline panel** — `Cmd+Shift+P` → "Focus on Outline View" shows symbols (LSP only)
- If none of these work, the extension is in fallback mode

## Important Patterns

### pnpm `--silent` flag for LSP
The LSP server communicates over stdio (JSON-RPC on stdin/stdout). When running through pnpm, the `--silent` flag is required to prevent pnpm from adding header lines to stdout, which would corrupt the JSON-RPC stream.

### pnpm Stdout Header Issue (fallback mode)
When calling `pnpm run agency <command>` without `--silent`, pnpm prefixes stdout with header lines. The fallback formatter and diagnostics handle this:

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

### Debouncing Diagnostics (fallback mode)
Diagnostics are debounced by 300ms to avoid running the CLI on every keystroke:
```ts
debounceTimer = setTimeout(() => updateDiagnostics(document), 300);
```

## Common Tasks

### Adding New Language Features
1. **Syntax highlighting**: Edit `syntaxes/agency.tmLanguage.json`
2. **LSP features** (formatting, diagnostics, hover, completion, etc.): Update `agency-lang` package — the LSP server handles these
3. **Fallback providers**: Edit `formatter.ts`, `diagnostics.ts`, or `definition.ts`

### Updating the `agency-lang` Dependency
```bash
pnpm update agency-lang
```
Then rebuild and reload.

### Publishing the Extension
```bash
pnpm run vscode:prepublish  # Runs build
vsce package                # Creates .vsix file
vsce publish                # Publishes to marketplace
```

## Extension Activation

- **When**: `onLanguage:agency` (when a `.agency` file is opened)
- **Language ID**: `agency`
- **File Extension**: `.agency`
- **Entry Point**: `./out/extension.js` (compiled from `src/extension.ts`)

## Guidelines for Future Changes

- **LSP-first**: New language features should be added to the `agency-lang` LSP server, not as client-side providers in this extension.
- **Keep fallback providers**: The CLI-based fallback providers ensure basic functionality even without the LSP server.
- **Handle pnpm headers**: In fallback mode, always strip pnpm output headers when parsing stdout.
- **Use `--silent` for LSP**: The default `agency.lsp.command` must use `pnpm run --silent` to prevent stdout corruption.
- **Never skip the build**: Changes to `src/` only take effect after compiling to `out/` and reloading the extension host.
