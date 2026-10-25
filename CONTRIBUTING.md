# Contributing to SecretScope

Thank you for your interest. This document explains how to contribute effectively
and which constraints are non-negotiable.

## Ways to contribute

- **Bug reports** — with a minimal, safe reproduction (no real secrets).
- **False positives / false negatives** — with the pattern and context.
- **New secret-detection rules** — see "Adding a secret rule" below.
- **Documentation fixes** — typos, clarity, translations.
- **Tests** — extra coverage is always welcome.

## Before you start

- For anything non-trivial, **open an issue first**. This avoids duplicated work
  and lets us agree on the approach.
- For security issues, **do not open a public issue.** See [SECURITY.md](SECURITY.md).

## Development setup

```bash
git clone https://github.com/boodyzucks/secretscope.git
cd secretscope
npm install
npm run typecheck
npm run build
npm test
```

If `npm test` produces failures, please include the full output in your PR
description or in a follow-up issue.

### Scripts

| Command | Purpose |
|---|---|
| `npm run build` | Compile to `dist/` (ESM + declarations) |
| `npm run dev -- <args>` | Run the CLI from TypeScript sources |
| `npm run typecheck` | Type-check with `tsc --noEmit` |
| `npm run lint` | ESLint over `src`, `tests` |
| `npm test` | Run the Vitest suite |

## Code style

- TypeScript strict mode is enabled. Do not weaken it.
- Prefer small, pure functions with explicit types.
- Keep modules focused. If a file exceeds ~300 lines, consider splitting.
- No new runtime dependencies without discussion in an issue.
- ESM only. Local imports end in `.js` even from `.ts` sources.

## Non-negotiable invariants

These are enforced by tests and must not be relaxed without a design discussion
and an update to the security model in `SECURITY.md`.

1. **Raw secret values must never appear in any output.** Any new reporter or
   log path must pass values through `maskValue()` from `src/core/redactor.ts`.
2. **The fixer must not write to disk.** `src/fixers/env-example-fixer.ts`
   computes proposals only. Any I/O stays in `src/cli/index.ts`.
3. **No modification of Git state.** Never call `git add`, `git rm`,
   `git checkout`, or any mutating Git command.
4. **No network access.** No telemetry, no update checks, no external API calls.
5. **Size limits are respected.** All file reads must go through
   `readTextFile()` from `src/utils/fs-safe.ts`.

If a change requires breaking an invariant, open an issue first and wait for
maintainer agreement.

## Adding a secret-detection rule

Rules live in `src/rules/secrets.ts`.

Requirements for a new rule:

1. **High precision.** The pattern must match a specific, documented token format.
   Generic "long random string" rules are out of scope for `0.1.x`.
2. **No overlap with existing rules.** Use negative lookaheads if needed (see the
   OpenAI rule that excludes the Anthropic prefix).
3. **No capture groups** unless strictly necessary, and if you add one, set
   `valueGroup` explicitly.
4. **Severity** is `'error'` unless there is a strong reason for `'warning'`.
5. **Add a test** in `tests/security/no-leak.test.ts` or
   `tests/unit/secret-scanner.test.ts` proving that a matched value is masked.

## Pull request process

1. Fork the repository and create a branch from `main`.
2. Make your change with focused commits.
3. Update documentation if behavior changes.
4. Add or update tests as appropriate.
5. Run `npm run typecheck && npm run lint && npm test` locally. If any step
   fails, do not open the PR yet.
6. Open the PR using the template. Describe the **why**, not just the **what**.

## Commit messages

Use short, imperative commit subjects. A conventional-commit prefix is preferred
but not required:

```
feat(parser): handle escaped quotes in double-quoted values
fix(sarif): correct ruleIndex for escalated severity
docs(readme): clarify --fix dry-run behavior
test(redactor): add boundary test for 15-char values
```

## Reviewing

- Be specific and kind.
- Discuss code, not people.
- If you disagree with a design choice, cite the invariant or the user problem it
  solves.

## Licensing of contributions

By submitting a pull request, you agree that your contribution is licensed under
the same MIT license as the project (see [LICENSE](LICENSE)).

## Code of conduct

This project follows the [Contributor Covenant, version 2.1][coc]. By
participating, you are expected to uphold this code. Report unacceptable
behavior to the maintainer via the contact method described in
[SECURITY.md](SECURITY.md).

[coc]: https://www.contributor-covenant.org/version/2/1/code_of_conduct/