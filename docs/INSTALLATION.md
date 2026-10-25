# Installation

SecretScope is currently **pre-release**. There is no npm publication yet; install
from source for now.

## Prerequisites

- **Node.js ≥ 20** — verify with `node --version`.
- **npm ≥ 10** (bundled with Node 20).
- **Git** (optional) — enables the "tracked in Git" check. Without it, that check
  is skipped with a warning.
- A POSIX-like shell or PowerShell. Commands below work in both.

## From source (current method)

```bash
git clone https://github.com/boodyzucks/secretscope.git
cd secretscope
npm install
npm run build
```

After building, run the CLI directly:

```bash
node dist/cli/index.js --help
```

### Run without building

For development, use `tsx` (already a dev dependency):

```bash
npm run dev -- --help
npm run dev -- /path/to/project
```

The `--` separates npm's own arguments from the CLI's arguments. Everything after
`--` is forwarded to the CLI unchanged.

## From npm (once published)

> Not available yet. This section describes the intended behavior for `0.1.0`.

```bash
npm install -g @boodyzucks/secretscope
secretscope --help
```

Without a global install:

```bash
npx @boodyzucks/secretscope --help
```

## Using GitHub Codespaces (no local setup)

This is the fastest way to try SecretScope if you do not have a development
environment. It works from a mobile browser.

1. Open the repository on GitHub.
2. Click **Code → Codespaces → Create codespace on main**.
3. Wait for the environment to start.
4. In the integrated terminal:

```bash
npm install
npm run typecheck
npm test
node dist/cli/index.js --help
```

You can scan a sample project inside the codespace or clone your own project
into the workspace.

## Verifying the installation

A healthy setup satisfies all of the following:

```bash
# TypeScript type-checks cleanly
npm run typecheck

# Builds without errors
npm run build

# Help text is printed
node dist/cli/index.js --help

# Version matches package.json
node dist/cli/index.js --version
```

`npm test` runs the Vitest suite. This is not required for installation but is
recommended if you intend to modify the source.

## Common issues

### `Cannot find module` after `git clone`

You forgot `npm install` or `npm run build`. Run them in order.

### `EACCES` when installing globally

Your npm prefix is not writable. Either:
- Configure a user-level prefix (`npm config set prefix ~/.npm-global`) and add
  its `bin` to your `PATH`, or
- Use `npx @boodyzucks/secretscope` instead of a global install.

### `git` command not found during scan

The `.gitignore` tracking check is skipped with a warning. Install Git if you
want the check to run. No other part of SecretScope requires Git.

### Files are skipped with "too large"

The default per-file limit is 1 MiB. Override it:

```bash
node dist/cli/index.js . --max-file-size 5242880
```

Avoid raising this limit to very large values: the analyzer holds file content in
memory during analysis.

### SARIF file is rejected by GitHub Code Scanning

Ensure you pass a relative URI (GitHub expects paths relative to the repository
root). SecretScope emits relative URIs, so this only happens if you scan a path
outside the repository. Run the scan from the repository root.

## Uninstall

If you built from source, delete the cloned directory:

```bash
rm -rf secretscope
```

If you installed globally:

```bash
npm uninstall -g @boodyzucks/secretscope
```

SecretScope does not write outside its working directory. No residual config
files are left behind.