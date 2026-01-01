import * as vscode from 'vscode';
import { Token, TokenType, FormatterOptions } from './types';

export class ADLFormattingProvider implements vscode.DocumentFormattingEditProvider {

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
      const tokens = this.tokenize(text);
      return this.formatTokens(tokens);
    } catch (error) {
      console.error('ADL formatting error:', error);
      return text; // Return original text on error
    }
  }

  private tokenize(text: string): Token[] {
    const tokens: Token[] = [];
    const lines = text.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      let line = lines[lineNum];
      let col = 0;

      while (col < line.length) {
        // Skip whitespace
        if (/\s/.test(line[col])) {
          col++;
          continue;
        }

        // Try to match tokens in priority order
        const remaining = line.substring(col);
        let matched = false;

        // 1. Line comment
        if (remaining.startsWith('//')) {
          tokens.push({
            type: TokenType.COMMENT,
            value: remaining,
            originalLine: lineNum
          });
          break; // Rest of line is comment
        }

        // 2. Field comment (in type definitions)
        if (remaining.startsWith('#')) {
          tokens.push({
            type: TokenType.FIELD_COMMENT,
            value: remaining,
            originalLine: lineNum
          });
          break;
        }

        // 3. Strings (double-quoted)
        if (!matched && remaining.startsWith('"')) {
          const match = remaining.match(/^"(\\.|[^"\\])*"/);
          if (match) {
            tokens.push({
              type: TokenType.STRING,
              value: match[0],
              originalLine: lineNum
            });
            col += match[0].length;
            matched = true;
          }
        }

        // 4. Template strings (backtick)
        if (!matched && remaining.startsWith('`')) {
          const match = remaining.match(/^`(\\.|[^`\\])*`/);
          if (match) {
            tokens.push({
              type: TokenType.STRING,
              value: match[0],
              originalLine: lineNum
            });
            col += match[0].length;
            matched = true;
          }
        }

        // 5. Keywords
        if (!matched) {
          const keywordMatch = remaining.match(/^(def|type|match|if|while|for|return)\b/);
          if (keywordMatch) {
            const keyword = keywordMatch[1];
            let tokenType: TokenType;
            switch (keyword) {
              case 'def': tokenType = TokenType.DEF; break;
              case 'type': tokenType = TokenType.TYPE; break;
              case 'match': tokenType = TokenType.MATCH; break;
              case 'if': tokenType = TokenType.IF; break;
              case 'while': tokenType = TokenType.WHILE; break;
              case 'for': tokenType = TokenType.FOR; break;
              case 'return': tokenType = TokenType.RETURN; break;
              default: tokenType = TokenType.IDENTIFIER;
            }
            tokens.push({ type: tokenType, value: keyword, originalLine: lineNum });
            col += keyword.length;
            matched = true;
          }
        }

        // 6. Operators (multi-char first)
        if (!matched) {
          if (remaining.startsWith('::')) {
            tokens.push({ type: TokenType.TYPE_ANNOTATION, value: '::', originalLine: lineNum });
            col += 2;
            matched = true;
          } else if (remaining.startsWith('=>')) {
            tokens.push({ type: TokenType.ARROW, value: '=>', originalLine: lineNum });
            col += 2;
            matched = true;
          } else if (remaining.startsWith('=')) {
            tokens.push({ type: TokenType.ASSIGNMENT, value: '=', originalLine: lineNum });
            col += 1;
            matched = true;
          } else if (remaining.startsWith('|')) {
            tokens.push({ type: TokenType.UNION, value: '|', originalLine: lineNum });
            col += 1;
            matched = true;
          } else if (remaining.startsWith(':')) {
            tokens.push({ type: TokenType.COLON, value: ':', originalLine: lineNum });
            col += 1;
            matched = true;
          } else if (remaining.startsWith(',')) {
            tokens.push({ type: TokenType.COMMA, value: ',', originalLine: lineNum });
            col += 1;
            matched = true;
          } else if (remaining.startsWith(';')) {
            tokens.push({ type: TokenType.SEMICOLON, value: ';', originalLine: lineNum });
            col += 1;
            matched = true;
          } else if (remaining.startsWith('.')) {
            tokens.push({ type: TokenType.DOT, value: '.', originalLine: lineNum });
            col += 1;
            matched = true;
          }
        }

        // 7. Braces and parentheses
        if (!matched) {
          if (remaining.startsWith('{')) {
            tokens.push({ type: TokenType.OPEN_BRACE, value: '{', originalLine: lineNum });
            col += 1;
            matched = true;
          } else if (remaining.startsWith('}')) {
            tokens.push({ type: TokenType.CLOSE_BRACE, value: '}', originalLine: lineNum });
            col += 1;
            matched = true;
          } else if (remaining.startsWith('(')) {
            tokens.push({ type: TokenType.OPEN_PAREN, value: '(', originalLine: lineNum });
            col += 1;
            matched = true;
          } else if (remaining.startsWith(')')) {
            tokens.push({ type: TokenType.CLOSE_PAREN, value: ')', originalLine: lineNum });
            col += 1;
            matched = true;
          }
        }

        // 8. Identifiers (alphanumeric + underscore)
        if (!matched) {
          const match = remaining.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
          if (match) {
            tokens.push({
              type: TokenType.IDENTIFIER,
              value: match[0],
              originalLine: lineNum
            });
            col += match[0].length;
            matched = true;
          }
        }

        // 9. Other (punctuation, etc.)
        if (!matched) {
          const match = remaining.match(/^[^\s]+/);
          if (match) {
            tokens.push({
              type: TokenType.OTHER,
              value: match[0][0],
              originalLine: lineNum
            });
            col += 1;
          } else {
            col++; // Skip unknown character
          }
        }
      }

      // Add newline token at end of each line (except last)
      if (lineNum < lines.length - 1) {
        tokens.push({ type: TokenType.NEWLINE, value: '\n', originalLine: lineNum });
      }
    }

    return tokens;
  }

  private formatTokens(tokens: Token[]): string {
    const options: FormatterOptions = {
      indentSize: 2,
      spaceAroundOperators: true,
      maxEmptyLines: 1
    };

    let result = '';
    let indentLevel = 0;
    let currentLine = '';
    let needsIndent = true;
    let consecutiveNewlines = 0;
    let lastToken: Token | null = null;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const nextToken = i < tokens.length - 1 ? tokens[i + 1] : null;

      // Handle newlines
      if (token.type === TokenType.NEWLINE) {
        result += currentLine.trimEnd() + '\n';
        currentLine = '';
        needsIndent = true;
        consecutiveNewlines++;

        // Limit consecutive empty lines
        if (consecutiveNewlines > options.maxEmptyLines &&
            nextToken && nextToken.type === TokenType.NEWLINE) {
          lastToken = token;
          continue; // Skip this newline
        }

        lastToken = token;
        continue;
      }

      // Reset consecutive newlines counter (we've already handled newlines above)
      consecutiveNewlines = 0;

      // Handle closing braces (dedent before adding)
      if (token.type === TokenType.CLOSE_BRACE) {
        indentLevel = Math.max(0, indentLevel - 1);
        needsIndent = true;
        currentLine = ''; // Re-indent the line
      }

      // Add indentation if needed
      if (needsIndent) {
        currentLine = ' '.repeat(indentLevel * options.indentSize);
        needsIndent = false;
      }

      // Add spacing before token
      if (this.needsSpaceBefore(token, lastToken, options)) {
        currentLine += ' ';
      }

      // Add token
      currentLine += token.value;

      // Handle indentation increases (after adding token)
      if (token.type === TokenType.OPEN_BRACE) {
        indentLevel++;
      }

      // Add spacing after token
      if (this.needsSpaceAfter(token, nextToken, options)) {
        currentLine += ' ';
      }

      lastToken = token;
    }

    // Add final line if non-empty
    if (currentLine.trim().length > 0) {
      result += currentLine.trimEnd();
    }

    // Ensure file ends with newline
    if (!result.endsWith('\n')) {
      result += '\n';
    }

    return result;
  }

  private needsSpaceBefore(
    token: Token,
    lastToken: Token | null,
    options: FormatterOptions
  ): boolean {
    if (!lastToken || !options.spaceAroundOperators) return false;

    // No space after these tokens
    const noSpaceAfter = [
      TokenType.OPEN_PAREN,
      TokenType.OPEN_BRACE,
    ];

    // No space before these tokens
    const noSpaceBefore = [
      TokenType.CLOSE_PAREN,
      TokenType.CLOSE_BRACE,
      TokenType.NEWLINE,
      TokenType.COMMA,
      TokenType.SEMICOLON,
      TokenType.COLON,
      TokenType.DOT,
    ];

    if (noSpaceBefore.includes(token.type)) return false;
    if (noSpaceAfter.includes(lastToken.type)) return false;

    // Space before operators
    if ([TokenType.ASSIGNMENT, TokenType.TYPE_ANNOTATION, TokenType.UNION, TokenType.ARROW].includes(token.type)) {
      return true;
    }

    // Space after operators
    if ([TokenType.ASSIGNMENT, TokenType.TYPE_ANNOTATION, TokenType.UNION, TokenType.ARROW].includes(lastToken.type)) {
      return true;
    }

    // Space after keywords
    if ([TokenType.DEF, TokenType.TYPE, TokenType.MATCH, TokenType.IF, TokenType.WHILE, TokenType.FOR, TokenType.RETURN].includes(lastToken.type)) {
      return true;
    }

    // Space after comma
    if (lastToken.type === TokenType.COMMA) {
      return true;
    }

    // Space between identifiers
    if (lastToken.type === TokenType.IDENTIFIER && token.type === TokenType.IDENTIFIER) {
      return true;
    }

    // Space before opening paren after identifier (function call)
    if (lastToken.type === TokenType.IDENTIFIER && token.type === TokenType.OPEN_PAREN) {
      return false; // No space for function calls
    }

    return false;
  }

  private needsSpaceAfter(
    token: Token,
    nextToken: Token | null,
    options: FormatterOptions
  ): boolean {
    // Space handling is primarily done in needsSpaceBefore
    // This method is kept for potential future enhancements
    return false;
  }
}
