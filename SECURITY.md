# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅ Yes     |
| < 0.1   | ❌ No      |

Version `0.1.x` is pre-release. Security fixes will be applied on the `main`
branch. There are no long-term-support branches yet.

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Use GitHub's private vulnerability reporting for this repository:

1. Go to the **Security** tab of the repository.
2. Click **Report a vulnerability**.
3. Describe the issue, including steps to reproduce.

If GitHub Security Advisories is unavailable for any reason, open a minimal
public issue that says "security issue — please contact" **without including
any details or secret material**, and a maintainer will reach out.

### What to include

- A clear description of the issue.
- A minimal reproduction: repository layout, `.env` content (dummy values only,
  **never real secrets**), and the command you ran.
- Expected vs actual behavior.
- The version of SecretScope, Node.js, and the operating system.

### What NOT to include

- **Real secret values.** Use obviously fake placeholders such as
  `AKIAIOSFODNN7EXAMPLE` or `sk_test_...`. If a leak is required to
  demonstrate the issue, generate a throwaway credential that you have
  already revoked or that has no permissions.

## Response process

This is a single-maintainer project. Realistic timelines:

- **Acknowledgment:** within 7 days.
- **Initial assessment:** within 14 days.
- **Fix for confirmed high-severity issues:** target 30 days, best-effort.

These are intentions, not contractual SLAs.

## Security model

SecretScope is designed to fail safe and to never become a leak itself.

### Guarantees

The following properties are enforced by code and by dedicated tests in
`tests/security/`:

1. **No raw secret values in output.** Every matched secret passes through
   `maskValue()` before being placed in any `Finding`. This covers the console
   reporter, the JSON reporter, and the SARIF reporter.
2. **No file writes without explicit consent.** `proposeFix()` is a pure
   function. Writing to `.env.example` happens only in the CLI, and only when
   both `--fix` and `--yes` are present.
3. **No modification of Git state.** SecretScope never runs `git add`,
   `git rm`, `git checkout`, or any command that changes the repository.
4. **No network access.** SecretScope does not send telemetry, does not check
   for updates, and does not call any external API.
5. **Bounded file reads.** Each file is read up to `--max-file-size` bytes
   (default 1 MiB). Larger files are skipped with a warning.

### Non-guarantees

These are **not** claimed:

1. **100% detection.** SecretScope uses a small set of high-precision patterns.
   It will not find every secret. Use it alongside Gitleaks, TruffleHog, or
   similar tools.
2. **Zero false positives.** Known false-positive sources exist, for example a
   locally shadowed variable literally named `process` with an `env` property.
   The analyzer is AST-based, not type-checked.
3. **Full coverage of `.env` syntax.** The parser handles the common cases
   (comments, `export`, quoting, multi-line quoted values, CRLF, BOM). Unusual
   syntax (e.g., variable expansion) is not interpreted.
4. **Compliance or certification.** SecretScope has not been audited by a third
   party and does not claim SOC 2, ISO 27001, or any other certification.

### Threat model summary

SecretScope assumes:
- The user's filesystem is trusted.
- The user's shell and Node.js runtime are trusted.
- The repository content may be adversarial (secrets planted by an attacker,
  malicious `.env` content, symlinks), and the tool must not crash, must not
  write outside the project, and must not leak any secret it detects.

SecretScope does **not** assume:
- That `.env` is safe to commit.
- That `.gitignore` is correctly configured.
- That CI runners are trusted beyond the standard GitHub Actions model.

## Dependency policy

- All runtime dependencies are pinned to a major version range in `package.json`.
- New dependencies are reviewed for license compatibility (MIT-compatible) and
  for transitive dependency count.
- Dependabot alerts are monitored for this repository. If you notice an
  unaddressed alert older than 30 days, please open an issue.

## Out of scope

The following are **not** treated as vulnerabilities:

- A false negative in secret detection (a limitation, not a vuln).
- A false positive that can be dismissed by the user.
- Report output containing a **masked** value (this is intended behavior).
- Warnings printed to stderr (they are always safe to log).