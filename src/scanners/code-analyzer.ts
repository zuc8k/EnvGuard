/**
 * SecretScope — Source code analyzer.
 *
 * Extracts environment variable references from TypeScript and
 * JavaScript source files using ts-morph (AST only, no type checking).
 *
 * Supported patterns:
 *   1. process.env.VAR
 *   2. process.env['VAR']
 *   3. import.meta.env.VAR
 *   4. const { VAR } = process.env
 *   5. const { VAR: alias } = process.env   (real VAR, stored as alias)
 *   6. const { A, B } = import.meta.env
 *
 * Explicitly NOT supported (documented limitations):
 *   - Computed keys:        process.env[key]        (unknown at parse time)
 *   - Deep chains:          global.process.env.VAR  (rare, ambiguous)
 *   - Casts:                (process.env as X).VAR  (changes static type)
 *   - Dataflow aliases:     const e = process.env; e.VAR
 *   - String-key destructure: const { 'A-B': x } = process.env
 *
 * These limitations are by design: we prefer a high signal-to-noise
 * ratio over an aggressive matcher that produces false positives.
 */

import {
  Node,
  SyntaxKind,
  type ElementAccessExpression,
  type Project,
  type PropertyAccessExpression,
  type SourceFile,
  type VariableDeclaration,
} from 'ts-morph';

import type { CodeReference } from '../core/types.js';
import { toRelativePath } from '../utils/fs-safe.js';
import { createAstProject } from '../utils/ts-project.js';
import {
  detectEnvSource,
  isValidEnvVarName,
  unwrapExpression,
  type EnvSource,
} from './env-access-patterns.js';

/** How a reference was accessed. */
type Via = EnvSource | 'destructuring';

export interface CodeAnalyzerOptions {
  /** Project root, used to render relative paths in reports. */
  root: string;
  /**
   * Optional pre-built ts-morph Project. Useful for tests or for
   * sharing the Project across multiple analyzers.
   */
  project?: Project;
}

export interface CodeAnalysisResult {
  references: CodeReference[];
  warnings: string[];
}

export class CodeAnalyzer {
  private readonly project: Project;
  private readonly root: string;

  constructor(options: CodeAnalyzerOptions) {
    this.root = options.root;
    this.project = options.project ?? createAstProject();
  }

