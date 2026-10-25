# Architecture

This document describes the module layout, data flow, and security invariants of
SecretScope `0.1.x`.

## Goals

- **Correctness over cleverness.** A missed finding is a limitation; a leaked
  secret or a silent file write is a bug.
- **Small surface.** Few dependencies, few files, each with one responsibility.
- **Deterministic output.** Same input → same report, in the same order.
- **Local-first.** No network, no telemetry, no external API.

## Module layout

```
src/
├── cli/
│   ├── index.ts            # Executable entry point (bin)
│   └── options.ts          # Zod schema for CLI options
├── core/
│   ├── differ.ts           # Compares env sets vs code refs
│   ├── patterns.ts         # Shared constants (ignore dirs, env names)
│   ├── redactor.ts         # maskValue, redactText, isLikelyMasked
│   ├── scanner.ts          # Orchestrator: builds a ScanReport
│   └── types.ts            # Shared type declarations
├── scanners/
│   ├── code-analyzer.ts    # AST-based env reference extraction
│   ├── env-access-patterns.ts  # AST helpers for env access
│   ├── env-parser.ts       # .env parser (names only, never values)
│   ├── gitignore-checker.ts    # .gitignore + `git ls-files` check
│   └── secret-scanner.ts   # Applies SECRET_RULES to file content
├── rules/
│   └── secrets.ts          # Secret detection patterns
├── reporters/
│   ├── console-reporter.ts # Human-readable text
│   ├── json-reporter.ts    # Structured JSON
│   └── sarif-reporter.ts   # SARIF 2.1.0
├── fixers/
│   └── env-example-fixer.ts    # Pure proposal logic for .env.example
├── utils/
│   ├── file-resolver.ts    # Glob-based discovery with default ignores
│   ├── fs-safe.ts          # Size-limited file reads, path normalization
│   ├── logger.ts           # stderr-only logger
│   └── ts-project.ts       # ts-morph Project factory
└── index.ts                # Public library API
```

## Layers

**Layer 1 — Entry points.** `src/cli/index.ts` (user-facing) and `src/index.ts`
(library API). The CLI is a thin wrapper: parse args, call the Scanner, format
the report, set exit code. The library exposes the same functionality for
programmatic use.

**Layer 2 — Orchestration.** `src/core/scanner.ts` is the only place that
coordinates multiple scanners. It discovers files, reads each one once, passes
the content to every relevant scanner, and merges findings.

**Layer 3 — Scanners.** Each scanner does one thing:
- `env-parser` extracts variable names from `.env` content.
- `code-analyzer` extracts `process.env` and `import.meta.env` references from
  JS/TS content using ts-morph.
- `secret-scanner` applies regex rules to any text content.
- `gitignore-checker` inspects `.gitignore` and Git tracking state.

**Layer 4 — Analysis.** `src/core/differ.ts` is pure logic: given three input
lists, it produces classified findings. No I/O.

**Layer 5 — Reporting.** Three reporters produce different serializations of the
same `ScanReport`. They never modify the report.

**Layer 6 — Fixers.** `src/fixers/env-example-fixer.ts` is pure logic. It
computes a proposal and never touches disk.

## Data flow

```
                        ┌──────────────────┐
                        │   CLI (index.ts) │
                        └────────┬─────────┘
                                 │ parse & validate (options.ts)
                                 ▼
                        ┌──────────────────┐
                        │   Scanner.scan() │
                        └────────┬─────────┘
                                 │
        ┌────────────────────────┼────────────────────────────┐
        ▼                        ▼                            ▼
 findEnvFiles()           findSourceFiles()             GitignoreChecker
        │                        │                            │
        ▼                        ▼                            ▼
  readTextFile()           readTextFile()                findings
        │                        │
        ├─> EnvParser ──┐        ├─> CodeAnalyzer ──┐
        ├─> SecretScanner ─┐     ├─> SecretScanner ─┐│
        │                  │     │                  ││
        ▼                  ▼     ▼                  ▼▼
   envEntries        secretF  codeRefs          secretF
        │                        │
        └────────────┬───────────┘
                     ▼
              Differ.compareEnvironment()
                     │
                     ▼
              ┌──────────────┐
              │  ScanReport  │
              └──────┬───────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
   Console       JSON         SARIF
   reporter      reporter     reporter
```

### Key flow notes

1. **Each file is read once.** The content is passed to the env parser and secret
   scanner (for `.env` files), or to the code analyzer and secret scanner (for
   source files). This avoids redundant I/O on large projects.
2. **Env-parser never returns values.** Only names and line numbers. This is by
   design: a secret in a `.env` value must never enter the analysis pipeline as
   data.
3. **The differ is pure.** It receives parsed inputs and produces findings with
   no side effects. This makes it trivially testable.
4. **Reporters are read-only.** They serialize; they do not modify the report.

## Security invariants

These are enforced by tests. See `tests/security/` for the concrete assertions.

1. **`maskValue()` is called before any secret appears in a `Finding`.**
   In `secret-scanner.ts`, the matched value passes through `maskValue()` and
   the result is stored in `Finding.maskedValue`. The raw value is not stored
   anywhere after the function returns.
2. **`proposeFix()` never performs I/O.** Its signature accepts `existingContent`
   as a string. It returns `updatedContent` as a string. Filesystem writes happen
   only in `src/cli/index.ts` and only when `--yes` is set.
3. **No Git mutation.** The only Git command invoked is
   `git ls-files --error-unmatch -- <path>`, which is read-only.
4. **No network.** No module imports `http`, `https`, `net`, or `fetch`.
5. **Bounded reads.** All reads go through `readTextFile()` in `src/utils/fs-safe.ts`,
   which enforces a size limit before loading content into memory.

## Determinism

To make reports stable across runs and comparable in tests:

- `findFiles` returns paths sorted lexicographically.
- `compareEnvironment` emits findings grouped by category, sorted by name within
  each category.
- `buildRules` in the SARIF reporter preserves first-occurrence order and
  escalates severity deterministically.
- `partialFingerprints` uses SHA-256 over `(ruleId|file|line|maskedValue)`, so
  identical findings produce identical fingerprints.

## What is intentionally not done

- **No type checking.** The code analyzer is AST-only. It does not use a
  TypeChecker from ts-morph. This avoids loading the user's `tsconfig` and keeps
  analysis fast and side-effect free.
- **No import resolution.** The analyzer does not follow imports. A variable
  read in one file is recorded against that file only.
- **No entropy-based detection.** Deliberately conservative for `0.1.x`.
- **No `.env` value retention.** Values are never stored beyond the read buffer.

## Versioning

`VERSION` in `src/core/scanner.ts` and `version` in `package.json` must stay in
sync manually. This is a documented limitation; see `docs/KNOWN_ISSUES.md`.