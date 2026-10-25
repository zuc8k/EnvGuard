# SecretScope

> Audit your environment variables and secrets — without ever printing their values.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node: >=20](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)

**Status:** pre-release (`0.1.0`). Not yet published to npm. Build from source for now.

SecretScope is a local-first CLI for Node.js and TypeScript projects. It parses your
source code with an AST to discover every environment variable your application
actually reads, compares that set against `.env` and `.env.example`, and reports:

- **missing variables** — read in code, not defined in any `.env` file
- **unused variables** — defined in `.env`, never referenced in analyzed source
- **undocumented variables** — defined in `.env`, absent from `.env.example`
- **likely secret leaks** — from a small set of high-precision patterns (AWS,
  GitHub, OpenAI, Stripe, Slack, Google, npm, Anthropic, private-key headers)
- **`.gitignore` risks** — `.env` exists but is not covered, or is tracked by Git

Output can be rendered as human-readable text, JSON, or **SARIF 2.1.0** for GitHub
Code Scanning.

---

## What SecretScope is, and is not

**It is:**
- A **context-aware** analyzer: it knows which variables your code reads.
- A **complement** to tools like [Gitleaks](https://github.com/gitleaks/gitleaks)
  and [TruffleHog](https://github.com/trufflesecurity/trufflehog), not a replacement.
- Designed to be run locally and in CI without any paid service or API key.

**It is not:**
- A full secret scanner. It uses a small set of high-precision patterns. It will
  **not** catch every possible secret. It never claims to.
- A Git history scanner. It does not look at past commits.
- A replacement for a secret manager. It only audits what is already on disk.

---

## Requirements

- Node.js **≥ 20**
- Git is **optional**. If `git` is not available or the project is not a repository,
  the "tracked in Git" check is skipped with a warning.
- Supported source extensions: `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`

---

## Installation

### From source (current)

```bash
git clone https://github.com/boodyzucks/secretscope.git
cd secretscope
npm install
npm run build
node dist/cli/index.js --help
```

For local development without building:

```bash
npm run dev -- --help
npm run dev -- /path/to/your/project
```

### From npm (once published)

```bash
npm install -g @boodyzucks/secretscope
secretscope --help
```

---

## Usage

### Basic scan

```bash
secretscope /path/to/project
```

If no path is given, the current working directory is scanned.

### Output formats

```bash
secretscope . --format json
secretscope . --format sarif --output report.sarif
```

### Strict CI gating

```bash
secretscope . --strict
```

Exit code `1` if any finding is reported, `0` if the scan is clean, `2` on fatal
errors. Without `--strict`, exit code is `1` only if at least one **error**-severity
finding exists.

### Fixing `.env.example`

```bash
# 1. See the proposed additions (dry-run, default)
secretscope . --fix

# 2. Apply the proposal (writes to .env.example only)
secretscope . --fix --yes
```

The fixer:
- **only** edits `.env.example` (never `.env`, never `.gitignore`)
- **never** creates `.env.example` if it does not already exist
- **never** modifies Git state
- preserves the original content verbatim and appends a clearly marked section

### Exclude paths

```bash
secretscope . --exclude "**/generated/**" --exclude "**/*.config.js"
```

Default ignored directories: `node_modules`, `.git`, `dist`, `build`, `out`,
`coverage`, `.next`, `.nuxt`, `.svelte-kit`, `.turbo`, `.cache`, `.vitest`,
`vendor`, `target`.

### Programmatic API

```typescript
import { Scanner } from '@boodyzucks/secretscope';

const scanner = new Scanner();
const report = await scanner.scan({ root: process.cwd() });
console.log(report.summary);
```

---

## Example output (shape)

The console reporter groups findings by category. A run against a project with
one undocumented variable would produce output in this shape (format defined by
`src/reporters/console-reporter.ts`):

```
SecretScope v0.1.0 — scan report
Root: /path/to/project
Generated: 2025-01-01T00:00:00.000Z

Summary
  Files scanned:    12
  Env vars found:   5
  Code refs found:  8
  Findings:         1 (error: 0, warning: 1, info: 0)

Findings

  undocumented-env-var
    ⚠ ENV_VAR_UNDOCUMENTED
      .env:3
      Environment variable DATABASE_URL is defined in .env but missing from .env.example. ...
```

> Note: exact text and coloring depend on the reporter version and your terminal.

---

## CLI options

| Option | Description | Default |
|---|---|---|
| `[path]` | Project root (positional) | `process.cwd()` |
| `-r, --root <path>` | Project root (alias) | — |
| `-e, --exclude <pattern...>` | Additional glob exclusions | `[]` |
| `--max-file-size <bytes>` | Maximum bytes per file | `1048576` (1 MiB) |
| `-f, --format <format>` | `console`, `json`, or `sarif` | `console` |
| `-o, --output <path>` | Write the report to a file | stdout |
| `--strict` | Exit `1` on any finding | `false` |
| `-q, --quiet` | Suppress info logs | `false` |
| `--verbose` | Verbose logs | `false` |
| `--no-color` | Disable ANSI colors | auto-detect |
| `--fix` | Propose `.env.example` additions (dry-run) | `false` |
| `--yes` | Confirm `--fix` (write to disk) | `false` |
| `-V, --version` | Print version | — |
| `-h, --help` | Print help | — |

---

## Security

SecretScope is designed to never become a leak itself. Key invariants:

- **No raw secret values in any output** — enforced in `src/core/redactor.ts` and
  tested in `tests/security/no-leak.test.ts`.
- **No file writes without `--yes`** — the fixer never touches disk on its own.
- **No Git state modification** — no `git add`, `git rm`, no history rewriting.
- **No network access** — no telemetry, no API calls, no update checks.
- **Bounded file reads** — 1 MiB per file by default.

See [SECURITY.md](SECURITY.md) for the full security model and how to report issues.

---

## Known limitations (as of `0.1.0`)

- Detection is **high-precision by design**. Random long strings (entropy-based
  detection) are not scanned in this version.
- The code analyzer does not follow imports, does not do type checking, and does
  not handle casts (`process.env as X`), dataflow aliases, or computed keys.
- The tool assumes a typical Node/TypeScript project layout. Projects with unusual
  `.env` locations may need explicit `--root`.
- The `VERSION` constant in `src/core/scanner.ts` must be updated manually with
  `package.json` on each release.

---

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the module map, data flow, and
security invariants.

## Installation details

See [docs/INSTALLATION.md](docs/INSTALLATION.md) for prerequisites, source builds,
and Codespaces usage.

---

## Contributing

Bug reports, false-positive reports, and new secret-pattern proposals are welcome.
Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

MIT — see [LICENSE](LICENSE).

## Author

Boody Zucks