  /**
   * Analyzes one source file. Never throws on parse errors: they are
   * returned as warnings so a single broken file cannot crash a scan.
   */
  analyze(filePath: string, content: string): CodeAnalysisResult {
    const displayPath = toRelativePath(this.root, filePath);

    let sourceFile: SourceFile | undefined;
    try {
      sourceFile = this.project.createSourceFile(filePath, content, {
        overwrite: true,
      });
      return this.analyzeSourceFile(sourceFile, displayPath);
    } catch (err) {
      return {
        references: [],
        warnings: [
          `Failed to parse ${displayPath}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ],
      };
    } finally {
      if (sourceFile) {
        try {
          this.project.removeSourceFile(sourceFile);
        } catch {
          // Cleanup failures must never mask the analysis result.
        }
      }
    }
  }

  private analyzeSourceFile(
    sourceFile: SourceFile,
    displayPath: string,
  ): CodeAnalysisResult {
    const references: CodeReference[] = [];
    const warnings: string[] = [];

    for (const node of sourceFile.getDescendantsOfKind(
      SyntaxKind.PropertyAccessExpression,
    )) {
      const ref = this.matchPropertyAccess(node, displayPath);
      if (ref !== null) references.push(ref);
    }

    for (const node of sourceFile.getDescendantsOfKind(
      SyntaxKind.ElementAccessExpression,
    )) {
      const ref = this.matchElementAccess(node, displayPath);
      if (ref !== null) references.push(ref);
    }

    for (const node of sourceFile.getDescendantsOfKind(
      SyntaxKind.VariableDeclaration,
    )) {
      references.push(...this.matchDestructuring(node, displayPath));
    }

    return { references, warnings };
  }

  /**
   * Matches `process.env.X` and `import.meta.env.X`.
   *
   * The outer node is `X.env` style: name = "X" (the env var), and its
   * inner expression is `process.env` or `import.meta.env`.
   */
  private matchPropertyAccess(
    node: PropertyAccessExpression,
    displayPath: string,
  ): CodeReference | null {
    const name = node.getName();
    if (!isValidEnvVarName(name)) return null;

    const inner = unwrapExpression(node.getExpression());
    if (!Node.isPropertyAccessExpression(inner)) return null;
    if (inner.getName() !== 'env') return null;

    const via = detectEnvSource(unwrapExpression(inner.getExpression()));
    if (via === null) return null;

    return this.toReference(name, node, displayPath, via);
  }

  /**
   * Matches `process.env['X']` and `import.meta.env['X']`.
   * Only string-literal keys are supported; computed keys are skipped.
   */
  private matchElementAccess(
    node: ElementAccessExpression,
    displayPath: string,
  ): CodeReference | null {
    const arg = node.getArgumentExpression();
    if (!arg) return null;

    const literal = arg.asKind(SyntaxKind.StringLiteral);
    if (!literal) return null;

    const name = literal.getLiteralValue();
    if (!isValidEnvVarName(name)) return null;

    const expr = unwrapExpression(node.getExpression());
    if (!Node.isPropertyAccessExpression(expr)) return null;
    if (expr.getName() !== 'env') return null;

    const via = detectEnvSource(unwrapExpression(expr.getExpression()));
    if (via === null) return null;

    return this.toReference(name, node, displayPath, via);
  }

  /**
   * Matches destructuring forms:
   *   const { A, B } = process.env
   *   const { A: alias } = import.meta.env
   *   const { A, ...rest } = process.env    (rest is ignored)
   */
  private matchDestructuring(
    node: VariableDeclaration,
    displayPath: string,
  ): CodeReference[] {
    const initializer = node.getInitializer();
    if (!initializer) return [];

    const pattern = node
      .getNameNode()
      .asKind(SyntaxKind.ObjectBindingPattern);
    if (!pattern) return [];

    let via: EnvSource | null = null;
    const unwrapped = unwrapExpression(initializer);
    if (
      Node.isPropertyAccessExpression(unwrapped) &&
      unwrapped.getName() === 'env'
    ) {
      via = detectEnvSource(unwrapExpression(unwrapped.getExpression()));
    }
    if (via === null) return [];

    const references: CodeReference[] = [];
    for (const element of pattern.getElements()) {
      // Skip `...rest` captures.
      if (element.getDotDotDotToken()) continue;

      const propertyName = element.getPropertyNameNode();
      const varName = element.getNameNode();

      if (propertyName) {
        // `const { REAL: alias } = ...` — the env var is REAL.
        if (!Node.isIdentifier(propertyName)) continue;
        const realName = propertyName.getText();
        if (isValidEnvVarName(realName)) {
          references.push(
            this.toReference(realName, element, displayPath, 'destructuring'),
          );
        }
        continue;
      }

      // `const { NAME } = ...` — the env var is NAME.
      if (Node.isIdentifier(varName)) {
        const name = varName.getText();
        if (isValidEnvVarName(name)) {
          references.push(
            this.toReference(name, element, displayPath, 'destructuring'),
          );
        }
      }
    }

    return references;
  }

  private toReference(
    name: string,
    node: Node,
    displayPath: string,
    via: Via,
  ): CodeReference {
    const sourceFile = node.getSourceFile();
    const start = node.getStart();
    const line = node.getStartLineNumber();
    const fullText = sourceFile.getFullText();
    const lineStart = fullText.lastIndexOf('\n', start - 1) + 1;
    const column = start - lineStart + 1;
    return { name, file: displayPath, line, column, via };
  }
}