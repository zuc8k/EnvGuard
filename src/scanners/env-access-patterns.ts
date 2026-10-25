/**
 * SecretScope — AST helpers for environment variable access patterns.
 *
 * These helpers are intentionally small and side-effect free so they
 * can be unit-tested in isolation and reused by any future scanner
 * that needs to reason about `process.env` / `import.meta.env`.
 */

import { Node, SyntaxKind } from 'ts-morph';

/** Conservative env var name pattern: identifier-like, dots allowed. */
const ENV_VAR_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.]*$/;

/** Reject absurdly long identifiers early (defensive). */
const MAX_NAME_LENGTH = 200;

/**
 * Returns true if `name` is a plausible environment variable name.
 * This is a syntactic check, not a semantic one.
 */
export function isValidEnvVarName(name: string): boolean {
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) return false;
  return ENV_VAR_NAME_PATTERN.test(name);
}

/** The two supported sources of environment variables. */
export type EnvSource = 'process.env' | 'import.meta.env';

/**
 * Given the *innermost* expression node of an env access chain,
 * returns which source it represents, or null.
 *
 * Examples:
 *   process.env.VAR         -> innermost = Identifier("process")
 *                              returns "process.env"
 *   import.meta.env.VAR     -> innermost = MetaProperty("import.meta")
 *                              returns "import.meta.env"
 *   global.process.env.VAR  -> innermost = PropertyAccessExpression
 *                              returns null
 */
export function detectEnvSource(innermost: Node): EnvSource | null {
  if (Node.isIdentifier(innermost) && innermost.getText() === 'process') {
    return 'process.env';
  }
  if (
    innermost.getKind() === SyntaxKind.MetaProperty &&
    innermost.getText() === 'import.meta'
  ) {
    return 'import.meta.env';
  }
  return null;
}

/**
 * Strips purely syntactic wrappers that do not change the meaning of
 * an expression for our purposes:
 *
 *   process.env!.VAR   -> the `!` wraps `process.env`
 *   (process.env).VAR  -> the parens wrap `process.env`
 *
 * Does NOT unwrap casts like `(process.env as Env).VAR`, because those
 * change the static type and we are intentionally conservative.
 */
export function unwrapExpression(node: Node): Node {
  let current = node;
  for (;;) {
    const nonNull = current.asKind(SyntaxKind.NonNullExpression);
    if (nonNull) {
      current = nonNull.getExpression();
      continue;
    }
    const paren = current.asKind(SyntaxKind.ParenthesizedExpression);
    if (paren) {
      current = paren.getExpression();
      continue;
    }
    return current;
  }
}