export enum TokenType {
  DEF,
  TYPE,
  MATCH,
  IF,
  WHILE,
  FOR,
  RETURN,
  OPEN_BRACE,
  CLOSE_BRACE,
  OPEN_PAREN,
  CLOSE_PAREN,
  ARROW,
  ASSIGNMENT,
  TYPE_ANNOTATION,
  UNION,
  COLON,
  COMMA,
  SEMICOLON,
  DOT,
  STRING,
  COMMENT,
  FIELD_COMMENT,
  IDENTIFIER,
  NEWLINE,
  OTHER
}

export interface Token {
  type: TokenType;
  value: string;
  originalLine: number;
}

export interface FormatterOptions {
  indentSize: number;
  spaceAroundOperators: boolean;
  maxEmptyLines: number;
}
