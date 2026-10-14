/**
 * MathExpressionEvaluator: Safe, AST-free recursive descent mathematical expression evaluator.
 * Strictly avoids eval() and new Function() to eliminate Remote Code Execution and prototype attacks.
 * Features:
 * - Arithmetic (+, -, *, /, ^, %)
 * - Standard functions: min, max, round, abs, clamp, sqrt, floor, ceil
 * - Relational conditionals: ?, :, >, <, >=, <=, ==, !=
 * - Variable identifier resolution from values dictionary
 * - Zero-division safe: returns 0 or fallback rather than Infinity
 * - ReDoS immune: uses simple character-by-character token scanning
 */
export class MathExpressionEvaluator {
  /**
   * Evaluates a formula string given a context values dictionary.
   */
  public static evaluate(
    expression: string,
    values: Record<string, unknown> = {},
    fallback = 0,
  ): number {
    const expr = (expression || '').trim();
    if (!expr) return fallback;

    try {
      const tokens = this.tokenize(expr);
      if (tokens.length === 0) return fallback;

      const parser = new ExpressionParser(tokens, values);
      const result = parser.parseExpression();
      if (!parser.isDone()) {
        return fallback;
      }
      if (typeof result !== 'number' || Number.isNaN(result) || !Number.isFinite(result)) {
        return fallback;
      }
      return result;
    } catch {
      return fallback;
    }
  }

  private static tokenize(expr: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;

    while (i < expr.length) {
      const ch = expr[i];

      // Whitespace
      if (/\s/.test(ch)) {
        i++;
        continue;
      }

      // Numbers
      if (/[0-9]/.test(ch) || (ch === '.' && i + 1 < expr.length && /[0-9]/.test(expr[i + 1]))) {
        let numStr = '';
        while (i < expr.length && /[0-9.]/.test(expr[i])) {
          numStr += expr[i];
          i++;
        }
        tokens.push({ type: 'number', value: parseFloat(numStr) });
        continue;
      }

      // Two-character operators
      const two = expr.slice(i, i + 2);
      if (two === '==' || two === '!=' || two === '<=' || two === '>=') {
        tokens.push({ type: 'op', value: two });
        i += 2;
        continue;
      }

      // Single-character operators & delimiters
      if ('+-*/^%()?:,><'.includes(ch)) {
        tokens.push({ type: 'op', value: ch });
        i++;
        continue;
      }

      // Identifiers & Functions (letters, underscores, dots)
      if (/[A-Za-z_]/.test(ch)) {
        let ident = '';
        while (i < expr.length && /[A-Za-z0-9_.]/.test(expr[i])) {
          ident += expr[i];
          i++;
        }
        tokens.push({ type: 'ident', value: ident });
        continue;
      }

      // Unrecognized character, skip safely
      i++;
    }

    return tokens;
  }
}

type TokenType = 'number' | 'ident' | 'op';

interface Token {
  type: TokenType;
  value: string | number;
}

class ExpressionParser {
  private tokens: Token[];
  private pos = 0;
  private values: Record<string, unknown>;

