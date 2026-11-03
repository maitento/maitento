/**
 * The `.mtr` tokenizer, matching Maitento's own character for character: `( ) [ ] { } ,` and `@` are tokens of their
 * own, `"..."` is a string (it may run over several lines, and a backslash escapes the next character but stays in the
 * text), `//` at the start of a word begins a comment, and anything else up to whitespace or one of those characters is
 * a word. `=` is not special: `name = value` is three tokens only because of the spaces.
 */
export type TokenKind =
  | "lparen"
  | "rparen"
  | "comma"
  | "comment"
  | "lbrace"
  | "rbrace"
  | "lbracket"
  | "rbracket"
  | "at"
  | "string"
  | "word";

export interface Token {
  kind: TokenKind;
  /** For a string, its text between the quotes (escapes kept as written); otherwise the token as written. */
  value: string;
  start: number;
  /** One past the last character (for a string, past the closing quote). */
  end: number;
  /** A string with no closing quote before the end of the file. */
  unterminated?: boolean;
}

const SINGLE: Record<string, TokenKind> = {
  "(": "lparen",
  ")": "rparen",
  ",": "comma",
  "@": "at",
  "{": "lbrace",
  "}": "rbrace",
  "[": "lbracket",
  "]": "rbracket",
};

/** Characters that end a word. */
const STOP = new Set(["(", ")", "[", "]", "{", "}", ","]);

const isWhitespace = (c: string): boolean => /\s/.test(c);

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (isWhitespace(c)) {
      i++;
      continue;
    }

    const single = SINGLE[c];
    if (single) {
      tokens.push({ kind: single, value: c, start: i, end: i + 1 });
      i++;
      continue;
    }

    if (c === '"') {
      let j = i + 1;
      let backslashes = 0;
      while (j < text.length) {
        const d = text[j]!;
        if (d === '"' && backslashes % 2 === 0) break;
        backslashes = d === "\\" ? backslashes + 1 : 0;
        j++;
      }
      const closed = j < text.length;
      tokens.push({ kind: "string", value: text.slice(i + 1, j), start: i, end: closed ? j + 1 : j, unterminated: !closed || undefined });
      i = closed ? j + 1 : j;
      continue;
    }

    if (c === "/" && text[i + 1] === "/") {
      let j = i + 2;
      while (j < text.length && text[j] !== "\r" && text[j] !== "\n") j++;
      tokens.push({ kind: "comment", value: text.slice(i, j), start: i, end: j });
      i = j;
      continue;
    }

    let j = i + 1;
    while (j < text.length && !isWhitespace(text[j]!) && !STOP.has(text[j]!)) j++;
    tokens.push({ kind: "word", value: text.slice(i, j), start: i, end: j });
    i = j;
  }
  return tokens;
}