  constructor(tokens: Token[], values: Record<string, unknown>) {
    this.tokens = tokens;
    this.values = values;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token | undefined {
    return this.tokens[this.pos++];
  }

  public isDone(): boolean {
    return this.pos >= this.tokens.length;
  }

  public parseExpression(): number {
    return this.parseConditional();
  }

  // Ternary: condition ? trueExpr : falseExpr
  private parseConditional(): number {
    let expr = this.parseRelational();

    if (this.peek()?.value === '?') {
      this.consume(); // eat '?'
      const trueVal = this.parseConditional();
      if (this.peek()?.value === ':') {
        this.consume(); // eat ':'
        const falseVal = this.parseConditional();
        return expr !== 0 ? trueVal : falseVal;
      }
      return expr !== 0 ? trueVal : 0;
    }

    return expr;
  }

  // Relational: >, <, >=, <=, ==, !=
  private parseRelational(): number {
    let left = this.parseAdditive();

    while (this.peek()?.type === 'op' && ['>', '<', '>=', '<=', '==', '!='].includes(String(this.peek()?.value))) {
      const op = String(this.consume()?.value);
      const right = this.parseAdditive();
      switch (op) {
        case '>':
          left = left > right ? 1 : 0;
          break;
        case '<':
          left = left < right ? 1 : 0;
          break;
        case '>=':
          left = left >= right ? 1 : 0;
          break;
        case '<=':
          left = left <= right ? 1 : 0;
          break;
        case '==':
          left = left === right ? 1 : 0;
          break;
        case '!=':
          left = left !== right ? 1 : 0;
          break;
      }
    }

    return left;
  }

  // Additive: +, -
  private parseAdditive(): number {
    let left = this.parseMultiplicative();

    while (this.peek()?.type === 'op' && (this.peek()?.value === '+' || this.peek()?.value === '-')) {
      const op = this.consume()?.value;
      const right = this.parseMultiplicative();
      if (op === '+') {
        left += right;
      } else {
        left -= right;
      }
    }

    return left;
  }

  // Multiplicative: *, /, %
  private parseMultiplicative(): number {
    let left = this.parseExponent();

    while (this.peek()?.type === 'op' && (this.peek()?.value === '*' || this.peek()?.value === '/' || this.peek()?.value === '%')) {
      const op = this.consume()?.value;
      const right = this.parseExponent();
      if (op === '*') {
        left *= right;
      } else if (op === '/') {
        left = right === 0 ? 0 : left / right; // Zero-division safe
      } else if (op === '%') {
        left = right === 0 ? 0 : left % right;
      }
    }

    return left;
  }

  // Exponent: ^
  private parseExponent(): number {
    let left = this.parseUnary();

    if (this.peek()?.type === 'op' && this.peek()?.value === '^') {
      this.consume();
      const right = this.parseUnary();
      // Bound exponentiation to prevent CPU freezing
      const clampedExp = Math.min(Math.max(right, -100), 100);
      left = Math.pow(left, clampedExp);
    }

    return left;
  }

  // Unary: -x, +x
  private parseUnary(): number {
    if (this.peek()?.type === 'op' && this.peek()?.value === '-') {
      this.consume();
      return -this.parseUnary();
    }
    if (this.peek()?.type === 'op' && this.peek()?.value === '+') {
      this.consume();
      return this.parseUnary();
    }
    return this.parsePrimary();
  }

  // Primary: number, (expr), function(expr), variable
  private parsePrimary(): number {
    const tok = this.consume();
    if (!tok) return 0;

    if (tok.type === 'number') {
      return Number(tok.value);
    }

    if (tok.type === 'op' && tok.value === '(') {
      const val = this.parseExpression();
      if (this.peek()?.value === ')') {
        this.consume(); // eat ')'
        return val;
      }
      throw new Error('Unclosed parenthesis');
    }

    if (tok.type === 'op') {
      throw new Error(`Unexpected operator token: ${tok.value}`);
    }

    if (tok.type === 'ident') {
      const name = String(tok.value);

      // Function call
      if (this.peek()?.value === '(') {
        this.consume(); // eat '('
        const args: number[] = [];
        if (this.peek()?.value !== ')') {
          args.push(this.parseExpression());
          while (this.peek()?.value === ',') {
            this.consume(); // eat ','
            args.push(this.parseExpression());
          }
        }
        if (this.peek()?.value === ')') {
          this.consume(); // eat ')'
        } else {
          throw new Error('Unclosed function parenthesis');
        }
        return this.evalFunction(name.toLowerCase(), args);
      }

      // Variable identifier lookup (e.g. 'income' or 'values.income')
      return this.resolveIdentifier(name);
    }

    return 0;
  }

  private evalFunction(fnName: string, args: number[]): number {
    const ALLOWED = new Set(['min', 'max', 'round', 'floor', 'ceil', 'abs', 'sqrt', 'clamp']);
    if (!ALLOWED.has(fnName)) {
      return 0;
    }

    switch (fnName) {
      case 'min':
        return args.length > 0 ? Math.min(...args) : 0;
      case 'max':
        return args.length > 0 ? Math.max(...args) : 0;
      case 'round':
        return args.length > 0 ? Math.round(args[0]) : 0;
      case 'floor':
        return args.length > 0 ? Math.floor(args[0]) : 0;
      case 'ceil':
        return args.length > 0 ? Math.ceil(args[0]) : 0;
      case 'abs':
        return args.length > 0 ? Math.abs(args[0]) : 0;
      case 'sqrt':
        return args.length > 0 ? (args[0] < 0 ? 0 : Math.sqrt(args[0])) : 0;
      case 'clamp':
        if (args.length >= 3) {
          const [val, minVal, maxVal] = args;
          return Math.min(Math.max(val, minVal), maxVal);
        }
        return args[0] || 0;
      default:
        return 0;
    }
  }

  private resolveIdentifier(ident: string): number {
    const DANGEROUS = new Set([
      '__proto__',
      'constructor',
      'prototype',
      'window',
      'process',
      'global',
      'globalthis',
      'document',
    ]);
    const rootName = ident.toLowerCase().split('.')[0];
    if (DANGEROUS.has(rootName)) {
      return 0;
    }

    // Strip optional "values." prefix
    const cleanIdent = ident.startsWith('values.') ? ident.slice(7) : ident;
    const rawVal = this.values[cleanIdent];

    if (typeof rawVal === 'number' && !Number.isNaN(rawVal)) {
      return rawVal;
    }
    if (typeof rawVal === 'string') {
      const parsed = parseFloat(rawVal.replace(/[^0-9.-]/g, ''));
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    if (typeof rawVal === 'boolean') {
      return rawVal ? 1 : 0;
    }
    return 0;
  }
}
